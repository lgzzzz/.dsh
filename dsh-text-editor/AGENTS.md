# AGENTS.md — dsh-text-editor

面向后续 AI 代理（以及接手维护者）的工程说明。目标：让任何新会话不读完整源码也能安全改动、构建、调试这个插件。README.md 讲「是什么」，本文件讲「怎么改、注意什么、常见坑」。

## 项目是什么（30 秒版）

DSH Web GUI 里的应用内文本编辑器插件（Monaco，VSCode 同款）。当用户在会话中点击
「产物」链接（会话完成时最后一条消息底部的文件 chips），或 read / write / edit
工具卡片摘要里的文件路径链接时，不再交给操作系统打开，而是在 DSH 内一个叫
**「文件」** 的会话标签页（与「对话」「轨迹」并排）里用 Monaco 打开，可编辑并可
「保存」回磁盘（写入受会话沙箱策略约束）。标签带关闭按钮 ×。

## 两个半部（重要）

- **宿主半部 `index.ts`**：跑在 DSH Node 进程内，Node 22+ Type Stripping 直接加载，
  不需要编译。**只是薄入口**：从 ctx 取服务后装配三条 HTTP 路由；实现按功能拆在
  `host/` 目录（read / write / monaco / http / types），`index.ts` 用 `.ts` 扩展名
  import 它们（Node 直接解析）：
  - `GET /dsh-text-editor/read?path=&cwd=` 读文件（走 `ctx.fs`，`~` 展开，>2MB 截断）
  - `POST /dsh-text-editor/write` 保存（按会话解析 sandboxPolicy）
  - `GET /dsh-text-editor/monaco/*` 托管本地 Monaco 发行版（有目录穿越防护）
  - 硬依赖 `webServer`、`fs`（由 `cordis.patch.yml` 挂载行的 `inject` 声明）。
- **浏览器半部 `src/`**（真源，按职责拆模块，入口 `src/client.ts`）→
  `scripts/build-client.mjs` 用 **esbuild** 打包成单文件（bundle，仅 `react` 为
  external）并包进 `window.__ModuleLoader__.load(...)` → **`lib/client.js`**
  （产物，勿手改）。负责：注册 `conversation.view` 的「文件」标签、挂
  `conversation.session.header.actions` 拦截器捕获文件链接点击、懒加载 Monaco、
  渲染并保存。模块图（单向无环）：
  `client.ts → controller → ui → {state, monaco, path, routes, commands}`；
  ui 的「动作」经 `commands.ts` 命令总线触发，避免与 controller 成环。

## 构建 / 验证（每次改代码后的标准流程）

```bash
cd ~/.dsh/dsh-text-editor
npm run typecheck          # tsc --noEmit：index.ts + host/*.ts + src/*.ts
npm run build              # 改 src/ 下任何文件后必须执行；esbuild 打包出 lib/client.js
npm run check              # node --check lib/client.js && index.ts + host/*.ts
```

改 `src/` 下任何文件后**必须 `npm run build`**——浏览器不跑 Type Stripping，直接读
`lib/client.js`（esbuild 把 `src/client.ts` 连同其相对 import 的模块打包成单文件，
仅 `react` 为 external）。`/plugins/dsh-text-editor/client.js` 路由实时读磁盘，所以
**只改客户端**刷新页面（Cmd/Ctrl+Shift+R）即可生效，无需重启服务器。**改 `index.ts`
或 `host/*.ts` 或挂载配置（profile 的 cordis.patch.yml / package.json）才需要重启
`dsh web`。**

## 部署位置与挂载

- 插件本体：`~/.dsh/dsh-text-editor/`
- 挂载：web profile
  - `~/.dsh/profiles/web/package.json`：dependencies 里 `"dsh-text-editor": "link:/Users/lz/.dsh/dsh-text-editor"`，`dsh.profile.bundles` 里加 `"dsh-text-editor"`
  - `~/.dsh/profiles/web/cordis.patch.yml`：`- id: dsh-text-editor\n  name: dsh-text-editor\n  inject: [webServer, fs]`
  - 依赖变更后 `cd ~/.dsh/profiles/web && pnpm install`
