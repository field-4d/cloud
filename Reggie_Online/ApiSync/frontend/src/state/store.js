export function createStore(initialState = {}) {
    const state = {
        payload: {
            filters: { owner: 'all', device: 'all' },
            count: 0
        },
        selection: {
            owner: null,
            macAddress: null,
            experiment: null
        },
        ui: {
            autoRefreshEnabled: true
        },
        ...initialState
    };

    const listeners = new Set();

    function getState() {
        return state;
    }

    function patch(path, value) {
        const parts = String(path || '').split('.').filter(Boolean);
        if (parts.length === 0) return;
        let ref = state;
        for (let i = 0; i < parts.length - 1; i += 1) {
            const key = parts[i];
            if (!ref[key] || typeof ref[key] !== 'object') ref[key] = {};
            ref = ref[key];
        }
        ref[parts[parts.length - 1]] = value;
        listeners.forEach(fn => fn(state));
    }

    function subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    return { getState, patch, subscribe };
}
