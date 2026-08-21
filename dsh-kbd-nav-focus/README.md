# dsh-kbd-nav-focus

本地持久化的"键盘焦点导航"插件（浏览器半部，TypeScript 源码 + 编译产物），对应动态插件 `kbdn-2` 的全部功能。

## 功能

| 按键 | 行为 |
| --- | --- |
| Alt+Shift | 进入自由移动焦点状态；**已在该状态时再次按 Alt+Shift 只把光标重置回进入模式时的起点**（侧边栏当前选中会话行），**不会退出**。**只有 S 键在触发会话选择后才会退出**（退出时把焦点送回输入框） |
| ↑↓←→ | 按几何方向移动焦点；**上下方向严格同列**（水平重叠硬过滤，列内走完不移动），**左右方向允许斜向**；在可滚动 UI 内移动时**自动滚动容器**（见下方"滚动策略"）。**输入框（textarea/input/contenteditable/role=textbox 等）不在移动的可选路径内**——光标移动不会落到输入框上 |
| C | 对当前高亮元素执行**鼠标左键点击**，点击后**焦点停留原地**；若点击改变了布局（如展开会话列表把锚点挤到展开块底部、删除/归档把锚点移除），会按**点击前的屏幕坐标**在下一帧重新锚定光标到最近的可聚焦元素——光标落到新展开块开头，继续方向键即可逐个走完，不会被跳过 |
| S | select —— 只对**会话列表中的会话**（`[role="treeitem"][aria-selected]`）生效：切换至光标所在的会话，然后把焦点送回**当前会话输入框**；光标不在会话上时无动作 |
| 其它字母键（除 C/S）及非字母、非方向键（Esc / Enter / 空格 / Tab 等） | 均未绑定动作，忽略（停留在导航模式），事件被消费 |

进入导航模式时，**起点固定为侧边栏当前选中的会话行**（`[role="treeitem"][aria-selected="true"]`，回退 `class*="selected"`）。处于导航模式时再次按 Alt+Shift 会把光标重置回该起点（不退出导航）。**导航移动路径排除所有输入框**（`isInputLike`：textarea/input/contenteditable/role=textbox|searchbox|combobox），方向键移动、点击后重锚定都不会把光标落到输入框上；输入框只在 S 触发会话选择后由 `focusComposer` 主动聚焦。

## 滚动策略（可滚动 UI 内移动焦点）

- **优先留在当前可滚动 UI 内**：方向键就近选点时先只看当前可滚动容器（如侧边栏会话列表 `overflow-y:auto`、聊天消息区 `[data-conversation-scroll]`）内部的元素，光标不会提前跳出当前 UI；选中的元素若在视口外，`scrollIntoView` 会自动滚动容器把它带进视野——从而能把焦点移到 UI 内**任意位置**。
- **到达该方向尽头时触发滚动**：若容器内该方向已无可聚焦元素（例如内容尚未渲染/惰性加载），会把容器向该方向滚动一整页；滚动后若出现新元素，光标落到新元素上；若仍无新元素，则复原滚动位置。
- **走尽后允许跳出**：容器内该方向确实没有更多元素时，改为在**整页范围内**就近选择下一个元素，光标可以移出列表、移到其它面板（不会被锁在当前列表里）。
- 上下方向以**纵向实际溢出**的容器为界、左右方向以**横向实际溢出**的容器为界——`overflow-y:auto` 的列表其 `overflow-x` 虽被 CSS 计算为 `auto` 但并无横向溢出，因此不会被误当作横向边界，左右方向可以正常跳出列表；无滚动容器时以文档/窗口滚动为兜底。

## 点击后重锚定（布局变化时）

点击（字母键或导航模式下的鼠标）可能改变布局：例如点击"展开其余 N 个会话"会在锚点上方插入一批新会话行，把锚点挤到展开块底部；或点击删除/归档把锚点移除。此时插件会**记录点击前的屏幕坐标**，在下一帧（DOM 提交后）若原锚点已明显位移或消失，就把光标/高亮移到离该坐标最近的可聚焦元素上——展开场景下正好落在**新展开会话块的开头**，继续按方向键即可逐个走完，不再被跳过；布局未变化时锚点保持原地。

## 结构

```
dsh-kbd-nav-focus/
├── package.json          # npm 包声明：type=module、dsh.client.platform=web、dsh.bundle.patch
├── tsconfig.json         # 类型检查配置（noEmit）
├── tsconfig.build.json   # 构建配置（编译为 CommonJS）
├── src/client.ts         # 浏览器半部 TypeScript 源码（唯一真源）
├── lib/index.js          # Host 桩：让 dsh-client-modules 能扫描到本包（不承载逻辑）
├── lib/client.js         # 生成物：由 src/client.ts 编译并包进 __ModuleLoader__.load
├── scripts/build-client.mjs  # 构建脚本：tsc → 包装 → 写回 lib/client.js
└── README.md
```

## 构建（改 src/client.ts 后必做）

浏览器不跑 Node Type Stripping，因此必须编译出纯 JS 的 `lib/client.js`：

```bash
# 依赖全局 tsc（v5.9+，已可用）
npm run typecheck   # 类型检查（可选）
npm run build       # tsc -p tsconfig.build.json → 包装 → lib/client.js
```

> `lib/client.js` 是提交到 git 的生成物；修改逻辑请改 `src/client.ts` 后重新 build。

## 加载方式

按现有本地 web 补丁流程（同 `dsh-fullwidth-chat`）：

1. `profiles/web/package.json` 已加 `link:` 依赖：
   `"dsh-kbd-nav-focus": "link:C:/Users/LGZ/.dsh/dsh-kbd-nav-focus"`
2. `profiles/web/cordis.patch.yml` 已加注册行：
   ```yaml
   - id: kbd-nav-focus
     name: 'dsh-kbd-nav-focus'
   ```
3. `profiles/web` 下执行过 `pnpm install --no-frozen-lockfile` 建立链接。
4. **重启 App 生效**（组成为常驻挂载，不做热重载）。

## 与动态插件的衔接

本包对应动态插件 `kbdn-2`（当前 currentPackageId `pkg-14`）。动态插件为进程内存级，重启即失；
本包在重启后替代其功能。重启前若同时存在会双份监听按键——重启后动态插件自然消失，无冲突。

## 修改说明

改动 `src/client.ts` → `npm run build` 后需重启 App 生效。
