# dsh-new-session-command

本地 npm 包形式的插件（持久化），对应动态插件 `newcmd-1`（`pkg-4`）的全部功能：

| 功能 | 行为 |
| --- | --- |
| `/new` | 创建并跳转到一个新的空白会话，等同点击"新建会话"按钮，无多余提示 |
| Esc | 停止当前会话的所有互动：自身运行（普通会话或可续式子代理）+ 所有运行中的子代理后代；跳过不可取消的一次性（one-shot）子代理；空闲时按 Esc 无副作用 |

## 结构

```
dsh-new-session-command/
├── package.json      # npm 包声明：type=module、dsh.client.platform=web、dsh.bundle.patch
├── lib/index.js      # Host 半部：注册 /new 命令（commands.register）
├── lib/client.js     # 浏览器半部：/new → workspaces.startSession()；Esc → session.cancel()
├── cordis.patch.yml  # 网页组成补丁：把 lib/client.js 挂进浏览器 roster
└── README.md
```

## 加载方式（自行选择）

### Host 半部（注册 `/new` 命令）

在使用的 agent preset 的 `agent.cordis.yml` 中加入一行（参照 `command-compact` / `dsh-git-guard`
的写法；路径请用你的实际绝对路径，Windows 用正斜杠）：

```yaml
- id: new-session-command
  name: C:/Users/LGZ/.dsh/dsh-new-session-command/lib/index.js
```

> `lib/index.js` 是纯 ESM（`"type": "module"`），用绝对路径或 `file://` URL 引用。

### 浏览器半部（`/new` 跳转 + Esc 停止）

`package.json` 已声明 `dsh.client.platform: "web"` 与 `dsh.bundle.patch: ./cordis.patch.yml`。
按你现有的本地 web 补丁流程（同 `dsh-fullwidth-chat`）应用 `cordis.patch.yml`，即可把
`lib/client.js` 挂进浏览器 roster 并随 Web 一起加载。

## 修改说明

改动 `lib/*` 后需重启 App 生效（组成为常驻挂载，不做热重载）。
