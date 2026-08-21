/**
 * dsh-kbd-nav-focus — 键盘焦点导航（浏览器半部）。
 *
 * - Alt+Shift：进入自由移动焦点状态；**已在该状态时再次按 Alt+Shift 只把光标重置回
 *   进入模式时的起点**（侧边栏当前选中的会话行），不会退出。**只有 S 键在触发会话选择
 *   后才会退出该状态**（退出时把焦点送回输入框）。
 * - ↑↓←→：按几何方向移动焦点；上下方向严格同列（水平重叠硬过滤，列内走完不移动），
 *   左右方向允许斜向移动。**输入框（textarea/input/contenteditable/role=textbox 等）
 *   不在移动的可选路径内**——光标移动不会落到输入框上（输入框由 S 退出时主动聚焦）。
 * - C：对当前高亮元素执行鼠标左键点击，点击后焦点停留原地（不跳走）。若点击改变了
 *   布局（例如展开会话列表、删除/归档某项导致锚点被位移或移除），会按“点击前的屏幕
 *   坐标”在下一帧重新锚定光标到最近的可聚焦元素——展开场景下光标会落到新展开会话块
 *   的开头，继续按方向键即可逐个走完，不会被跳过。
 * - S：select —— 只对会话列表中的会话（[role="treeitem"][aria-selected]）生效：
 *   切换至光标所在的会话，然后把焦点送回输入框；光标不在会话上时无动作。
 * - 其它字母键（除 C/S 外）以及非字母、非方向键（含 Esc / Enter / 空格 / Tab 等）：
 *   均未绑定动作，忽略（停留在导航模式），事件被消费不触发其他行为。
 * - 进入导航时，起点固定为侧边栏当前选中的会话行（aria-selected="true"）。
 *
 * 滚动策略（可滚动 UI 内移动焦点）：
 * - **优先**在当前可滚动容器内就近选点：光标不会提前跳出当前 UI 跳到别的面板，
 *   选中的元素若在视口外，scrollIntoView 会自动滚动容器把它带进视野，从而能把
 *   焦点移动到 UI 内任意位置。
 * - 当方向键到达当前可滚动容器的内容尽头（该方向上容器内再无可聚焦元素）时，
 *   先把容器向该方向滚动一整页；若滚动后出现新的可聚焦元素（例如惰性/懒加载
 *   渲染的内容），光标落到新元素上；若滚动后仍无新元素，则复原滚动位置。
 * - 容器内该方向确实没有更多元素时，**允许跳出当前 UI**，改为在整页范围内就近
 *   选择下一个元素（可以把焦点移出列表、移到其它面板）。
 * - 上下方向以**纵向实际溢出**的容器为界、左右方向以**横向实际溢出**的容器为界
 *   （`overflow-y:auto` 的列表不会被误当作横向边界）；无滚动容器时以文档滚动为兜底。
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

/** 输入类元素（文本输入框 / 可编辑区）：导航模式下方向键移动不把光标落到这些元素上。 */
function isInputLike(el: Element | null): boolean {
  if (!el) return false
  const t = el.tagName
  if (t === 'TEXTAREA' || t === 'INPUT') return true
  const role = el.getAttribute('role')
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return true
  return el.getAttribute('contenteditable') === 'true'
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

/**
 * 重置光标位置：已处于导航模式时按 Alt+Shift 触发，把光标移回进入模式时的起点
 * （侧边栏当前选中的会话行，回退 class*="selected"）。不改变 active / remembered，
 * 也不退出导航模式；找不到起点时保持当前位置不动。
 */
function resetMode(): void {
  const start =
    document.querySelector<El>('[role="treeitem"][aria-selected="true"]') ||
    document.querySelector<El>('[role="treeitem"][class*="selected"]')
  if (start) goto(start)
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
    // 输入框（textarea/input/contenteditable/role=textbox 等）不进导航移动的可选路径，
    // 光标移动不会落到输入框上；输入框仍可通过 S 的 focusComposer 由插件主动聚焦。
    if (isInputLike(nodes[i])) continue
    if (isVisible(nodes[i])) out.push(nodes[i])
  }
  return out
}

function rectOf(el: Element): DOMRect {
  return el.getBoundingClientRect()
}

