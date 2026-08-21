/**
 * 模块级文件状态 store（同一时刻一个打开的文件）。
 * 用 useSyncExternalStore(subscribe, getState) 反应式驱动视图。
 */
export interface FileState {
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

function emit(): void {
  for (const fn of listeners) fn()
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function getState(): FileState | null {
  return fileState
}

export function setState(next: FileState | null): void {
  fileState = next
  emit()
}
