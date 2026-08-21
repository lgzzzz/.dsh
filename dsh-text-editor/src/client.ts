/**
 * dsh-text-editor — Browser half（TypeScript 真源，由 scripts/build-client.mjs
 * 编译为 CommonJS 并包进 `window.__ModuleLoader__.load(...)` 写入 lib/client.js）。
 *
 * 在 DSH Web GUI 内提供一个基于 Monaco Editor（VSCode 同款开源编辑器）的
 * 文本编辑器：
 *
 *  1. 通过 `conversation.view` slot 注册「文件」标签页，与「对话」「轨迹」并排；
 *     标签页带关闭（×）按钮，关闭后移除标签并回到「对话」。
 *  2. 拦截两类文件链接的点击（否则走宿主 OS 打开）：
 *     - 会话完成时最后一条消息底部的产物 chips
 *       （`[data-produced-files-row] button[title]`，title 即完整路径）；
 *     - read / write / edit 工具卡片摘要里的路径链接
 *       （`[data-tool="..."] button[class*="_fileLink"]`，文本即展示路径，
 *       相对 cwd / 绝对 / `~` 开头）。
 *     都改为在本应用内打开。
 *  3. 通过插件宿主路由读取文件内容，用 Monaco 渲染（语法高亮、行号、主题跟随
 *     DSH 明暗主题），可编辑并「保存」（写入走宿主 + 会话沙箱策略）。
 *
 * 依赖：React 来自模块表（`require('react')`，package.json 已声明 external）。
 * Monaco 由宿主路由同源托管（/dsh-text-editor/monaco/*），离线可用。
 */
import * as React from 'react'

// ── 身份与路由 ──────────────────────────────────────────────────────────────
const FILE_TAB_ID = 'dsh-text-editor'
const FILE_TAB_LABEL = '文件'
const READ_ROUTE = '/dsh-text-editor/read'
const WRITE_ROUTE = '/dsh-text-editor/write'
const MONACO_BASE = '/dsh-text-editor/monaco'

/** 产物 chips 带完整路径于 title。 */
const CHIP_SELECTOR = '[data-produced-files-row] button[title]'
/** read/write/edit 工具卡片摘要里的可打开路径链接。 */
const FILELINK_SELECTOR = [
  '[data-tool="read"] button[class*="_fileLink"]',
  '[data-tool="write"] button[class*="_fileLink"]',
  '[data-tool="edit"] button[class*="_fileLink"]',
].join(', ')
const TARGET_SELECTOR = `${CHIP_SELECTOR}, ${FILELINK_SELECTOR}`

// ── 模块级文件状态（同一时刻一个打开的文件） ───────────────────────────────
interface FileState {
  path: string
  label: string
  content: string
  loading: boolean
  saving: boolean
  binary: boolean
  truncated: boolean
  error: string | null
  notice: string | null
  cwd: string
  sessionId: string | undefined
}

let fileState: FileState | null = null
const listeners = new Set<() => void>()
let loadSeq = 0

function emit(): void {
  for (const fn of listeners) fn()
}
function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
function getState(): FileState | null {
  return fileState
}
function setState(next: FileState | null): void {
  fileState = next
  emit()
}

// ── 插件生命周期句柄（apply 内捕获，保证析构进入本插件 fiber） ──────────────
interface SlotsFace {
  inject(key: string, callback: () => unknown): () => void
  register(options: Record<string, unknown>, component: unknown): () => void
}
interface ClientContext {
  get(name: string): unknown
  effect(callback: () => void | (() => void)): void
}

/**
 * 依赖声明：插件在 `slots` 服务可用后才 apply（否则 apply 时
 * `ctx.get('slots')` 返回 undefined，后续 `.inject(...)` 会抛错，导致
 * web 端启动失败）。与 ui-trajectory 等客户端插件保持一致。
 */
export const inject = ['slots']

