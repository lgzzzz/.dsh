/**
 * 构建浏览器半部：
 * 1) 用 tsc 把 src/client.ts 编译为 CommonJS（到 .build/）
 * 2) 把编译产物包进 window.__ModuleLoader__.load({ id, factory }) 写回 lib/client.js
 * 3) 清理 .build
 *
 * 浏览器不跑 Node Type Stripping，因此必须产出纯 JS 的 lib/client.js。
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const loaderId = 'dsh-text-editor'
const outFile = join(root, 'lib', 'client.js')
const buildDir = join(root, '.build')

// 铺 Monaco 发行版到 vendor/monaco：优先用 node_modules 里 monaco-editor 的
// min/vs（npm 依赖，仓库不存 13MB）；本地已有 vendor 则跳过。
// 该目录不入 git（见插件 .gitignore），首次 build 自动生成。
const monacoPkg = join(root, 'node_modules', 'monaco-editor', 'min', 'vs')
const monacoVendor = join(root, 'vendor', 'monaco')
if (!existsSync(join(monacoVendor, 'loader.js'))) {
  if (!existsSync(join(monacoPkg, 'loader.js'))) {
    throw new Error(
      'Monaco 发行版缺失：vendor/monaco 不存在，且 node_modules/monaco-editor 也未安装。' +
      '请先执行 npm install（安装 monaco-editor 依赖）。',
    )
  }
  mkdirSync(monacoVendor, { recursive: true })
  cpSync(monacoPkg, monacoVendor, { recursive: true })
  console.log('vendored monaco → ' + monacoVendor)
}

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
