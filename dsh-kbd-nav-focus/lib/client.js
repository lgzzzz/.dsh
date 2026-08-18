window.__ModuleLoader__.load({ id: "dsh-kbd-nav-focus", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
/**
 * dsh-kbd-nav-focus — 键盘焦点导航（浏览器半部）。
 *
 * - Alt+Shift（按一次）：进入 / 退出自由移动焦点状态（闩锁，无需按住）。
 * - ↑↓←→：按几何方向移动焦点；上下方向严格同列（水平重叠硬过滤，列内走完不移动），
 *   左右方向允许斜向移动。
 * - Enter：对当前高亮元素执行鼠标左键点击，点击后焦点停留原地（不跳走）。
 * - 空格：拦截，防止误触发原生激活。
 * - Esc：退出并把焦点送回当前会话输入框。
 * - 进入导航时，起点固定为侧边栏当前选中的会话行（aria-selected="true"）。
 *
 * 本文件是 TypeScript 源码：由 scripts/build-client.mjs 用 tsc 编译为 CommonJS 并
 * 包进 `window.__ModuleLoader__.load(...)` 后写入 lib/client.js 供 Web 加载。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.name = void 0;
exports.apply = apply;
exports.name = 'dsh-kbd-nav-focus';
const RING = 'dsh-kbd-nav-ring';
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
].join(',');
let active = false;
let target = null;
let remembered = null;
/** 元素是否可被原生编程聚焦（button/input/textarea/select、a[href]、tabindex、contenteditable）。 */
function nativeFocusable(el) {
    if (!el)
        return false;
    const t = el.tagName;
    if (t === 'BUTTON' || t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT')
        return true;
    if (t === 'A' && el.hasAttribute('href'))
        return true;
    if (el.getAttribute('tabindex') !== null)
        return true;
    if (el.getAttribute('contenteditable') !== null)
        return true;
    return false;
}
/** 让目标可编程聚焦：非原生可聚焦的元素先加 tabindex=-1（不进入 Tab 键序）。 */
function ensureFocusable(el) {
    if (!el)
        return;
    if (!nativeFocusable(el)) {
        el.setAttribute('tabindex', '-1');
    }
}
function isEditable(el) {
    return !!el && (el.tagName === 'TEXTAREA' ||
        el.tagName === 'INPUT' ||
        el.getAttribute('contenteditable') === 'true');
}
function removeRing() {
    if (target) {
        target.classList.remove(RING);
        target = null;
    }
}
function enterMode() {
    if (active)
        return;
    active = true;
    const ae = document.activeElement;
    if (ae && ae !== document.body && isEditable(ae))
        remembered = ae;
    const start = document.querySelector('[role="treeitem"][aria-selected="true"]') ||
        document.querySelector('[role="treeitem"][class*="selected"]') ||
        (ae && ae !== document.body ? ae : null);
    if (start) {
        ensureFocusable(start);
        start.classList.add(RING);
        target = start;
        try {
            start.focus({ preventScroll: true });
        }
        catch (err) {
            return;
        }
        start.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
}
function exitMode() {
    active = false;
    removeRing();
}
function isVisible(el) {
    if (el.closest && el.closest('[inert]'))
        return false;
    if (el.getAttribute('aria-hidden') === 'true')
        return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0)
        return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
}
function focusables() {
    const nodes = document.querySelectorAll(SELECTOR);
    const out = [];
    for (let i = 0; i < nodes.length; i++) {
        if (isVisible(nodes[i]))
            out.push(nodes[i]);
    }
    return out;
}
function rectOf(el) {
    return el.getBoundingClientRect();
}
/** 从当前高亮目标出发，按方向就近选择下一个可聚焦目标。 */
function pick(dir) {
    const items = focusables();
    let cur = target && document.contains(target) ? target : null;
    if (!cur) {
        const ae = document.activeElement;
        if (ae && ae !== document.body)
            cur = ae;
    }
    if (!cur) {
        // 无当前目标：取离视口中心最近者作为起点。
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        let best = null;
        let bestD = Infinity;
        for (const el of items) {
            const r = rectOf(el);
            const d = Math.hypot(r.left + r.width / 2 - vw / 2, r.top + r.height / 2 - vh / 2);
            if (d < bestD) {
                bestD = d;
                best = el;
            }
        }
        return best;
    }
    const cr = rectOf(cur);
    let best = null;
    let bestScore = Infinity;
    for (const el of items) {
        if (el === cur)
            continue;
        const r = rectOf(el);
        let score;
        if (dir === 'up' || dir === 'down') {
            // 上下：严格同列（水平范围必须重叠，容差 -2px），否则跳过。
            let dy;
            if (dir === 'up') {
                dy = cr.top - r.bottom;
                if (dy <= -0.5)
                    continue;
            }
            else {
                dy = r.top - cr.bottom;
                if (dy <= -0.5)
                    continue;
            }
            const overlap = Math.min(cr.right, r.right) - Math.max(cr.left, r.left);
            if (overlap < -2)
                continue;
            const dx = overlap >= 0 ? 0 : Math.max(r.left - cr.right, cr.left - r.right);
            score = dy + dx * 2.5;
        }
        else {
            // 左右：允许斜向。
            let dx;
            if (dir === 'left') {
                dx = cr.left - r.right;
                if (dx <= -0.5)
                    continue;
            }
            else {
                dx = r.left - cr.right;
                if (dx <= -0.5)
                    continue;
            }
            const overlap = Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top);
            const dy = overlap >= 0 ? 0 : Math.max(r.top - cr.bottom, cr.top - r.bottom);
            score = dx + dy * 2.5;
        }
        if (score < bestScore) {
            bestScore = score;
            best = el;
        }
    }
    return best;
}
function move(dir) {
    const el = pick(dir);
    if (!el)
        return;
    ensureFocusable(el);
    removeRing();
    target = el;
    try {
        el.focus({ preventScroll: true });
    }
    catch (err) {
        return;
    }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    el.classList.add(RING);
}
function closestFocusable(el) {
    let node = el;
    while (node && node !== document.body && node !== document.documentElement) {
        if (node.matches && node.matches(SELECTOR))
            return node;
        node = node.parentElement;
    }
    return null;
}
function leftClick() {
    const el = target && document.contains(target) ? target : document.activeElement;
    if (!el || el === document.body)
        return;
    const r = rectOf(el);
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const base = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, detail: 1 };
    el.dispatchEvent(new MouseEvent('mousedown', Object.assign({}, base, { button: 0, buttons: 1 })));
    el.dispatchEvent(new MouseEvent('mouseup', Object.assign({}, base, { button: 0, buttons: 0 })));
    el.dispatchEvent(new MouseEvent('click', Object.assign({}, base, { button: 0, buttons: 0 })));
    if (el.isConnected) {
        target = el;
        ensureFocusable(el);
        el.focus({ preventScroll: true });
        el.classList.add(RING);
    }
}
function focusComposer() {
    if (remembered && remembered.isConnected && isEditable(remembered) && isVisible(remembered)) {
        remembered.focus();
        return;
    }
    let best = null;
    let bestBottom = -Infinity;
    const tas = document.querySelectorAll('textarea');
    for (let i = 0; i < tas.length; i++) {
        const t = tas[i];
        if (!isVisible(t) || t.disabled)
            continue;
        const r = rectOf(t);
        if (r.bottom > bestBottom) {
            bestBottom = r.bottom;
            best = t;
        }
    }
    if (best) {
        best.focus();
        return;
    }
    const alt = document.querySelectorAll('[contenteditable="true"], [role="textbox"]');
    for (let i = 0; i < alt.length; i++) {
        if (isVisible(alt[i])) {
            alt[i].focus();
            return;
        }
    }
}
/** 守卫：导航模式下阻止 app 把焦点塞进非高亮目标的输入框。 */
function onFocusIn(e) {
    if (!active)
        return;
    const raw = e.target;
    const path = e.composedPath();
    const real = (path && path.length > 0 ? path[0] : e.target);
    const isT = real === target || raw === target;
    const ed = isEditable(real) || isEditable(raw);
    if (isT)
        return;
    if (!ed)
        return;
    e.stopImmediatePropagation();
    if (target && target.isConnected) {
        ensureFocusable(target);
        target.focus({ preventScroll: true });
    }
    else {
        const ae = document.activeElement;
        if (ae && typeof ae.blur === 'function')
            ae.blur();
        if (target) {
            target.classList.remove(RING);
            target = null;
        }
    }
}
function onKeyDown(e) {
    const k = e.key;
    if ((k === 'Alt' || k === 'Shift') && e.altKey && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (active) {
            exitMode();
        }
        else {
            enterMode();
        }
        return;
    }
    if (!active)
        return;
    if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        move(k.slice(5).toLowerCase());
    }
    else if (k === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        leftClick();
    }
    else if (k === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        exitMode();
        focusComposer();
    }
    else if (k === ' ') {
        e.preventDefault();
        e.stopPropagation();
    }
}
function onMouseDown(e) {
    if (!active || !e.isTrusted)
        return;
    const el = closestFocusable(e.target);
    if (el) {
        removeRing();
        ensureFocusable(el);
        el.classList.add(RING);
        target = el;
    }
}
function apply(ctx) {
    ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset.plugin = 'dsh-kbd-nav-focus';
        tag.textContent = '.' + RING + '{ outline: 2px solid #4f8cff !important; outline-offset: 2px; border-radius: 4px; }';
        document.head.appendChild(tag);
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('mousedown', onMouseDown, true);
        document.addEventListener('focusin', onFocusIn, true);
        return () => {
            tag.remove();
            document.removeEventListener('keydown', onKeyDown, true);
            document.removeEventListener('mousedown', onMouseDown, true);
            document.removeEventListener('focusin', onFocusIn, true);
            exitMode();
        };
    });
}
return module.exports; } });
