const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('curvy', {
  renderMov: (payload) => ipcRenderer.invoke('render:mov', payload),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  onRenderSetTime: (callback) => {
    const listener = (_event, time) => callback(time)
    ipcRenderer.on('render:set-time', listener)
    return () => ipcRenderer.removeListener('render:set-time', listener)
  },
})

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.desktop = 'electron'
})
