export function byId(id, root = document) {
    return root.getElementById(id);
}

export function qs(selector, root = document) {
    return root.querySelector(selector);
}

export function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
}

export function on(el, eventName, handler, options) {
    if (!el || typeof handler !== 'function') return () => {};
    el.addEventListener(eventName, handler, options);
    return () => el.removeEventListener(eventName, handler, options);
}
