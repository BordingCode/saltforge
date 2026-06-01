export function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false)
            continue;
        if (k === 'class')
            node.className = v;
        else if (k === 'style' && typeof v === 'object')
            Object.assign(node.style, v);
        else if (k === 'html')
            node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function')
            node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'dataset' && typeof v === 'object')
            Object.assign(node.dataset, v);
        else
            node.setAttribute(k, String(v));
    }
    for (const c of children)
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return node;
}
export const $ = (sel) => document.querySelector(sel);
export function clear(node) { if (node)
    node.replaceChildren(); }
export function mount(into, node) { if (into)
    into.replaceChildren(node); }
let toastTimer = 0;
export function showToast(msg) {
    const wrap = $('#toast-wrap');
    if (!wrap)
        return;
    const t = el('div', { class: 'toast' }, [msg]);
    wrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    window.clearTimeout(toastTimer);
    window.setTimeout(() => { t.classList.remove('show'); window.setTimeout(() => t.remove(), 400); }, 2600);
    // cap stack
    while (wrap.children.length > 4)
        wrap.removeChild(wrap.firstChild);
}
