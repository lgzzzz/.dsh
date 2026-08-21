# dsh-kbd-nav-focus — Agent 备忘（分析记录，供以后复用）

本文件记录在维护/扩展本插件过程中沉淀的关键分析结论，供后续 Agent 快速复用。
**改 `src/client.ts` 后必须重新 build，且插件为常驻挂载、需重启 App 生效。**

## 这是什么

- 浏览器半部"键盘焦点导航"插件（对应动态插件 `kbdn-2`，重启后替代其功能）。
- **唯一真源**：`src/client.ts`（TypeScript）。`lib/client.js` 是生成物，由
  `scripts/build-client.mjs` 用 `tsc` 编译为 CommonJS 后包进
  `window.__ModuleLoader__.load({ id, factory })` 写入。**不要手改 lib/client.js**。
- 加载方式：`profiles/web/cordis.patch.yml` 注册 + `dsh.client.platform=web` + `dsh.bundle.patch`。
- **不做热重载**：常驻挂载，改动后需重启 App。

## 构建 / 验证

```bash
# 全局 tsc 可能不可用（本目录曾装过本地 typescript，node_modules 已 gitignore）
# 若 node_modules 丢失：npm install --no-save --cache <workspace-local-cache> typescript@^5.8
npm run typecheck   # tsc --noEmit -p tsconfig.json
npm run build       # node scripts/build-client.mjs → 重新生成 lib/client.js
node --check lib/client.js   # 产物语法检查（重要：浏览器不跑 Type Stripping）
```

- 冒烟测试惯例：把要验证的算法（`pick`/`move`/`scrollContainerOf`/`reanchorAfterLayout`/按键分发）
  镜像成独立 Node 脚本 + mock DOM（同步 rAF / 模拟惰性渲染钩子），跑断言后删除临时文件。

## 当前按键绑定（改键前先看这里）

| 按键 | 语义 |
| --- | --- |
| Alt+Shift | 进入导航模式；**已进入时再次按 Alt+Shift 只把光标重置到侧边栏选中会话行（不再退出）**；**退出仅由 S 键在触发会话选择后完成** |
| ↑↓←→ | 几何方向移动焦点；上下严格同列（水平重叠硬过滤），左右允许斜向；**输入框（textarea/input/contenteditable/role=textbox|searchbox|combobox）不在移动路径内**（`isInputLike` 排除） |
| **C**（大小写均可） | click：对当前高亮元素左键点击（`e.repeat` 守卫不连发） |
| **S**（大小写均可） | select：**只对会话列表中的会话**生效 → 点击该会话行切换 + 退出导航 + 焦点回输入框；不在会话上无动作 |
| 其它所有键（含其它字母、Esc/Enter/空格/Tab） | 均未绑定动作，忽略（停留导航模式），事件被消费 |

历史演进：最早"任意字母=点击、任意非字母非方向键=退出+回输入框"；后改为 C/S 专用键，
再改为非字母非方向键也不绑定；再后（本轮）**Alt+Shift 不再退出**——已进入时仅把光标重置回
起点（`resetMode()`），**退出仅由 S 键在触发会话选择后完成**（S 路径：`clickElement` →
`exitMode` → `focusComposer`）；再后：**输入框移出移动路径**（`isInputLike` 在
`focusables()` 里排除 textarea/input/contenteditable/role=textbox|searchbox|combobox）。
**改键时注意 `onKeyDown` 的捕获分发结构与头部注释/README 同步。**

## 关键分析一：可滚动 UI 内的焦点移动（滚动策略）

目标：在可滚动 UI（侧边栏会话列表、聊天消息区）里移动焦点时，**光标不提前跳出当前 UI**，
能靠滚动到达 UI 内任意位置；但 UI 走尽后仍能跳出到其它面板。

`move(dir)` 三步走：
1. **优先在当前可滚动容器内就近选点**（`pick(dir, scope, cur)`，scope 之外候选忽略）；
   视口外目标由 `goto()` 的 `scrollIntoView({block:'nearest'})` 滚动容器带进视野。
2. **该方向在容器内走尽** → 先把容器滚动一整页（`scrollPage`）看是否出现新内容（惰性渲染）；
   没有则复原滚动位置。
3. **仍无候选** → 回退到整页就近选点（`pick(dir, null, cur)`），**允许跳出 UI**。

### 关键坑（务必记住）：`overflow-y:auto` 的容器会"骗过"横向判定

