/**
 * dsh-git-guard 行为冒烟测试。
 *
 * 直接用支持 Type Stripping 的运行时加载 index.ts（Node 22.18+ / 23.6+ / 24+，
 * 或 App 内置运行时）：
 *
 *   node test.mjs
 *   ELECTRON_RUN_AS_NODE=1 "/path/to/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" test.mjs
 */
import assert from 'node:assert/strict'
import guard, { name, apply } from './index.ts'

assert.equal(name, 'dsh-git-guard')
assert.equal(typeof apply, 'function')
assert.equal(guard.name, name)
assert.equal(guard.apply, apply)

// 最小 ctx 桩：只实现钩子注册。
const listeners = new Map()
const ctx = {
  on(eventName, callback) {
    listeners.set(eventName, callback)
    return () => true
  },
}
guard.apply(ctx)
const hook = listeners.get('tools/pre-execute')
assert.ok(hook, 'tools/pre-execute hook registered')

// 模拟流水线：next() 落到链尾的默认 allow。
function decide(command, toolName = 'bash') {
  return hook({ name: toolName, arguments: { command } }, async () => ({ kind: 'allow' }))
}

// --- deny：git push 及其各种包装 ---
assert.equal((await decide('git push'))?.kind, 'deny')
assert.equal((await decide('git push origin main'))?.kind, 'deny')
assert.equal((await decide('GIT_SSH_COMMAND="ssh -i k" git push'))?.kind, 'deny')
assert.equal((await decide("bash -c 'git push'"))?.kind, 'deny')
assert.equal((await decide('git -C /repo push'))?.kind, 'deny')
assert.equal((await decide('git add . && git push'))?.kind, 'deny')

// --- ask：git commit ---
assert.equal((await decide('git commit -m x'))?.kind, 'ask')
assert.equal((await decide('git add . && git commit'))?.kind, 'ask')

// --- 放行：其他命令走 next() ---
assert.equal((await decide('git status'))?.kind, 'allow')
assert.equal((await decide('ls -la'))?.kind, 'allow')
assert.equal((await decide('git log && echo done'))?.kind, 'allow')
// 非 bash 工具不拦截
assert.equal((await decide('git push', 'read'))?.kind, 'allow')

console.log('all behavioral checks passed')
