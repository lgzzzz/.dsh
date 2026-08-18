/**
 * Node half of the local `dsh-kbd-nav-focus` patch row.
 *
 * The browser half (lib/client.js, compiled from src/client.ts) carries the
 * actual keyboard-navigation logic; this half only exists so the composition
 * row resolves as a valid host plugin entry that `dsh-client-modules` can scan
 * (it looks at Loader entries whose package.json declares
 * `dsh.client.platform: "web"`).
 */
export const name = 'dsh-kbd-nav-focus'
export function apply() {}
