# AGENTS.md — dsh-text-editor

面向后续 AI 代理（以及接手维护者）的工程说明。目标：让任何新会话不读完整源码也能安全改动、构建、调试这个插件。README.md 讲「是什么」，本文件讲「怎么改、注意什么、常见坑」。

## 项目是什么（30 秒版）

DSH Web GUI 里的应用内文本编辑器插件（Monaco，VSCode 同款）。当用户在会话中点击
「产物」链接（会话完成时最后一条消息底部的文件 chips），或 read / write / edit
工具卡片摘要里的文件路径链接时，不再交给操作系统打开，而是在 DSH 内一个叫
**「文件」** 的会话标签页（与「对话」「轨迹」并排）里用 Monaco 打开，可编辑并可
「保存」回磁盘（写入受会话沙箱策略约束）。标签带关闭按钮 ×。

## 两个半部（重要）

- **宿主半部 `index.ts`**：跑在 DSH Node 进程内，Node 22 Type Stripping 直接加载，
  不需要编译。注册三条 HTTP 路由：
  - `GET /dsh-text-editor/read?path=&cwd=` 读文件（走 `ctx.fs`，`~` 展开，>2MB 截断）
  - `POST /dsh-text-editor/write` 保存（按会话解析 sandboxPolicy）
  - `GET /dsh-text-editor/monaco/*` 托管本地 Monaco 发行版（有目录穿越防护）
  - 硬依赖 `webServer`、`fs`（由 `cordis.patch.yml` 挂载行的 `inject` 声明）。
- **浏览器半部 `src/client.ts`**（真源）→ `scripts/build-client.mjs` 编译为 CJS 并
  包进 `window.__ModuleLoader__.load(...)` → **`lib/client.js`**（产物，勿手改）。
  负责：注册 `conversation.view` 的「文件」标签、挂 `conversation.session.header.actions`
  拦截器捕获文件链接点击、懒加载 Monaco、渲染并保存。

## 构建 / 验证（每次改代码后的标准流程）

```bash
cd ~/.dsh/dsh-text-editor
npm run typecheck          # tsc --noEmit：index.ts + src/client.ts
npm run build              # 改 src/client.ts 后必须执行；重新生成 lib/client.js
npm run check              # node --check lib/client.js && node --check index.ts
```

改 `src/client.ts` 后**必须 `npm run build`**——浏览器不跑 Type Stripping，直接读
`lib/client.js`。`/plugins/dsh-text-editor/client.js` 路由实时读磁盘，所以**只改客户端**
刷新页面（Cmd/Ctrl+Shift+R）即可生效，无需重启服务器。**改 `index.ts` 或挂载配置
（profile 的 cordis.patch.yml / package.json）才需要重启 `dsh web`。**

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
3. **宿主 `MONACO_ROOT` 的路径基准**：`fileURLToPath(new URL('./vendor/monaco/',
   import.meta.url))` 用的是 **`./`**（相对 `index.ts` 所在目录）。曾误用 `../`，
   解析成 `~/.dsh/vendor/monaco` 导致 404。
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

## 常用文件地图

| 文件 | 作用 |
| --- | --- |
| `index.ts` | 宿主半部：read/write/monaco 路由 |
| `src/client.ts` | 浏览器半部真源（TypeScript） |
| `lib/client.js` | 编译产物（勿手改，改 src 后 build） |
| `scripts/build-client.mjs` | client 编译+ModuleLoader 包装 |
| `tsconfig.json` / `tsconfig.build.json` | 类型检查 / client 编译配置 |
| `cordis.patch.yml` | 挂载行声明（宿主 inject） |
| `vendor/monaco/` | 本地 Monaco 发行版 |
| `package.json` | `dsh.client.platform/immediately/external`、scripts、devDeps |
