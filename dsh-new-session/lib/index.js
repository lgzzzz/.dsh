/**
 * Node half of the local `dsh-new-session` patch row.
 *
 * Registers the `/new` slash command (bare host command, no input hint) so the
 * Web '/'-menu row exists and bare invocation is admitted. The actual
 * create-and-navigate work happens in the browser half through
 * `workspaces.startSession()` — the exact New Session button path; this half
 * only settles the admitted command lifecycle with no UI text.
 */
export const name = 'dsh-new-session'
export const inject = ['commands']

export function apply(ctx) {
  ctx.effect(() => ctx.commands.register({
    name: 'new',
    description: '新建会话并跳转',
    handler: () => ({ kind: 'success' }),
  }))
}