let slotsRef: SlotsFace | null | undefined = null
let registeredDisposer: (() => void) | null = null

// ── 辅助函数 ────────────────────────────────────────────────────────────────
function basename(path: string): string {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return at === -1 ? path : path.slice(at + 1)
}

/** 注册「文件」conversation.view 条目（尚未注册时）。 */
function ensureTab(): void {
  if (registeredDisposer !== null || slotsRef === null || slotsRef === undefined) return
  registeredDisposer = slotsRef.register({
    name: 'conversation.view',
    id: FILE_TAB_ID,
    order: 100,
    label: () => FILE_TAB_LABEL,
  }, FileView)
}

/** 把一个文件载入编辑器标签页并切换过去。 */
function openInEditor(path: string, cwd: string, sessionId: string | undefined): void {
  ensureTab()
  loadFile(path, cwd, sessionId)
  activateTab()
}

/** 从宿主路由读取文件内容并发布到 store。 */
function loadFile(path: string, cwd: string, sessionId: string | undefined): void {
  const seq = ++loadSeq
  setState({
    path, label: basename(path), content: '', loading: true, saving: false,
    binary: false, truncated: false, error: null, notice: null, cwd, sessionId,
  })
  const url = `${READ_ROUTE}?path=${encodeURIComponent(path)}`
    + (cwd ? `&cwd=${encodeURIComponent(cwd)}` : '')
  fetch(url, { credentials: 'same-origin', cache: 'no-store' })
    .then((response) => response.json() as Promise<ReadResult>)
    .then((data) => {
      if (seq !== loadSeq) return
      if (!data.ok) throw new Error(data.error || '读取失败')
      setState({
        path: data.path || path, label: basename(path), content: data.content ?? '',
        loading: false, saving: false, binary: !!data.binary, truncated: !!data.truncated,
        error: null, notice: null, cwd, sessionId,
      })
    })
    .catch((error: unknown) => {
      if (seq !== loadSeq) return
      setState({
        path, label: basename(path), content: '', loading: false, saving: false,
        binary: false, truncated: false,
        error: error instanceof Error ? error.message : String(error),
        notice: null, cwd, sessionId,
      })
    })
}

interface ReadResult {
  ok: boolean
  path?: string
  content?: string
  binary?: boolean
  truncated?: boolean
  error?: string
}

interface WriteResult {
  ok: boolean
  path?: string
  error?: string
}

