window.__ModuleLoader__.load({ id: 'dsh-new-session', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

/**
 * dsh-new-session — browser half.
 *
 * Listens for the browser-local `command/executed` acknowledgment (fired after
 * this client admitted one Host command execution) and, for `/new`, runs the
 * exact New Session button path: `workspaces.startSession()` resolves the
 * target workspace (explicit -> current session's -> recent), reuses or
 * creates its blank session, and opens it. No popup, no confirmation, no
 * model message — the user just lands in the new blank session.
 */
module.exports = {
  name: 'dsh-new-session',
  apply: function (ctx) {
    if (!ctx || typeof ctx.on !== 'function') return;
    ctx.on('command/executed', function (sessionId, name, result) {
      if (name !== 'new') return;
      var workspaces = ctx.get('workspaces');
      if (!workspaces || typeof workspaces.startSession !== 'function') return;
      workspaces.startSession();
    });
  },
};

return module.exports; } });
