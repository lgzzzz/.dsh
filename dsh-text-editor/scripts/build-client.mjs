/**
 * 构建浏览器半部（产物：lib/client.js —— 单文件自包含 bundle）。
 *
 * 步骤：
 * 1) 用 esbuild 把 src/client.ts 连同其相对 import 的模块打包成单文件
 *    （bundle: true）；仅 react 声明为 external（由 DSH ModuleLoader 的
 *    模块表提供，不重复打包）。
 * 2) 把产物包进 window.__ModuleLoader__.load({ id, factory }) 写回 lib/client.js
 *
 * 为什么必须打包成单文件：浏览器不跑 Node Type Stripping，且 DSH 的
 * ModuleLoader 只按模块 id（external，如 react / 其他插件）解析 require，
 * 不支持相对路径——拆多文件的源码必须在此合并回一份自包含产物。
 */
import { buildSync } from 'esbuild'
import { writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const loaderId = 'dsh-text-editor'
const outFile = join(root, 'lib', 'client.js')

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

const result = buildSync({
  entryPoints: [join(root, 'src', 'client.ts')],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2019',
  // react 来自 DSH ModuleLoader 的模块表（package.json 的 dsh.client.external）。
  external: ['react'],
  write: false,
})
const compiled = result.outputFiles[0].text
const wrapped =
  'window.__ModuleLoader__.load({ id: ' + JSON.stringify(loaderId) + ", factory: (require) => {\n" +
  'var module = { exports: {} }; var exports = module.exports;\n' +
  compiled +
  'return module.exports; } });\n'

writeFileSync(outFile, wrapped)
console.log(`built ${outFile}（esbuild 打包，${compiled.length} 字节）`)
