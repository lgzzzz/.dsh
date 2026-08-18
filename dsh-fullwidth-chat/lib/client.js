window.__ModuleLoader__.load({ id: 'dsh-fullwidth-chat', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
/**
 * Persistent full-width conversation column.
 *
 * --dsh-chat-content-width (default 748px) caps the transcript, the stats
 * line and the takeover panels on the conversation root (`[data-phase]`
 * under the `conversation` slot anchor). Overriding it to 100% tiles the
 * transcript across the whole column; the composer card width derives as
 * calc(+32px) and keeps its 16px-per-side clearance, so no other rule has
 * to change.
 */
var CSS = "[data-slot='conversation'] [data-phase] { --dsh-chat-content-width: 100%; }";
module.exports = {
  name: 'fullwidth-chat',
  apply: function (ctx) {
    var tag = document.createElement('style');
    tag.dataset.plugin = 'dsh-fullwidth-chat';
    tag.textContent = CSS;
    document.head.appendChild(tag);
    // The module loader also reclaims data-plugin-tagged styles on unload;
    // keep a disposer anyway so stop/unload is covered by both paths.
    if (ctx && typeof ctx.effect === 'function') {
      ctx.effect(function () { return function () { tag.remove(); }; });
    }
  },
};
return module.exports; } });
