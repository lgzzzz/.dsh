/**
 * UI → 编排层的命令总线。
 *
 * ui.ts（React 组件）不能反向 import controller.ts（否则依赖成环，而构建器
 * 拒绝环），所以组件只触发命令；controller.bind() 注册真正的处理函数。
 */
export interface OpenRequest {
  path: string
  cwd: string
  sessionId: string | undefined
}

let openHandler: ((req: OpenRequest) => void) | null = null
let saveHandler: (() => void) | null = null
let closeHandler: (() => void) | null = null

export function setOpenHandler(fn: ((req: OpenRequest) => void) | null): void { openHandler = fn }
export function setSaveHandler(fn: (() => void) | null): void { saveHandler = fn }
export function setCloseHandler(fn: (() => void) | null): void { closeHandler = fn }

/** 请求打开一个文件（产物 chips / 工具卡片路径链接被点击时）。 */
export function requestOpen(path: string, cwd: string, sessionId: string | undefined): void {
  if (openHandler !== null) openHandler({ path, cwd, sessionId })
}

/** 请求保存当前编辑器内容。 */
export function requestSave(): void {
  if (saveHandler !== null) saveHandler()
}

/** 请求关闭编辑器（标签 × 被点击时）。 */
export function requestClose(): void {
  if (closeHandler !== null) closeHandler()
}
