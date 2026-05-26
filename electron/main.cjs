const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const { existsSync } = require('node:fs')
const { spawn } = require('node:child_process')

const sanitizeName = (value) => String(value || 'curvy-render').replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').slice(0, 80)

const run = (command, args, cwd) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd, windowsHide: true })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
  child.on('error', reject)
  child.on('close', (code) => {
    if (code === 0) resolve()
    else reject(new Error(stderr || `${command} exited with ${code}`))
  })
})

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const captureFramePng = async (webContents, rect, scale) => {
  const renderScale = Math.max(1, Math.min(Number(scale) || 1, 3))
  if (renderScale === 1 || !rect) {
    return webContents.capturePage(rect).then((image) => image.toPNG())
  }

  let attachedHere = false
  try {
    if (!webContents.debugger.isAttached()) {
      webContents.debugger.attach('1.3')
      attachedHere = true
    }
    const result = await webContents.debugger.sendCommand('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
      clip: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        scale: renderScale,
      },
    })
    return Buffer.from(result.data, 'base64')
  } finally {
    if (attachedHere && webContents.debugger.isAttached()) {
      webContents.debugger.detach()
    }
  }
}

app.setAppUserModelId('ai.inputlag.render-studio')

const singleInstanceLock = app.requestSingleInstanceLock()
if (!singleInstanceLock) {
  app.quit()
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1720,
    height: 980,
    minWidth: 1280,
    minHeight: 760,
    title: 'InputLag Render Studio',
    backgroundColor: '#00000000',
    transparent: true,
    frame: true,
    resizable: true,
    thickFrame: true,
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  win.once('ready-to-show', () => win.show())
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1280,
          height: 800,
          autoHideMenuBar: true,
          backgroundColor: '#05070b',
        },
      }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(createWindow)

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

ipcMain.on('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.on('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})

ipcMain.on('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.handle('render:mov', async (event, payload = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { ok: false, error: 'No active editor window' }

  const project = payload.project || {}
  const fps = Math.max(1, Math.min(Number(project.fps) || 60, 120))
  const duration = Math.max(0.1, Math.min(Number(project.duration) || 6, 90))
  const frameCount = Math.max(1, Math.ceil(duration * fps))
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const renderRoot = path.join(app.getPath('desktop'), 'inputlag assets', 'render-studio-exports')
  const outDir = path.join(renderRoot, `${stamp}-${sanitizeName(project.name)}`)
  const framesDir = path.join(outDir, 'frames')
  await fs.mkdir(framesDir, { recursive: true })

  const bounds = win.getBounds()
  const rect = payload.rect
    ? {
        x: Math.max(0, Math.round(payload.rect.x)),
        y: Math.max(0, Math.round(payload.rect.y)),
        width: Math.min(bounds.width, Math.max(64, Math.round(payload.rect.width))),
        height: Math.min(bounds.height, Math.max(64, Math.round(payload.rect.height))),
      }
    : undefined

  for (let index = 0; index < frameCount; index += 1) {
    const time = Math.min(duration, index / fps)
    event.sender.send('render:set-time', time)
    await delay(index === 0 ? 180 : 90)
    const png = await captureFramePng(win.webContents, rect, payload.renderScale)
    const file = path.join(framesDir, `frame-${String(index).padStart(5, '0')}.png`)
    await fs.writeFile(file, png)
  }

  const output = path.join(outDir, `${sanitizeName(project.name)}.mov`)
  const inputPattern = path.join(framesDir, 'frame-%05d.png')
  await run('ffmpeg', [
    '-y',
    '-framerate', String(fps),
    '-i', inputPattern,
    '-c:v', 'prores_ks',
    '-profile:v', '4',
    '-vendor', 'apl0',
    '-pix_fmt', 'yuva444p10le',
    '-bits_per_mb', '8000',
    output,
  ], outDir)

  if (!existsSync(output)) return { ok: false, error: 'MOV was not created' }
  shell.showItemInFolder(output)
  return { ok: true, output }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
