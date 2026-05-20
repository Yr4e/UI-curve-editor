const fs = require('node:fs')
const path = require('node:path')

const source = path.resolve(
  'C:/Users/yr4e/Desktop/inputlag assets/06_InputLag_Versions/Source_Projects/inputlag.ai-main_old_render_project/renderer/dist',
)
const target = path.resolve(__dirname, '..', 'public', 'inputlag-preview')

if (!fs.existsSync(source)) {
  console.warn(`[copy-inputlag-preview] skipped, missing ${source}`)
  process.exit(0)
}

fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(target, { recursive: true })
fs.cpSync(source, target, { recursive: true })
console.log(`[copy-inputlag-preview] copied ${source} -> ${target}`)
