window.__ModuleLoader__.load({ id: "dsh-text-editor", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);

// src/css.ts
var CSS = [
  '.dsh-te-root{display:flex;flex-direction:column;flex:1;min-height:0;background:var(--dsw-alias-bg-base,#1e1e1e);color:var(--dsw-alias-label-primary,#e6e6e6);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:13px;line-height:1.5;}',
  ".dsh-te-empty{justify-content:center;align-items:center;}",
  ".dsh-te-toolbar{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.25));background:var(--dsw-alias-bg-layer-1,#252526);flex:none;}",
  ".dsh-te-path{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%;}",
  ".dsh-te-status{color:var(--dsw-alias-label-secondary,#9d9d9d);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40%;}",
  ".dsh-te-status-error{color:var(--dsw-alias-state-error-primary,#f48771);}",
  ".dsh-te-save{margin-left:auto;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.35));background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.15));color:var(--dsw-alias-label-primary,#e6e6e6);font-size:12px;line-height:1;cursor:pointer;padding:5px 12px;border-radius:6px;}",
  ".dsh-te-save:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.3));}",
  ".dsh-te-save:disabled{opacity:.5;cursor:default;}",
  ".dsh-te-tab{display:inline-flex;align-items:center;gap:6px;}",
  ".dsh-te-tab-label{white-space:nowrap;}",
  ".dsh-te-tab-close{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:4px;font-size:13px;line-height:1;color:var(--dsw-alias-label-secondary,#9d9d9d);cursor:pointer;user-select:none;}",
  ".dsh-te-tab-close:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.25));color:var(--dsw-alias-label-primary,#fff);}",
  ".dsh-te-body{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;position:relative;}",
  ".dsh-te-monaco{flex:1;min-height:0;position:relative;}",
  ".dsh-te-monaco-host{position:absolute;inset:0;}",
  ".dsh-te-note{padding:12px 16px;color:var(--dsw-alias-label-secondary,#9d9d9d);}"
].join("\n");

// src/controller.ts
var React2 = __toESM(require("react"), 1);

// src/state.ts
var fileState = null;
var listeners = /* @__PURE__ */ new Set();
function emit() {
  for (const fn of listeners) fn();
}
function subscribe(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function getState() {
  return fileState;
}
function setState(next) {
  fileState = next;
  emit();
}

// src/routes.ts
var READ_ROUTE = "/dsh-text-editor/read";
var WRITE_ROUTE = "/dsh-text-editor/write";
var MONACO_BASE = "/dsh-text-editor/monaco";

// src/monaco.ts
var monacoPromise = null;
var activeMonaco = null;
var activeEditor = null;
function getActiveMonaco() {
  return activeMonaco;
}
function setActiveMonaco(monaco) {
  activeMonaco = monaco;
}
function getActiveEditor() {
  return activeEditor;
}
function setActiveEditor(editor) {
  activeEditor = editor;
}
function getMonacoWindow() {
  return window;
}
function ensureMonaco() {
  if (monacoPromise !== null) return monacoPromise;
  monacoPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${MONACO_BASE}/loader.js`;
    script.onload = () => {
      const amd = getMonacoWindow().require;
      if (amd === void 0 || typeof amd.config !== "function") {
        reject(new Error("Monaco AMD loader missing"));
        return;
      }
      amd.config({ paths: { vs: MONACO_BASE } });
      getMonacoWindow().MonacoEnvironment = {
        getWorkerUrl: () => `${MONACO_BASE}/base/worker/workerMain.js`
      };
      amd(["vs/editor/editor.main"], () => {
        const monaco = getMonacoWindow().monaco;
        if (monaco === void 0) reject(new Error("Monaco editor missing"));
        else resolve(monaco);
      });
    };
    script.onerror = () => reject(new Error("Monaco loader failed to load"));
    document.head.appendChild(script);
  });
  return monacoPromise;
}
function currentTheme() {
  return document.body.hasAttribute("data-ds-dark-theme") ? "vs-dark" : "vs";
}

// src/path.ts
function basename(path) {
  const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return at === -1 ? path : path.slice(at + 1);
}
var EXT_LANG = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  markdown: "markdown",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  py: "python",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  java: "java",
  go: "go",
  rs: "rust",
  rb: "ruby",
  php: "php",
  sql: "sql",
  xml: "xml",
  svg: "xml",
  toml: "ini",
  ini: "ini",
  conf: "ini",
  diff: "diff",
  patch: "diff",
  txt: "plaintext",
  log: "plaintext"
};
function languageFor(path) {
  var _a, _b, _c;
  const base = (_b = ((_a = path.split("/").pop()) != null ? _a : path).split("\\").pop()) != null ? _b : "";
  const lower = base.toLowerCase();
  if (lower === "dockerfile" || lower === "makefile") return lower;
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return "plaintext";
  return (_c = EXT_LANG[lower.slice(dot + 1)]) != null ? _c : "plaintext";
}

// src/commands.ts
var openHandler = null;
var saveHandler = null;
var closeHandler = null;
function setOpenHandler(fn) {
  openHandler = fn;
}
function setSaveHandler(fn) {
  saveHandler = fn;
}
function setCloseHandler(fn) {
  closeHandler = fn;
}
function requestOpen(path, cwd, sessionId) {
  if (openHandler !== null) openHandler({ path, cwd, sessionId });
}
function requestSave() {
  if (saveHandler !== null) saveHandler();
}
function requestClose() {
  if (closeHandler !== null) closeHandler();
}

// src/ui.ts
var React = __toESM(require("react"), 1);
var CHIP_SELECTOR = "[data-produced-files-row] button[title]";
var FILELINK_SELECTOR = [
  '[data-tool="read"] button[class*="_fileLink"]',
  '[data-tool="write"] button[class*="_fileLink"]',
  '[data-tool="edit"] button[class*="_fileLink"]'
].join(", ");
var TARGET_SELECTOR = `${CHIP_SELECTOR}, ${FILELINK_SELECTOR}`;
function Interceptor(props) {
  var _a;
  const sessionId = props.sessionId;
  const useSessions = props.useSessions;
  const cwdRef = React.useRef("");
  cwdRef.current = (_a = useSessions((s) => {
    var _a2;
    if (sessionId === void 0 || s === null || s === void 0 || s.byId === void 0) return void 0;
    return (_a2 = s.byId[sessionId]) == null ? void 0 : _a2.cwd;
  })) != null ? _a : "";
  React.useEffect(() => {
    const onClick = (event) => {
      var _a2, _b;
      const target = event.target;
      const chip = target instanceof Element ? target.closest(TARGET_SELECTOR) : null;
      if (chip === null) return;
      const path = (_b = chip.getAttribute("title")) != null ? _b : ((_a2 = chip.textContent) != null ? _a2 : "").trim();
      if (path === "" || path === ".") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      requestOpen(path, cwdRef.current, sessionId);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
    };
  }, [sessionId]);
  return null;
}
function TabLabel() {
  const state = React.useSyncExternalStore(subscribe, getState);
  const label = state !== null && state.label !== "" ? state.label : "\u6587\u4EF6";
  return React.createElement(
    "span",
    { className: "dsh-te-tab" },
    React.createElement("span", {
      className: "dsh-te-tab-label",
      title: state !== null ? state.path : void 0
    }, label),
    React.createElement("span", {
      role: "button",
      className: "dsh-te-tab-close",
      title: "\u5173\u95ED",
      "aria-label": "\u5173\u95ED\u7F16\u8F91\u5668",
      onClick: (event) => {
        event.stopPropagation();
        requestClose();
      }
    }, "\xD7")
  );
}
function FileView() {
  const state = React.useSyncExternalStore(subscribe, getState);
  if (state === null) {
    return React.createElement(
      "div",
      { className: "dsh-te-root dsh-te-empty" },
      React.createElement("div", { className: "dsh-te-note" }, "\u672A\u6253\u5F00\u6587\u4EF6")
    );
  }
  const statusText = state.loading ? "\u52A0\u8F7D\u4E2D\u2026" : state.saving ? "\u4FDD\u5B58\u4E2D\u2026" : state.error !== null ? state.error : state.notice;
  return React.createElement(
    "div",
    { className: "dsh-te-root" },
    React.createElement(
      "div",
      { className: "dsh-te-toolbar" },
      React.createElement("span", { className: "dsh-te-path", title: state.path }, state.label),
      statusText !== void 0 && statusText !== null && statusText !== "" ? React.createElement("span", {
        className: state.error !== null ? "dsh-te-status dsh-te-status-error" : "dsh-te-status"
      }, statusText) : null,
      state.binary ? React.createElement("span", { className: "dsh-te-status dsh-te-status-error" }, "\u4E8C\u8FDB\u5236\u6587\u4EF6") : null,
      React.createElement("button", {
        type: "button",
        className: "dsh-te-save",
        title: "\u4FDD\u5B58",
        onClick: () => {
          void requestSave();
        },
        disabled: state.loading || state.error !== null
      }, "\u4FDD\u5B58")
    ),
    React.createElement(
      "div",
      { className: "dsh-te-body" },
      state.binary || state.error !== null ? React.createElement(
        "div",
        { className: "dsh-te-note" },
        state.binary ? "\u8BE5\u6587\u4EF6\u662F\u4E8C\u8FDB\u5236\u6587\u4EF6\uFF0C\u65E0\u6CD5\u4EE5\u6587\u672C\u65B9\u5F0F\u67E5\u770B\u3002" : `\u65E0\u6CD5\u8BFB\u53D6\u6587\u4EF6\uFF1A${state.error}`
      ) : React.createElement(MonacoHost, { content: state.content, path: state.path }),
      state.truncated ? React.createElement("div", { className: "dsh-te-note" }, "\u6587\u4EF6\u8F83\u5927\uFF0C\u4EC5\u663E\u793A\u524D 2MB\u3002") : null
    )
  );
}
function MonacoHost({ content, path }) {
  const containerRef = React.useRef(null);
  const [ready, setReady] = React.useState(false);
  const [loadError, setLoadError] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    void ensureMonaco().then((monaco) => {
      if (cancelled || containerRef.current === null) return;
      setActiveMonaco(monaco);
      const editor = monaco.editor.create(containerRef.current, {
        value: content,
        language: languageFor(path),
        theme: currentTheme(),
        automaticLayout: true,
        fontSize: 13,
        lineNumbers: "on",
        minimap: { enabled: false },
        readOnly: false,
        scrollBeyondLastLine: false,
        wordWrap: "off",
        tabSize: 2
      });
      setActiveEditor(editor);
      setReady(true);
    }).catch((error) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
      const editor = getActiveEditor();
      if (editor !== null) {
        editor.dispose();
        setActiveEditor(null);
      }
      setActiveMonaco(null);
    };
  }, []);
  React.useEffect(() => {
    if (!ready) return;
    const editor = getActiveEditor();
    if (editor === null) return;
    if (editor.getValue() !== content) editor.setValue(content);
    const monaco = getActiveMonaco();
    if (monaco !== null) {
      const model = editor.getModel();
      if (model !== null && model !== void 0) monaco.editor.setModelLanguage(model, languageFor(path));
    }
  }, [content, path, ready]);
  if (loadError !== null) {
    return React.createElement(
      "div",
      { className: "dsh-te-note" },
      `Monaco \u52A0\u8F7D\u5931\u8D25\uFF1A${loadError}`
    );
  }
  return React.createElement(
    "div",
    { className: "dsh-te-monaco" },
    React.createElement("div", { ref: containerRef, className: "dsh-te-monaco-host" }),
    !ready ? React.createElement("div", { className: "dsh-te-note" }, "\u52A0\u8F7D Monaco \u7F16\u8F91\u5668\u2026") : null
  );
}

// src/controller.ts
var FILE_TAB_ID = "dsh-text-editor";
var slotsRef = null;
var registeredDisposer = null;
var loadSeq = 0;
function bind(slots) {
  slotsRef = slots;
  setOpenHandler((req) => openInEditor(req.path, req.cwd, req.sessionId));
  setSaveHandler(() => {
    const state = getState();
    if (state !== null) void saveFile(state);
  });
  setCloseHandler(closeEditor);
  const disposeInject = slots.inject("conversation.session.header.actions", () => {
    return slots.register({
      name: "conversation.session.header.actions",
      id: "dsh-text-editor-interceptor",
      order: -100
    }, Interceptor);
  });
  return () => {
    setOpenHandler(null);
    setSaveHandler(null);
    setCloseHandler(null);
    disposeInject();
    slotsRef = null;
  };
}
function ensureTab() {
  if (registeredDisposer !== null || slotsRef === null || slotsRef === void 0) return;
  registeredDisposer = slotsRef.register({
    name: "conversation.view",
    id: FILE_TAB_ID,
    order: 100,
    // label 返回 React 元素（DSH 的 resolveSlotLabel 运行时不限类型，返回值
    // 直接作为标签按钮的 children）。内容由 TabLabel 组件渲染：显示被打开
    // 文件的 basename（而非固定「文件」），并带 × 关闭按钮。
    label: () => React2.createElement(TabLabel, null)
  }, FileView);
}
function openInEditor(path, cwd, sessionId) {
  ensureTab();
  loadFile(path, cwd, sessionId);
  activateTab();
}
function loadFile(path, cwd, sessionId) {
  const seq = ++loadSeq;
  setState({
    path,
    label: basename(path),
    content: "",
    loading: true,
    saving: false,
    binary: false,
    truncated: false,
    error: null,
    notice: null,
    cwd,
    sessionId
  });
  const url = `${READ_ROUTE}?path=${encodeURIComponent(path)}` + (cwd ? `&cwd=${encodeURIComponent(cwd)}` : "");
  fetch(url, { credentials: "same-origin", cache: "no-store" }).then((response) => response.json()).then((data) => {
    var _a;
    if (seq !== loadSeq) return;
    if (!data.ok) throw new Error(data.error || "\u8BFB\u53D6\u5931\u8D25");
    setState({
      path: data.path || path,
      label: basename(path),
      content: (_a = data.content) != null ? _a : "",
      loading: false,
      saving: false,
      binary: !!data.binary,
      truncated: !!data.truncated,
      error: null,
      notice: null,
      cwd,
      sessionId
    });
  }).catch((error) => {
    if (seq !== loadSeq) return;
    setState({
      path,
      label: basename(path),
      content: "",
      loading: false,
      saving: false,
      binary: false,
      truncated: false,
      error: error instanceof Error ? error.message : String(error),
      notice: null,
      cwd,
      sessionId
    });
  });
}
async function saveFile(state) {
  var _a;
  const editor = getActiveEditor();
  if (editor === null) return;
  const content = editor.getValue();
  setState({ ...state, saving: true, error: null, notice: null });
  try {
    const response = await fetch(WRITE_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: state.path,
        cwd: state.cwd,
        content,
        sessionId: (_a = state.sessionId) != null ? _a : null
      })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "\u4FDD\u5B58\u5931\u8D25");
    const next = getState();
    if (next === null) return;
    setState({ ...next, saving: false, notice: "\u5DF2\u4FDD\u5B58", error: null });
  } catch (error) {
    const next = getState();
    if (next === null) return;
    setState({
      ...next,
      saving: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
function closeEditor() {
  if (registeredDisposer !== null) {
    registeredDisposer();
    registeredDisposer = null;
  }
  setState(null);
  let attempts = 0;
  const tryClick = () => {
    const tab = document.querySelector('[role="tablist"] [role="tab"][aria-selected="true"]');
    if (tab instanceof HTMLElement) {
      tab.click();
      return;
    }
    if (++attempts < 20) setTimeout(tryClick, 30);
  };
  tryClick();
}
function activateTab() {
  let attempts = 0;
  const tryClick = () => {
    const label = document.querySelector(".dsh-te-tab-label");
    const tab = label instanceof HTMLElement ? label.closest('[role="tab"]') : null;
    if (tab instanceof HTMLElement) {
      tab.click();
      return;
    }
    if (++attempts < 40) setTimeout(tryClick, 25);
  };
  tryClick();
}

// src/client.ts
var inject = ["slots"];
var name = "dsh-text-editor";
function apply(ctx) {
  const slots = ctx.get("slots");
  if (slots === null || slots === void 0) return;
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset.plugin = "dsh-text-editor";
    tag.textContent = CSS;
    document.head.appendChild(tag);
    const unbind = bind(slots);
    return () => {
      unbind();
      tag.remove();
    };
  });
}
return module.exports; } });
