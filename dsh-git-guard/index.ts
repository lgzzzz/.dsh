/**
 * dsh-git-guard — 拦截经由 bash 工具发起的 git 写远端／提交操作。
 *
 * - `git push`   → deny（直接阻断，请通过 GUI 或其他渠道推送）
 * - `git commit` → ask（交给用户审批，批准后才会执行）
 *
 * 运行于 `tools/pre-execute` 瀑布钩子，返回 {@link PreToolDecision}：
 * `{kind:'allow'}` | `{kind:'deny', reason}` | `{kind:'ask', reason?}`。
 *
 * 本文件由 Node 22 内置的 Type Stripping 直接加载（可擦除语法，无 enum/
 * 命名空间/参数属性），无需编译步骤；package.json 需保持 `"type": "module"`。
 */
import type { Context } from '@deepseek-ai/cordis'

/** `tools/pre-execute` 瀑布钩子的决定类型（与 dsh-tools 的 PreToolDecision 一致）。 */
type PreToolDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'ask'; reason?: string }

/** 流水线传入的工具执行视图：只用到名称与（冻结的）参数。 */
interface ToolExecutionView {
  readonly name: string
  readonly arguments?: unknown
}

/** bash 工具的参数形状：只关心命令行本身。 */
interface BashArguments {
  readonly command?: unknown
}

/** 钩子链 continuation：放行给下一个监听器（链尾默认解析为 allow）。 */
type Next = () => Promise<PreToolDecision>

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * dsh-tools 的 `tools/pre-execute` 瀑布钩子：可扩展的 allow/deny/ask 门禁。
     *
     * 事件的权威定义在宿主内的 dsh-tools 里；此处按同形签名做本地声明合并，
     * 使插件不依赖 dsh-tools 包即可通过类型检查（DSH 插件的惯用写法）。
     * @mode waterfall
     */
    'tools/pre-execute'(
      exec: ToolExecutionView,
      next: Next,
    ): Promise<PreToolDecision> | PreToolDecision
  }
}

/** 消费 git 子命令时跳过的无值选项之外的选项；`-C`/`--git-dir`/`--work-tree` 带独立值参数。 */
const GIT_FLAGS_WITH_VALUE = new Set(['-C', '--git-dir', '--work-tree', '-c'])

/** 子命令 → 决定的策略表。 */
const POLICY: Record<string, (subcommand: string) => PreToolDecision> = {
  push: () => ({
    kind: 'deny',
    reason: 'git push 被 Git Guard 拦截。请通过 GUI 或其他渠道推送。',
  }),
  commit: () => ({
    kind: 'ask',
    reason: 'git commit 需要你的授权。请审核后批准或拒绝。',
  }),
}

/** `sh -c '...'` 一层包装：取出 -c 的命令字符串再递归审查（引号成对，不做完整 shell 解析）。 */
const SHELL_C_WRAPPER = /^\s*(?:bash|sh|dash|zsh)(?:\s+-[A-Za-z]+)*\s+-c\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(\S+))/

/** 递归深度上限，防御 `bash -c "bash -c ..."` 嵌套。 */
const MAX_UNWRAP_DEPTH = 3

/** 从 bash 工具参数中取出命令字符串；不合法时返回 undefined。 */
function commandOf(exec: ToolExecutionView): string | undefined {
  const args = exec.arguments as BashArguments | undefined
  return typeof args?.command === 'string' ? args.command : undefined
}

/**
 * 把命令行切成独立执行段：`&&`、`||`、`;`、管道与换行都会开启新段，
 * 因此 `git add . && git commit` 这类组合命令中的每个 git 调用都会被审查。
 */
function segmentsOf(command: string): string[] {
  return command.split(/&&|\|\||[;|\n]/).filter(segment => segment.trim().length > 0)
}

/** 前导环境变量赋值（值可带单/双引号），例如 `GIT_SSH_COMMAND="ssh -i k" git push`。 */
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S*)\s+/

/**
 * 取一段命令中 git 的子命令名。跳过前导的环境变量赋值（`VAR=x`，值可含
 * 引号与空格）与 `sudo`；若首个可执行词不是 `git`，返回 undefined。
 */
function gitSubcommandOf(segment: string): string | undefined {
  let rest = segment.trim()
  while (ENV_ASSIGNMENT.test(rest)) rest = rest.replace(ENV_ASSIGNMENT, '')
  const tokens = rest.split(/\s+/)
  let index = 0
  while (index < tokens.length && tokens[index] === 'sudo') index += 1
  if (index >= tokens.length || tokens[index] !== 'git') return undefined
  index += 1
  for (; index < tokens.length; index += 1) {
    const token = tokens[index]!
    if (token.startsWith('-')) {
      // `-C path` 这类带值选项连同值一起跳过；`--git-dir=path` 自含值。
      if (GIT_FLAGS_WITH_VALUE.has(token)) index += 1
      continue
    }
    return token
  }
  return undefined
}

/** 对整个命令求策略：deny 优先于 ask；`sh -c` 包装会被解包后递归审查。 */
function decide(command: string, depth = 0): PreToolDecision | undefined {
  let askDecision: PreToolDecision | undefined
  for (const segment of segmentsOf(command)) {
    const trimmed = segment.trim()
    const wrapped = depth < MAX_UNWRAP_DEPTH ? SHELL_C_WRAPPER.exec(trimmed) : null
    if (wrapped !== null) {
      const inner = wrapped[1] ?? wrapped[2] ?? wrapped[3] ?? ''
      const decision = decide(inner, depth + 1)
      if (decision?.kind === 'deny') return decision
      askDecision ??= decision
      continue
    }
    const subcommand = gitSubcommandOf(trimmed)
    if (subcommand === undefined) continue
    const policy = POLICY[subcommand]
    if (policy === undefined) continue
    const decision = policy(subcommand)
    if (decision.kind === 'deny') return decision
    askDecision ??= decision
  }
  return askDecision
}

export const name = 'dsh-git-guard'

export function apply(ctx: Context): void {
  ctx.on('tools/pre-execute', (exec: ToolExecutionView, next: Next) => {
    if (exec.name !== 'bash') return next()
    const command = commandOf(exec)
    if (command === undefined) return next()
    return decide(command) ?? next()
  })
}

export default { name, apply }