- 重启 `dsh web`：`bash ~/stop-dsh-web.sh && bash ~/start-dsh-web.sh`
  （若 agent 自身跑在 dsh web 进程内，重启会杀掉当前回合：用
  `python3 -c "import os; os.setsid(); os.execvp('bash',['bash','/tmp/dsh-text-editor-restart.sh','30'])"`
  这种分离延迟重启包装脚本，先交付说明再触发。macOS 没有 `setsid` 命令。）

## 验证服务器/插件状态

```bash
cat ~/.dsh-web.pid                                   # 当前 dsh web PID
curl -s -o /dev/null -w "%{http_code} %{size_download}B\n" \
  http://127.0.0.1:3080/plugins/dsh-text-editor/client.js   # 客户端 bundle
curl -s -o /dev/null -w "%{http_code} %{size_download}B\n" \
  http://127.0.0.1:3080/dsh-text-editor/monaco/loader.js     # Monaco 静态
curl -s "http://127.0.0.1:3080/dsh-text-editor/read"         # 期望 400 missing "path"
```

## 关键坑（务必先读，都是踩过的）

1. **客户端必须声明 `inject: ['slots']`**（`src/client.ts` 顶部 `export const inject`）。
   不声明时加载器不等待 `slots` 服务就绪就 apply，`ctx.get('slots')` 返回
   `undefined`，若用 `=== null` 判断会漏掉，随后 `slotsRef.inject(...)` 抛
   `Cannot read properties of undefined (reading 'inject')`，导致 **web 启动失败、
   插件在 HARNESS 面板报 failed to apply loader entry**。用
   `slotsRef === null || slotsRef === undefined` 双判断。
2. **Monaco API 入口在 `monaco.editor` 下**：`monaco.editor.create(el, opts)`、
   `monaco.editor.setTheme(t)`、`monaco.editor.setModelLanguage(model, lang)`。
   直接 `monaco.create(...)` 会报 `monaco.create is not a function`。
3. **宿主 `MONACO_ROOT` 的路径基准**：定义在 `host/monaco.ts`，用
   `fileURLToPath(new URL('../vendor/monaco/', import.meta.url))`——**`../`** 是
   相对 `host/` 目录（host/monaco.ts 在仓库根的下一层）。曾误用 `./`（相对
   index.ts 所在目录时才是 `./`），解析成 `~/.dsh/host/vendor/monaco` 导致 404。
   移动这个文件时务必同步改基准。
4. **`inject` 是挂载行配置**，不是模块导出：宿主硬依赖写进
   `cordis.patch.yml` 行的 `inject: [webServer, fs]`，模块里不再 `export inject`。
   客户端反之——客户端 `inject` 必须 `export const inject = [...]`（由加载器从
   插件对象读取）。
5. **`ctx.get(...)` 优先，且必须处理 undefined**：宿主用
   `ctx.get('fs')/ctx.get('webServer')`，缺失时静默 return（降级）；不要直接当
   ctx 属性访问，除非已在 `inject` 声明。
6. **产物 chips / 工具链接的 selector**（改了 DSH 上游 DOM 需复查）：
   - chips：`[data-produced-files-row] button[title]`（title=完整路径）
   - 工具卡片：`[data-tool="read"|"write"|"edit"] button[class*="_fileLink"]`
     （文本为展示路径：cwd 相对 / 绝对 / `~` 开头）
7. **读写路径解析**：`~` 展开为宿主主目录；相对路径按会话 cwd 解析
   （拦截器经 `useSessions` 取 `s.byId[sessionId].cwd`）；保存按会话沙箱策略，
   工作区外写入被 `fs` 拒绝（HTTP 403，状态栏显示错误）。
8. **文件沙箱**：向 `~/.dsh/` 写文件需 danger-full-access（已授权）；系统提示若
   声明 approval=never 就不要设置 sandbox_permissions。
