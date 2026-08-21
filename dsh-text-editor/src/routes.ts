/**
 * 与宿主半部约定好的 URL 常量与响应类型（index.ts / host/ 里的路由）。
 */
export const READ_ROUTE = '/dsh-text-editor/read'
export const WRITE_ROUTE = '/dsh-text-editor/write'
export const MONACO_BASE = '/dsh-text-editor/monaco'

/** GET /read 的 JSON 响应体。 */
export interface ReadResult {
  ok: boolean
  path?: string
  content?: string
  binary?: boolean
  truncated?: boolean
  error?: string
}

/** POST /write 的 JSON 响应体。 */
export interface WriteResult {
  ok: boolean
  path?: string
  error?: string
}