CSS 规范：若 `overflow-x` 为 `visible` 而 `overflow-y` 非 `visible`，则 `overflow-x` 计算值
会变成 `auto`。因此一个纵向列表（`overflow-y:auto`）的 `getComputedStyle().overflowX` 是
`auto`，若只按 overflow 值判断，**左右方向也会被锁在这个纵向列表里**（用户曾报"无法按左右跳出"）。

修复：`scrollContainerOf(el, axis)` 只认**该方向实际溢出**的容器：
```ts
const overflowing = axis === 'y'
  ? node.scrollHeight > node.clientHeight
  : node.scrollWidth > node.clientWidth;
// 仅当 overflowing 时才返回该容器
```

### DSH 侧 DOM 事实（查证过）

- 侧边栏会话列表容器：`overflow-y:auto`（workspace 包，类 `qDHVXG_flatList` / `qDHVXG_searchTree`）。
- 聊天消息区：`overflow-y:auto`，元素 `[data-conversation-scroll]`。
- 布局外层 frame/centerCol 是 `overflow:hidden`；会话列表本身**不虚拟化**（全部节点在 DOM）。
- 包位置：`<dsh>/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js` 等。

## 关键分析二：点击"展开其余 N 个会话"后光标跳过新会话（重新锚定）

现象：光标在"展开其余 N 个会话"按钮上 → 点击展开 → 再按 ↓ **直接跳过刚展开的会话列表**。

根因：展开按钮渲染在**会话行之后**（`.groupSection` 子节点顺序：组头 → 会话行
`slice(0, COLLAPSED_SESSION_LIMIT)` → `<button class="sessionOverflowButton">`）。
点击展开时：
- 按钮渲染条件 `group.sessions.length > COLLAPSED_SESSION_LIMIT` 不变、且无 key、位置仍是组内
  最后一个子节点 → **React 复用同一个按钮 DOM 节点**，只是被新插入的会话行**挤到展开块底部**；
- 插件仍把光标锚在按钮上 → 从按钮看新会话全在上方，按 ↓ 几何上全被过滤 → 跳过。
- 排除项：无高度动画（`row-in` 仅 0.15s 透明度），不是 rect 陈旧。

修复：`reanchorAfterLayout(x, y, prefer)` —— 点击前记录锚点中心坐标，`requestAnimationFrame`
（等 React 提交 DOM）后，若原锚点位移 >8px 或被移除，就把光标/高亮移到离旧坐标最近的可聚焦
元素上（展开场景正好落在**新会话块开头**，继续 ↓ 可逐个走完）。`clickElement()` 与
`onMouseDown()`（导航模式下鼠标点击）都接入了该逻辑。

## 关键分析三：如何识别"会话"（S 键 select 的判定）

DSH 里 `[role="treeitem"]` 有三种，**只有带 `aria-selected` 的才是会话行**：

| DOM 标记 | 是什么 | onClick |
| --- | --- | --- |
| `[role="treeitem"][aria-selected]` | 会话行（SessionNodeItem）与搜索结果（SearchResultItem） | `onOpen(id)` 切换会话 |
| `[role="treeitem"][aria-expanded]` | 分组/工作区头（ProjectRowItem） | 折叠/展开分组 |
| `[role="treeitem"][aria-level]` | 子代理目录行（dsh-client-ui-subagent） | 展开分支/打开 |

判定会话行用 `el.closest('[role="treeitem"][aria-selected]')`（可上溯到行内子按钮所在的会话行）。
`isVisible`/SELECTOR 中已含 `[role="treeitem"]`，会话行是可直接导航目标。

## 其它约定

- 导航模式守卫 `onFocusIn`：阻止 app 把焦点塞进非高亮目标；退出用 `exitMode()`，回输入框用
  `focusComposer()`（恢复 `enterMode` 时 remembered 的输入框，否则取最靠底部的 textarea）。
- 源码里有 `dsh-kbd-nav-ring` 高亮样式注入；`ensureFocusable` 给非原生可聚焦元素加 `tabindex=-1`。
- **输入框不进导航移动路径**：`focusables()` 用 `isInputLike` 排除
  textarea/input/contenteditable/role=textbox|searchbox|combobox——方向键移动、视口中心兜底、
  点击后重锚定都不会把光标落到输入框上；输入框仍由 `focusComposer()`（S 退出时）主动聚焦。
  注意 DSH composer 是 textarea，其自身键盘处理（草稿历史仲裁）只在它被聚焦时生效，与导航互不干扰。
