window.__ModuleLoader__.load({ id: 'dsh-new-session-command', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
module.exports = {
  name: 'new-session-command',
  apply: function (ctx) {
    // /new executed -> create and navigate to a new session, same as the New
    // Session button (workspaces.startSession). No result text is rendered.
    ctx.on('command/executed', function (sessionId, name, result) {
      if (name !== 'new' || result.kind !== 'success') return
      var workspaces = ctx.get('workspaces')
      if (workspaces === undefined) return
      workspaces.startSession()
    })

    if (typeof document === 'undefined') return
    // Esc stops ALL of the current session's interactions: its own running
    // turn (normal session or continuable subagent) plus every running
    // subagent descendant. One-shot subagents are uncancellable by design, so
    // skip them to avoid surfacing their 'unavailable' error.
    ctx.effect(function () {
      var cancelIfRunning = function (id, sessions) {
        var binding = sessions.binding(id)
        if (binding === undefined) return
        var snapshot = binding.session.getSnapshot()
        if (snapshot.running !== true) return
        var address = snapshot.subagent === null ? undefined : snapshot.subagent.address
        if (address !== undefined && address.mode === 'one-shot') return
        binding.session.cancel().catch(function () {})
      }
      var stopTree = function (id, sessions, list, seen) {
        if (id === undefined || seen.has(id)) return
        seen.add(id)
        cancelIfRunning(id, sessions)
        var catalog = list.subagentsByParent === undefined ? undefined : list.subagentsByParent[id]
        if (catalog === undefined || !Array.isArray(catalog.entries)) return
        for (var i = 0; i < catalog.entries.length; i++) {
          var entry = catalog.entries[i]
          if (entry.kind !== 'child') continue
          stopTree(entry.id, sessions, list, seen)
        }
      }
      var onKeyDown = function (event) {
        if (event.key !== 'Escape' || event.repeat) return
        var sessions = ctx.get('sessions')
        if (sessions === undefined) return
        var list = sessions.list.getSnapshot()
        stopTree(list.current, sessions, list, new Set())
      }
      document.addEventListener('keydown', onKeyDown)
      return function () {
        document.removeEventListener('keydown', onKeyDown)
      }
    })
  },
}
return module.exports; } });
