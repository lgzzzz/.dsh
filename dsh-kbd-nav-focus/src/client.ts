/**
 * dsh-kbd-nav-focus — 键盘焦点导航（浏览器半部）。
 *
 * - Alt+Shift（按一次）：进入 / 退出自由移动焦点状态（闩锁，无需按住）。
 * - ↑↓←→：按几何方向移动焦点；上下方向严格同列（水平重叠硬过滤，列内走完不移动），
 *   左右方向允许斜向移动。
 * - 任意字母键（a–z / A–Z）：对当前高亮元素执行鼠标左键点击，点击后焦点停留原地（不跳走）。
 * - 任何非字母、非方向键（含 Esc / Enter / 空格 / Tab 等）：退出光标移动模式并把焦点
 *   送回当前会话输入框（事件被消费，不触发其他行为）。
 * - 进入导航时，起点固定为侧边栏当前选中的会话行（aria-selected="true"）。
 *
 * 本文件是 TypeScript 源码：由 scripts/build-client.mjs 用 tsc 编译为 CommonJS 并
 * 包进 `window.__ModuleLoader__.load(...)` 后写入 lib/client.js 供 Web 加载。
 */

/** 本插件用到的 Cordis 客户端 ctx 的最小结构化子集（其余方法未使用）。 */
export interface NavContext {
  /** 注册一个带清理回调的副作用；返回的清理函数在插件停止/卸载时被调用。 */
  effect(callback: () => void | (() => void)): void
}

export const name = 'dsh-kbd-nav-focus'

const RING = 'dsh-kbd-nav-ring'

const SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="link"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="option"]',
  '[role="searchbox"]',
  '[role="treeitem"]',
].join(',')

type El = HTMLElement
type Dir = 'up' | 'down' | 'left' | 'right'

let active = false
let target: El | null = null
let remembered: El | null = null

/** 元素是否可被原生编程聚焦（button/input/textarea/select、a[href]、tabindex、contenteditable）。 */
function nativeFocusable(el: Element | null): boolean {
  if (!el) return false
  const t = el.tagName
  if (t === 'BUTTON' || t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return true
  if (t === 'A' && el.hasAttribute('href')) return true
  if (el.getAttribute('tabindex') !== null) return true
  if (el.getAttribute('contenteditable') !== null) return true
  return false
}

/** 让目标可编程聚焦：非原生可聚焦的元素先加 tabindex=-1（不进入 Tab 键序）。 */
function ensureFocusable(el: El | null): void {
  if (!el) return
  if (!nativeFocusable(el)) {
    el.setAttribute('tabindex', '-1')
  }
}

function isEditable(el: Element | null): boolean {
  return !!el && (
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'INPUT' ||
    el.getAttribute('contenteditable') === 'true'
  )
}

function removeRing(): void {
  if (target) {
    target.classList.remove(RING)
    target = null
  }
}

function enterMode(): void {
  if (active) return
  active = true
  const ae = document.activeElement
  if (ae && ae !== document.body && isEditable(ae)) remembered = ae as El
  const start =
    document.querySelector<El>('[role="treeitem"][aria-selected="true"]') ||
    document.querySelector<El>('[role="treeitem"][class*="selected"]') ||
    (ae && ae !== document.body ? (ae as El) : null)
  if (start) {
    ensureFocusable(start)
    start.classList.add(RING)
    target = start
    try {
      start.focus({ preventScroll: true })
    } catch (err) {
      return
    }
    start.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
}

function exitMode(): void {
  active = false
  removeRing()
}

function isVisible(el: Element): boolean {
  if (el.closest && el.closest('[inert]')) return false
  if (el.getAttribute('aria-hidden') === 'true') return false
  const r = el.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return false
  const cs = getComputedStyle(el)
  return cs.display !== 'none' && cs.visibility !== 'hidden'
}

function focusables(): El[] {
  const nodes = document.querySelectorAll<El>(SELECTOR)
  const out: El[] = []
  for (let i = 0; i < nodes.length; i++) {
    if (isVisible(nodes[i])) out.push(nodes[i])
  }
  return out
}

function rectOf(el: Element): DOMRect {
  return el.getBoundingClientRect()
}

/** 从当前高亮目标出发，按方向就近选择下一个可聚焦目标。 */
function pick(dir: Dir): El | null {
  const items = focusables()
  let cur: El | null = target && document.contains(target) ? target : null
  if (!cur) {
    const ae = document.activeElement
    if (ae && ae !== document.body) cur = ae as El
  }
  if (!cur) {
    // 无当前目标：取离视口中心最近者作为起点。
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    let best: El | null = null
    let bestD = Infinity
    for (const el of items) {
      const r = rectOf(el)
      const d = Math.hypot(r.left + r.width / 2 - vw / 2, r.top + r.height / 2 - vh / 2)
      if (d < bestD) {
        bestD = d;
        best = el
      }
    }
    return best
  }
  const cr = rectOf(cur)
  let best: El | null = null
  let bestScore = Infinity
  for (const el of items) {
    if (el === cur) continue
    const r = rectOf(el)
    let score: number
    if (dir === 'up' || dir === 'down') {
      // 上下：严格同列（水平范围必须重叠，容差 -2px），否则跳过。
      let dy: number
      if (dir === 'up') {
        dy = cr.top - r.bottom
        if (dy <= -0.5) continue
      } else {
        dy = r.top - cr.bottom
        if (dy <= -0.5) continue
      }
      const overlap = Math.min(cr.right, r.right) - Math.max(cr.left, r.left)
      if (overlap < -2) continue
      const dx = overlap >= 0 ? 0 : Math.max(r.left - cr.right, cr.left - r.right)
      score = dy + dx * 2.5
    } else {
      // 左右：允许斜向。
      let dx: number
      if (dir === 'left') {
        dx = cr.left - r.right
        if (dx <= -0.5) continue
      } else {
        dx = r.left - cr.right
        if (dx <= -0.5) continue
      }
      const overlap = Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top)
      const dy = overlap >= 0 ? 0 : Math.max(r.top - cr.bottom, cr.top - r.bottom)
      score = dx + dy * 2.5
    }
    if (score < bestScore) {
      bestScore = score;
      best = el
    }
  }
  return best
}

function move(dir: Dir): void {
  const el = pick(dir)
  if (!el) return
  ensureFocusable(el)
  removeRing()
  target = el
  try {
    el.focus({ preventScroll: true })
  } catch (err) {
    return
  }
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  el.classList.add(RING)
}

function closestFocusable(el: Element | null): El | null {
  let node: Element | null = el
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.matches && node.matches(SELECTOR)) return node as El
    node = node.parentElement
  }
  return null
}

