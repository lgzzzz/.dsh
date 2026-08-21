/**
 * 视图层：文件标签、编辑器视图、Monaco 容器、文件链接点击拦截。
 *
 * 所有「动作」都经 commands.ts 触发（requestOpen / requestSave / requestClose），
 * 由 controller.ts 注册处理——组件不反向 import 编排层，避免依赖成环。
 */
import * as React from 'react'
import { getState, subscribe } from './state.ts'
import {
  currentTheme,
  ensureMonaco,
  getActiveEditor,
  getActiveMonaco,
  setActiveEditor,
  setActiveMonaco,
} from './monaco.ts'
import { languageFor } from './path.ts'
import { requestClose, requestOpen, requestSave } from './commands.ts'

// ── 文件链接点击拦截（按当前会话挂载） ─────────────────────────────────────
/** 产物 chips 带完整路径于 title。 */
const CHIP_SELECTOR = '[data-produced-files-row] button[title]'
/** read/write/edit 工具卡片摘要里的可打开路径链接。 */
const FILELINK_SELECTOR = [
  '[data-tool="read"] button[class*="_fileLink"]',
  '[data-tool="write"] button[class*="_fileLink"]',
  '[data-tool="edit"] button[class*="_fileLink"]',
].join(', ')
const TARGET_SELECTOR = `${CHIP_SELECTOR}, ${FILELINK_SELECTOR}`

interface SessionListState {
  byId?: Record<string, { cwd?: string } | undefined>
}
interface InterceptorProps {
  sessionId: string | undefined
  useSessions: (selector: (s: SessionListState) => string | undefined) => string | undefined
}

/** 会话头部 actions 行里的隐形条目：只挂载文档级捕获监听，渲染为空。 */
export function Interceptor(props: InterceptorProps): null {
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
      requestOpen(path, cwdRef.current, sessionId)
    }
    document.addEventListener('click', onClick, true)
    return () => { document.removeEventListener('click', onClick, true) }
  }, [sessionId])

  return null
}

// ── 标签 ────────────────────────────────────────────────────────────────────
/** 标签内容：被打开文件的 basename + × 关闭按钮（反应式跟随 fileState）。 */
export function TabLabel(): React.ReactElement {
  const state = React.useSyncExternalStore(subscribe, getState)
  const label = state !== null && state.label !== '' ? state.label : '文件'
  return React.createElement('span', { className: 'dsh-te-tab' },
    React.createElement('span', {
      className: 'dsh-te-tab-label',
      title: state !== null ? state.path : undefined,
    }, label),
    React.createElement('span', {
      role: 'button',
      className: 'dsh-te-tab-close',
      title: '关闭',
      'aria-label': '关闭编辑器',
      onClick: (event: React.MouseEvent<HTMLSpanElement>) => {
        // 阻止冒泡到外层 tab 按钮（否则会触发 setView 切换标签）。
        event.stopPropagation()
        requestClose()
      },
    }, '×'),
  )
}

// ── 编辑器视图 ──────────────────────────────────────────────────────────────
export function FileView(): React.ReactElement | null {
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
        onClick: () => { void requestSave() },
        disabled: state.loading || state.error !== null,
      }, '保存'),
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
      setActiveMonaco(monaco)
      const editor = monaco.editor.create(containerRef.current, {
        value: content,
        language: languageFor(path),
        theme: currentTheme(),
        automaticLayout: true,
        fontSize: 13,
        lineNumbers: 'on',
        minimap: { enabled: false },
        readOnly: false,
        scrollBeyondLastLine: false,
        wordWrap: 'off',
        tabSize: 2,
      })
      setActiveEditor(editor)
      setReady(true)
    }).catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error))
    })
    return () => {
      cancelled = true
      const editor = getActiveEditor()
      if (editor !== null) {
        editor.dispose()
        setActiveEditor(null)
      }
      setActiveMonaco(null)
    }
    // 挂载时创建一次；内容/路径变化走下面的更新 effect。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 新文件打开时更新内容与语言。
  React.useEffect(() => {
    if (!ready) return
    const editor = getActiveEditor()
    if (editor === null) return
    if (editor.getValue() !== content) editor.setValue(content)
    const monaco = getActiveMonaco()
    if (monaco !== null) {
      const model = editor.getModel()
      if (model !== null && model !== undefined) monaco.editor.setModelLanguage(model, languageFor(path))
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
