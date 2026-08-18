/**
 * Host half of the local `dsh-new-session-command` package.
 *
 * Registers the `/new` human command in the `commands` registry so it appears
 * in the '/' command menu and executes cleanly (logging the command lifecycle
 * and rendering a flow node). The actual "create + navigate to a new session"
 * work happens in the browser half (lib/client.js), which reacts to the
 * `command/executed` event with `workspaces.startSession()` — the exact New
 * Session button behavior.
 */
export const name = 'dsh-new-session-command'

export function apply(ctx) {
  const commands = ctx.get('commands')
  if (commands === undefined) return
  ctx.effect(() => commands.register({
    name: 'new',
    description: 'Create a new session',
    handler: () => ({ kind: 'success' }),
  }))
}