function leftClick(): void {
  const el = target && document.contains(target) ? target : (document.activeElement as El | null)
  if (!el || el === document.body) return
  const r = rectOf(el)
  const x = r.left + r.width / 2
  const y = r.top + r.height / 2
  const base: MouseEventInit = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, detail: 1 }
  el.dispatchEvent(new MouseEvent('mousedown', Object.assign({}, base, { button: 0, buttons: 1 })))
  el.dispatchEvent(new MouseEvent('mouseup', Object.assign({}, base, { button: 0, buttons: 0 })))
  el.dispatchEvent(new MouseEvent('click', Object.assign({}, base, { button: 0, buttons: 0 })))
  if (el.isConnected) {
    target = el
    ensureFocusable(el)
    el.focus({ preventScroll: true })
    el.classList.add(RING)
  }
}

function focusComposer(): void {
  if (remembered && remembered.isConnected && isEditable(remembered) && isVisible(remembered)) {
    remembered.focus()
    return
  }
  let best: HTMLTextAreaElement | null = null
  let bestBottom = -Infinity
  const tas = document.querySelectorAll('textarea')
  for (let i = 0; i < tas.length; i++) {
    const t = tas[i]
    if (!isVisible(t) || t.disabled) continue
    const r = rectOf(t)
    if (r.bottom > bestBottom) {
      bestBottom = r.bottom;
      best = t
    }
  }
  if (best) {
    best.focus()
    return
  }
  const alt = document.querySelectorAll<El>('[contenteditable="true"], [role="textbox"]')
  for (let i = 0; i < alt.length; i++) {
    if (isVisible(alt[i])) {
      alt[i].focus()
      return
    }
  }
}

/** 守卫：导航模式下阻止 app 把焦点塞进非高亮目标的输入框。 */
function onFocusIn(e: FocusEvent): void {
  if (!active) return
  const raw = e.target as Element | null
  const path = e.composedPath()
  const real = (path && path.length > 0 ? path[0] : e.target) as Element | null
  const isT = real === target || raw === target
  const ed = isEditable(real) || isEditable(raw)
  if (isT) return
  if (!ed) return
  e.stopImmediatePropagation()
  if (target && target.isConnected) {
    ensureFocusable(target)
    target.focus({ preventScroll: true })
  } else {
    const ae = document.activeElement as HTMLElement | null
    if (ae && typeof ae.blur === 'function') ae.blur()
    if (target) {
      target.classList.remove(RING)
      target = null
    }
  }
}

function onKeyDown(e: KeyboardEvent): void {
  const k = e.key
  if ((k === 'Alt' || k === 'Shift') && e.altKey && e.shiftKey) {
    e.preventDefault()
    e.stopPropagation()
    if (active) {
      exitMode()
    } else {
      enterMode()
    }
    return
  }
  if (!active) return
  if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
    e.preventDefault()
    e.stopPropagation()
    move(k.slice(5).toLowerCase() as Dir)
  } else if (/^[a-zA-Z]$/.test(k)) {
    e.preventDefault()
    e.stopPropagation()
    if (e.repeat) return
    leftClick()
  } else {
    // 任何非字母、非方向键（含 Esc / Enter / 空格 / Tab 等）→ 退出光标移动模式，
    // 并把焦点送回当前会话输入框；事件被消费，不触发其他行为。
    e.preventDefault()
    e.stopPropagation()
    exitMode()
    focusComposer()
  }
}

function onMouseDown(e: MouseEvent): void {
  if (!active || !e.isTrusted) return
  const el = closestFocusable(e.target as Element | null)
  if (el) {
    removeRing()
    ensureFocusable(el)
    el.classList.add(RING)
    target = el
  }
}

export function apply(ctx: NavContext): void {
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-kbd-nav-focus'
    tag.textContent = '.' + RING + '{ outline: 2px solid #4f8cff !important; outline-offset: 2px; border-radius: 4px; }'
    document.head.appendChild(tag)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('focusin', onFocusIn, true)
    return () => {
      tag.remove()
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('focusin', onFocusIn, true)
      exitMode()
    }
  })
}
