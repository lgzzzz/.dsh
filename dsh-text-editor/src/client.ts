/**
 * dsh-text-editor — 浏览器半部入口（TypeScript 真源；由 scripts/build-client.mjs
 * 编译为 CommonJS 并打包成单文件 lib/client.js）。
 *
 * 本文件只做装配：声明 inject、注入样式、把 slots 交给 controller.bind()。
 * 功能实现按职责拆在 src/ 下的模块：
 *
 *   - controller.ts  编排层：标签生命周期 + 打开/读取/保存/关闭
 *   - ui.ts          视图层：标签、编辑器视图、Monaco 容器、文件链接点击拦截
 *   - monaco.ts      Monaco AMD 加载封装 + 编辑器实例单例
 *   - state.ts       文件状态 store
 *   - commands.ts    UI → 编排层的命令总线（打破组件与编排的环）
 *   - routes.ts      与宿主约定的 URL 常量与响应类型
 *   - path.ts        basename / 扩展名 → language id
 *   - css.ts         编辑器样式
 */
import { CSS } from './css.ts'
import { bind } from './controller.ts'
import type { SlotsFace } from './controller.ts'

/**
 * 依赖声明：插件在 `slots` 服务可用后才 apply（否则 apply 时
 * `ctx.get('slots')` 返回 undefined，后续 `.inject(...)` 会抛错，导致
 * web 端启动失败）。与 ui-trajectory 等客户端插件保持一致。
 */
export const inject = ['slots']

export const name = 'dsh-text-editor'

interface ClientContext {
  get(name: string): unknown
  effect(callback: () => void | (() => void)): void
}

function apply(ctx: ClientContext): void {
  const slots = ctx.get('slots') as SlotsFace | null | undefined
  if (slots === null || slots === undefined) return

  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-text-editor'
    tag.textContent = CSS
    document.head.appendChild(tag)
    const unbind = bind(slots)
    return () => {
      unbind()
      tag.remove()
    }
  })
}

export { apply }
