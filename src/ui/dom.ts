// Tiny DOM helpers (el builder) + toast queue renderer. No framework.
export type Attrs = Record<string, any>;

export function el(tag: string, attrs: Attrs = {}, children: Array<Node | string> = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset' && typeof v === 'object') Object.assign(node.dataset, v);
    else node.setAttribute(k, String(v));
  }
  for (const c of children) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

export const $ = (sel: string): HTMLElement | null => document.querySelector(sel);

export function clear(node: HTMLElement | null): void { if (node) node.replaceChildren(); }
export function mount(into: HTMLElement | null, node: Node): void { if (into) into.replaceChildren(node); }

let toastTimer = 0;
export function showToast(msg: string): void {
  const wrap = $('#toast-wrap'); if (!wrap) return;
  const t = el('div', { class: 'toast' }, [msg]);
  wrap.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  window.clearTimeout(toastTimer);
  window.setTimeout(() => { t.classList.remove('show'); window.setTimeout(() => t.remove(), 400); }, 2600);
  // cap stack
  while (wrap.children.length > 4) wrap.removeChild(wrap.firstChild!);
}