/** 保存当前编辑器内容回宿主（走会话沙箱策略）。 */
async function saveFile(state: FileState): Promise<void> {
  if (activeEditor === null) return
  const content = activeEditor.getValue()
  setState({ ...state, saving: true, error: null, notice: null })
  try {
    const response = await fetch(WRITE_ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: state.path,
        cwd: state.cwd,
        content,
        sessionId: state.sessionId ?? null,
      }),
    })
    const data = await response.json() as WriteResult
    if (!data.ok) throw new Error(data.error || '保存失败')
    const next = getState()
    if (next === null) return
    setState({ ...next, saving: false, notice: '已保存', error: null })
  } catch (error) {
    const next = getState()
    if (next === null) return
    setState({
      ...next, saving: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/** 关闭编辑器：移除标签页并回到「对话」视图。 */
function closeEditor(): void {
  if (registeredDisposer !== null) {
    registeredDisposer()
    registeredDisposer = null
  }
  setState(null)
  // 标签消失后会话体回落到 Chat；点一下当前选中的标签把 store.view 写回 chat。
  let attempts = 0
  const tryClick = (): void => {
    const tab = document.querySelector('[role="tablist"] [role="tab"][aria-selected="true"]')
    if (tab instanceof HTMLElement) { tab.click(); return }
    if (++attempts < 20) setTimeout(tryClick, 30)
  }
  tryClick()
}

/** 等标签栏重渲染后激活「文件」标签。 */
function activateTab(): void {
  let attempts = 0
  const tryClick = (): void => {
    const tabs = document.querySelectorAll('[role="tablist"] [role="tab"]')
    for (let i = 0; i < tabs.length; i++) {
      if (tabs[i].textContent === FILE_TAB_LABEL) { (tabs[i] as HTMLElement).click(); return }
    }
    if (++attempts < 40) setTimeout(tryClick, 25)
  }
  tryClick()
}

// ── Monaco 加载 ─────────────────────────────────────────────────────────────
interface MonacoEditor {
  editor: {
    create(el: HTMLElement, options: Record<string, unknown>): MonacoEditorInstance
    setTheme(theme: string): void
    setModelLanguage(model: unknown, languageId: string): void
  }
  Uri: { file(path: string): unknown }
}
interface MonacoEditorInstance {
  dispose(): void
  getValue(): string
  setValue(value: string): void
  getModel(): unknown
  onDidChangeModelContent(listener: () => void): { dispose(): void }
}

interface MonacoWindow {
  monaco?: MonacoEditor
  require?: {
    config(options: Record<string, unknown>): void
    (deps: readonly string[], callback: () => void): void
  }
  MonacoEnvironment?: { getWorkerUrl?: () => string }
}

let monacoPromise: Promise<MonacoEditor> | null = null
let activeMonaco: MonacoEditor | null = null
let activeEditor: MonacoEditorInstance | null = null

function getMonacoWindow(): MonacoWindow {
  return window as unknown as MonacoWindow
}

/** 注入 Monaco AMD loader 并解析出 `monaco` 全局（幂等）。 */
function ensureMonaco(): Promise<MonacoEditor> {
  if (monacoPromise !== null) return monacoPromise
  monacoPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${MONACO_BASE}/loader.js`
    script.onload = () => {
      const amd = getMonacoWindow().require
      if (amd === undefined || typeof amd.config !== 'function') {
        reject(new Error('Monaco AMD loader missing'))
        return
      }
      amd.config({ paths: { vs: MONACO_BASE } })
      getMonacoWindow().MonacoEnvironment = {
        getWorkerUrl: () => `${MONACO_BASE}/base/worker/workerMain.js`,
      }
      amd(['vs/editor/editor.main'], () => {
        const monaco = getMonacoWindow().monaco
        if (monaco === undefined) reject(new Error('Monaco editor missing'))
        else resolve(monaco)
      })
    }
    script.onerror = () => reject(new Error('Monaco loader failed to load'))
    document.head.appendChild(script)
  })
  return monacoPromise
}

/** 当前 DSH 主题 → Monaco 主题。 */
function currentTheme(): string {
  return document.body.hasAttribute('data-ds-dark-theme') ? 'vs-dark' : 'vs'
}

/** 常见扩展名 → Monaco language id。 */
const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', yml: 'yaml', yaml: 'yaml', md: 'markdown', markdown: 'markdown',
  css: 'css', scss: 'scss', less: 'less', html: 'html', htm: 'html',
  py: 'python', sh: 'shell', bash: 'shell', zsh: 'shell',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', java: 'java',
  go: 'go', rs: 'rust', rb: 'ruby', php: 'php', sql: 'sql',
  xml: 'xml', svg: 'xml', toml: 'ini', ini: 'ini', conf: 'ini',
  diff: 'diff', patch: 'diff', txt: 'plaintext', log: 'plaintext',
}

function languageFor(path: string): string {
  const base = (path.split('/').pop() ?? path).split('\\').pop() ?? ''
  const lower = base.toLowerCase()
  if (lower === 'dockerfile' || lower === 'makefile') return lower
  const dot = lower.lastIndexOf('.')
  if (dot === -1) return 'plaintext'
  return EXT_LANG[lower.slice(dot + 1)] ?? 'plaintext'
}

// ── 编辑器视图组件 ──────────────────────────────────────────────────────────
function FileView(): React.ReactElement | null {
  const state = React.useSyncExternalStore(subscribe, getState)
  if (state === null) {
    return React.createElement('div', { className: 'dsh-te-root dsh-te-empty' },
      React.createElement('div', { className: 'dsh-te-note' }, '未打开文件'))
  }
  const statusText = state.loading
    ? '加载中…'
    : state.saving
      ? '保存中…'
      : state.error !== null
        ? state.error
        : state.notice
  return React.createElement('div', { className: 'dsh-te-root' },
    React.createElement('div', { className: 'dsh-te-toolbar' },
      React.createElement('span', { className: 'dsh-te-path', title: state.path }, state.label),
      statusText !== undefined && statusText !== null && statusText !== ''
        ? React.createElement('span', {
          className: state.error !== null ? 'dsh-te-status dsh-te-status-error' : 'dsh-te-status',
        }, statusText)
        : null,
      state.binary
        ? React.createElement('span', { className: 'dsh-te-status dsh-te-status-error' }, '二进制文件')
        : null,
      React.createElement('button', {
        type: 'button',
        className: 'dsh-te-save',
        title: '保存',
        onClick: () => { void saveFile(state) },
        disabled: state.loading || state.error !== null,
      }, '保存'),
      React.createElement('button', {
        type: 'button',
        className: 'dsh-te-close',
        title: '关闭',
        'aria-label': '关闭编辑器',
        onClick: closeEditor,
      }, '×'),
    ),
    React.createElement('div', { className: 'dsh-te-body' },
      state.binary || state.error !== null
        ? React.createElement('div', { className: 'dsh-te-note' },
          state.binary
            ? '该文件是二进制文件，无法以文本方式查看。'
            : `无法读取文件：${state.error}`)
        : React.createElement(MonacoHost, { content: state.content, path: state.path }),
      state.truncated
        ? React.createElement('div', { className: 'dsh-te-note' }, '文件较大，仅显示前 2MB。')
        : null,
    ),
  )
}

/** 承载 Monaco 实例的容器组件（懒加载 Monaco，随内容/路径更新）。 */
function MonacoHost({ content, path }: { content: string; path: string }): React.ReactElement {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void ensureMonaco().then((monaco) => {
      if (cancelled || containerRef.current === null) return
      activeMonaco = monaco
      const editor = monaco.editor.create(containerRef.current, {
        value: content,
        language: languageFor(path),
        theme: currentTheme(),
        automaticLayout: true,
        fontSize: 13,
        lineNumbers: 'on',
        minimap: { enabled: true },
        readOnly: false,
        scrollBeyondLastLine: false,
        wordWrap: 'off',
        tabSize: 2,
      })
      activeEditor = editor
      setReady(true)
    }).catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error))
    })
    return () => {
      cancelled = true
      if (activeEditor !== null) {
        activeEditor.dispose()
        activeEditor = null
      }
      activeMonaco = null
    }
    // 挂载时创建一次；内容/路径变化走下面的更新 effect。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 新文件打开时更新内容与语言。
  React.useEffect(() => {
    if (!ready || activeEditor === null) return
    if (activeEditor.getValue() !== content) activeEditor.setValue(content)
    if (activeMonaco !== null) {
      const model = activeEditor.getModel()
      if (model !== null && model !== undefined) activeMonaco.editor.setModelLanguage(model, languageFor(path))
    }
  }, [content, path, ready])

  if (loadError !== null) {
    return React.createElement('div', { className: 'dsh-te-note' },
      `Monaco 加载失败：${loadError}`)
  }
  return React.createElement('div', { className: 'dsh-te-monaco' },
    React.createElement('div', { ref: containerRef, className: 'dsh-te-monaco-host' }),
    !ready ? React.createElement('div', { className: 'dsh-te-note' }, '加载 Monaco 编辑器…') : null,
  )
}

// ── 文件链接点击拦截（按当前会话挂载） ─────────────────────────────────────
interface SessionListState {
  byId?: Record<string, { cwd?: string } | undefined>
}
interface InterceptorProps {
  sessionId: string | undefined
  useSessions: (selector: (s: SessionListState) => string | undefined) => string | undefined
}

/** 会话头部 actions 行里的隐形条目：只挂载文档级捕获监听，渲染为空。 */
function Interceptor(props: InterceptorProps): null {
  const sessionId = props.sessionId
  const useSessions = props.useSessions
  const cwdRef = React.useRef('')
  cwdRef.current = useSessions((s) => {
    if (sessionId === undefined || s === null || s === undefined || s.byId === undefined) return undefined
    return s.byId[sessionId]?.cwd
  }) ?? ''

  React.useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      const target = event.target
      const chip = target instanceof Element
        ? target.closest(TARGET_SELECTOR)
        : null
      if (chip === null) return
      const path = (chip.getAttribute('title') ?? (chip.textContent ?? '').trim())
      if (path === '' || path === '.') return
      // 阻断宿主 OS 打开，改在本应用内打开。
      event.preventDefault()
      event.stopImmediatePropagation()
      openInEditor(path, cwdRef.current, sessionId)
    }
    document.addEventListener('click', onClick, true)
    return () => { document.removeEventListener('click', onClick, true) }
  }, [sessionId])

  return null
}

// ── 插件主体 ────────────────────────────────────────────────────────────────
function apply(ctx: ClientContext): void {
  slotsRef = ctx.get('slots') as SlotsFace | null | undefined
  if (slotsRef === null || slotsRef === undefined) return

  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-text-editor'
    tag.textContent = CSS
    document.head.appendChild(tag)
    return () => { tag.remove() }
  })

  // 等 header actions slot 声明后挂载隐形拦截器。
  slotsRef.inject('conversation.session.header.actions', () => {
    return slotsRef!.register({
      name: 'conversation.session.header.actions',
      id: 'dsh-text-editor-interceptor',
      order: -100,
    }, Interceptor)
  })
}

export const name = 'dsh-text-editor'
export { apply }

const CSS = [
  '.dsh-te-root{display:flex;flex-direction:column;flex:1;min-height:0;background:var(--dsw-alias-bg-base,#1e1e1e);color:var(--dsw-alias-label-primary,#e6e6e6);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:13px;line-height:1.5;}',
  '.dsh-te-empty{justify-content:center;align-items:center;}',
  '.dsh-te-toolbar{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.25));background:var(--dsw-alias-bg-layer-1,#252526);flex:none;}',
  '.dsh-te-path{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%;}',
  '.dsh-te-status{color:var(--dsw-alias-label-secondary,#9d9d9d);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40%;}',
  '.dsh-te-status-error{color:var(--dsw-alias-state-error-primary,#f48771);}',
  '.dsh-te-save{margin-left:auto;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.35));background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.15));color:var(--dsw-alias-label-primary,#e6e6e6);font-size:12px;line-height:1;cursor:pointer;padding:5px 12px;border-radius:6px;}',
  '.dsh-te-save:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.3));}',
  '.dsh-te-save:disabled{opacity:.5;cursor:default;}',
  '.dsh-te-close{margin-left:0;border:none;background:transparent;color:var(--dsw-alias-label-secondary,#9d9d9d);font-size:18px;line-height:1;cursor:pointer;padding:2px 8px;border-radius:4px;}',
  '.dsh-te-close:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.25));color:var(--dsw-alias-label-primary,#fff);}',
  '.dsh-te-body{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;position:relative;}',
  '.dsh-te-monaco{flex:1;min-height:0;position:relative;}',
  '.dsh-te-monaco-host{position:absolute;inset:0;}',
  '.dsh-te-note{padding:12px 16px;color:var(--dsw-alias-label-secondary,#9d9d9d);}',
].join('\n')
