/**
 * 构建浏览器半部：
 * 1) 用全局 tsc 把 src/client.ts 编译为 CommonJS（到 .build/）
 * 2) 把编译产物包进 window.__ModuleLoader__.load({ id, factory }) 写回 lib/client.js
 * 3) 清理 .build
 *
 * 浏览器不跑 Node Type Stripping，因此必须产出纯 JS 的 lib/client.js。
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const loaderId = 'dsh-kbd-nav-focus'
const outFile = join(root, 'lib', 'client.js')
const buildDir = join(root, '.build')

rmSync(buildDir, { recursive: true, force: true })
mkdirSync(buildDir, { recursive: true })

execSync('tsc -p tsconfig.build.json', { cwd: root, stdio: 'inherit', shell: true })

const compiled = readFileSync(join(buildDir, 'client.js'), 'utf8')
const wrapped =
  'window.__ModuleLoader__.load({ id: ' + JSON.stringify(loaderId) + ", factory: (require) => {\n" +
  'var module = { exports: {} }; var exports = module.exports;\n' +
  compiled +
  'return module.exports; } });\n'

writeFileSync(outFile, wrapped)
rmSync(buildDir, { recursive: true, force: true })
console.log('built ' + outFile)