9. **Monaco 发行版**：`vendor/monaco/`（约 13MB）来自 monaco-editor 0.52.2
   npm tgz，本地托管保证离线；改动用 /tmp 里的原始下载（`/tmp/monaco-dl/`）重铺。
10. **fire/mount 顺序**：客户端注册「文件」标签是**惰性**的——首次点击文件链接才
    `ensureTab()` 注册并 `activateTab()` 点选；关闭按钮走 `closeEditor()`（注销 + 点
    当前选中标签回落 chat）。改这些逻辑时保持 store（`fileState`/`listeners`/`loadSeq`）
    的模块级单例模式。
11. **标签 label 是 React 元素，不是字符串**：DSH 渲染 tab 时用
    `resolveSlotLabel(entry.options.label)`（函数则调用、否则原样返回），返回值直接当
    标签 `<button role="tab">` 的 children。`ensureTab()` 里 `label` 返回
    `React.createElement(TabLabel, null)`——`TabLabel` 是真实 React 组件，用
    `useSyncExternalStore(subscribe, getState)` 反应式显示**被打开文件的 basename**
    （不再固定显示「文件」；无文件时回落 FILE_TAB_LABEL），并带 × 关闭按钮。注意：
    - × 用 `<span role="button">` 而非 `<button>`（标签本身是 button，嵌套 button
      无效 HTML）；其 onClick 必须 `event.stopPropagation()`，否则冒泡触发外层 tab 的
      setView 切标签。
    - 因此 `activateTab()` 不能用 `textContent === '文件'` 精确匹配，要用
      `document.querySelector('.dsh-te-tab-label').closest('[role="tab"]')` 定位。
    - 用组件而非「重注册」来刷新标签：slots 的 `register` 对相同 `id` 重复注册会抛错，
      且重注册有 FileView 重挂载（Monaco 重载）风险。`TabLabel` 订阅 fileState 后，
      打开新文件只需 setState 触发 emit，标签文字自动更新，无需父级标签栏重渲染。
    - 工具栏里已**不再有**关闭按钮（2025-08：关闭交互只放标签上），别加回去。

## 常用文件地图

| 文件 | 作用 |
| --- | --- |
| `index.ts` | 宿主半部薄入口：取服务 + 装配三条路由 |
| `host/read.ts` | 宿主：GET /read 读文件（truncate / binary 检测） |
| `host/write.ts` | 宿主：POST /write 保存（按会话解析 sandboxPolicy） |
| `host/monaco.ts` | 宿主：/monaco/* 静态托管（目录穿越防护） |
| `host/http.ts` | 宿主：JSON 响应 / 请求体解析 / `~` 展开 |
| `host/types.ts` | 宿主：用到的 DSH 服务最小面类型 |
| `src/client.ts` | 浏览器半部入口（inject / apply / CSS 注入） |
| `src/controller.ts` | 浏览器：标签生命周期 + 打开/读取/保存/关闭 编排 |
| `src/ui.ts` | 浏览器视图层：TabLabel / FileView / MonacoHost / Interceptor |
| `src/monaco.ts` | 浏览器：Monaco AMD 加载封装 + 编辑器实例单例 |
| `src/state.ts` | 浏览器：文件状态 store |
| `src/commands.ts` | 浏览器：UI → 编排层的命令总线（破环） |
| `src/routes.ts` | 浏览器：与宿主约定的 URL 常量与响应类型 |
| `src/path.ts` | 浏览器：basename / 扩展名 → language id |
| `src/css.ts` | 浏览器：编辑器样式 |
| `lib/client.js` | esbuild 产物（勿手改，改 src 后 build） |
| `scripts/build-client.mjs` | esbuild 打包 + ModuleLoader 包装 |
| `tsconfig.json` | 两端类型检查（noEmit，允许 .ts 扩展名 import） |
| `cordis.patch.yml` | 挂载行声明（宿主 inject） |
| `vendor/monaco/` | 本地 Monaco 发行版 |
| `package.json` | `dsh.client.platform/immediately/external`、scripts、devDeps |