/** 当前高亮目标；失效时回退到活动元素，都没有则 null。 */
function currentTarget(): El | null {
  if (target && document.contains(target)) return target
  const ae = document.activeElement
  if (ae && ae !== document.body) return ae as El
  return null
}

/**
 * 找到元素在指定轴向上的可滚动容器。只有该方向**实际溢出**的祖先才算：
 * 例如 `overflow-y:auto` 的纵向列表，其 `overflow-x` 会被 CSS 计算成 `auto`
 * 但并无横向溢出，不应把它当作横向 UI 边界（否则左右方向也会被锁在列表里）。
 * 找不到则返回 null（表示文档级滚动）。
 */
function scrollContainerOf(el: Element, axis: 'x' | 'y'): Element | null {
  let node: Element | null = el.parentElement
  while (node && node !== document.documentElement) {
    const cs = getComputedStyle(node)
    const ov = axis === 'y' ? cs.overflowY : cs.overflowX
    if (ov === 'auto' || ov === 'scroll' || ov === 'overlay' || ov === 'hidden') {
      const overflowing = axis === 'y'
        ? node.scrollHeight > node.clientHeight
        : node.scrollWidth > node.clientWidth
      if (overflowing) return node
    }
    node = node.parentElement
  }
  return null
}

/** 读取容器（null=文档）在 axis 上的滚动位置。 */
function scrollPos(sc: Element | null, axis: 'x' | 'y'): number {
  if (!sc) return axis === 'y' ? window.scrollY : window.scrollX
  return axis === 'y' ? sc.scrollTop : sc.scrollLeft
}

/** 设置容器（null=文档）在 axis 上的滚动位置。 */
function setScrollPos(sc: Element | null, axis: 'x' | 'y', v: number): void {
  if (!sc) {
    if (axis === 'y') window.scrollTo(window.scrollX, v)
    else window.scrollTo(v, window.scrollY)
  } else if (axis === 'y') {
    sc.scrollTop = v
  } else {
    sc.scrollLeft = v
  }
}

/** 沿 dir 把容器（null=文档）向该方向滚动一整页；返回是否真的发生了滚动。 */
function scrollPage(sc: Element | null, dir: Dir, axis: 'x' | 'y'): boolean {
  const size = axis === 'y'
    ? (sc ? sc.clientHeight : window.innerHeight)
    : (sc ? sc.clientWidth : window.innerWidth)
  const delta = dir === 'down' || dir === 'right' ? size : -size
  const before = scrollPos(sc, axis)
  setScrollPos(sc, axis, before + delta)
  return scrollPos(sc, axis) !== before
}

