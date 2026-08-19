# dsh-kbd-nav-focus

本地持久化的"键盘焦点导航"插件（浏览器半部，TypeScript 源码 + 编译产物），对应动态插件 `kbdn-2` 的全部功能。

## 功能

| 按键 | 行为 |
| --- | --- |
| Alt+Shift（按一次） | 进入 / 退出自由移动焦点状态（闩锁，无需按住） |
| ↑↓←→ | 按几何方向移动焦点；**上下方向严格同列**（水平重叠硬过滤，列内走完不移动），**左右方向允许斜向** |
| 任意字母键（a–z / A–Z） | 对当前高亮元素执行**鼠标左键点击**，点击后**焦点停留原地** |
| 任何非字母、非方向键（Esc / Enter / 空格 / Tab 等） | 退出光标移动模式并把焦点送回**当前会话输入框**（事件被消费） |

进入导航模式时，**起点固定为侧边栏当前选中的会话行**（`[role="treeitem"][aria-selected="true"]`，回退 `class*="selected"`）。

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