/** 把焦点/高亮移动到目标元素（preventScroll 聚焦后 scrollIntoView 带进视野）。 */
function goto(el: El): void {
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

/** 无当前目标时的兜底：取离视口中心最近的可聚焦元素作为起点。 */
function nearestToViewportCenter(items: El[]): El | null {
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

/**
 * 从当前高亮目标出发，在 scope（可滚动容器，null=整页）内按方向就近选择下一个
 * 可聚焦目标；scope 之外的候选一律忽略，避免光标跳出当前可滚动 UI。
 */
function pick(dir: Dir, scope: Element | null, cur: El): El | null {
  const items = focusables()
  const cr = rectOf(cur)
  let best: El | null = null
  let bestScore = Infinity
  for (const el of items) {
    if (el === cur) continue
    if (scope && !scope.contains(el)) continue
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
  const cur = currentTarget()
  if (!cur) {
    // 无当前目标：从视口中心最近者起步（保持原有兜底）。
    const start = nearestToViewportCenter(focusables())
    if (start) goto(start)
    return
  }
  const axis: 'x' | 'y' = dir === 'left' || dir === 'right' ? 'x' : 'y'
  const scope = scrollContainerOf(cur, axis)

  // 1) 优先在当前可滚动 UI 内就近选择：光标不会提前跳出当前 UI，
  //    视口外的目标由 goto 里的 scrollIntoView 滚动容器带进视野，
  //    从而能把焦点移到 UI 内任意位置。
  let el = pick(dir, scope, cur)

  // 2) 该方向在容器内已走尽：先把容器向该方向滚动一整页，看滚动后是否出现
  //    新内容（如惰性渲染）；没有则复原滚动位置。
  if (!el && scope) {
    const before = scrollPos(scope, axis)
    if (scrollPage(scope, dir, axis)) {
      el = pick(dir, scope, cur)
      if (!el) setScrollPos(scope, axis, before)
    }
  }

  // 3) 容器内该方向确实没有更多元素：允许跳出当前 UI，在整页范围内就近选择，
  //    从而可以把焦点移到 UI 之外 / 其它面板（不再被锁在列表内）。
  if (!el) {
    el = pick(dir, null, cur)
  }

  if (!el) return
  goto(el)
}

function closestFocusable(el: Element | null): El | null {
  let node: Element | null = el
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.matches && node.matches(SELECTOR)) return node as El
    node = node.parentElement
  }
  return null
}

/**
 * 点击后按“点击前的屏幕坐标”重新锚定光标。点击可能改变布局（例如点击“展开其余 N 个
 * 会话”会在按钮上方插入一批新会话行，把锚点按钮挤到展开块底部；或点击删除/归档把
 * 锚点元素移除）。此时若继续按方向键，会从被位移/移除的锚点出发、跳过新插入的内容。
 * 做法：等下一帧（React 等框架已提交 DOM）后，若原锚点已明显位移或消失，就把光标
 * 移到离点击前坐标最近的可聚焦元素上（展开场景下正好落在新会话块的开头）。
 */
function reanchorAfterLayout(x: number, y: number, prefer: El | null): void {
  requestAnimationFrame(() => {
    if (!active) return
    // 原锚点仍在且几乎没动 → 布局没变，保持现状。
    if (prefer && prefer.isConnected) {
      const pr = rectOf(prefer)
      const px = pr.left + pr.width / 2
      const py = pr.top + pr.height / 2
      if (Math.hypot(px - x, py - y) < 8) return
    }
    // 锚点被位移/移除 → 把光标移到离点击位置最近的可聚焦元素上。
    let best: El | null = null
    let bestD = Infinity
    for (const el of focusables()) {
      const r = rectOf(el)
      const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y)
      if (d < bestD) {
        bestD = d;
        best = el
      }
    }
    if (!best) return
    removeRing()
    ensureFocusable(best)
    target = best
    try {
      best.focus({ preventScroll: true })
    } catch (err) {
      return
    }
    best.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    best.classList.add(RING)
  })
}

/** 对指定元素执行鼠标左键点击（mousedown/mouseup/click），点击后焦点停留原地。 */
function clickElement(el: El): void {
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
  // 点击可能改变布局：等 DOM 提交后按点击前的坐标重新锚定。
  reanchorAfterLayout(x, y, el)
}

function leftClick(): void {
  const el = target && document.contains(target) ? target : (document.activeElement as El | null)
  if (!el || el === document.body) return
  clickElement(el)
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
      // 已处于导航模式：不退出，仅把光标重置回起点（侧边栏当前选中会话行）。
      resetMode()
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
  } else if (k === 'c' || k === 'C') {
    // C：对当前高亮元素执行鼠标左键点击（按住不重复点击）。
    e.preventDefault()
    e.stopPropagation()
    if (e.repeat) return
    leftClick()
  } else if (k === 's' || k === 'S') {
    // S：select —— 只对会话列表中的会话生效。光标在会话行（[role=treeitem][aria-selected]）
    // 上时，切换至该会话，然后把焦点移到输入框；不在会话上则无动作（忽略）。
    e.preventDefault()
    e.stopPropagation()
    const el = target && document.contains(target) ? target : (document.activeElement as El | null)
    const row = el && el !== document.body ? el.closest('[role="treeitem"][aria-selected]') : null
    if (row) {
      clickElement(row as El)
      exitMode()
      focusComposer()
    }
  } else {
    // 其它键（含其它字母键，以及 Esc / Enter / 空格 / Tab 等非字母、非方向键）：
    // 均未绑定动作，忽略（停留在导航模式），事件被消费避免触发浏览器/页面默认行为。
    e.preventDefault()
    e.stopPropagation()
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
    // 记录点击前的坐标：真实 click 可能改变布局（如展开会话列表），
    // 等其提交后按该坐标重新锚定，避免锚点被挤到展开块底部而跳过新内容。
    const r = rectOf(el)
    reanchorAfterLayout(r.left + r.width / 2, r.top + r.height / 2, el)
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
