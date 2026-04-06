export function createApiClient({ getBaseUrl }) {
    function base() {
        return (typeof getBaseUrl === 'function' ? getBaseUrl() : window.location.origin) || window.location.origin;
    }

    async function getJson(path) {
        const response = await fetch(base() + path);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
    }

    async function postJson(path, body) {
        const response = await fetch(base() + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body ?? {})
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
    }

    function getWebSocketUrl() {
        const url = new URL(base());
        const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${url.host}/ws/ping`;
    }

    return { getJson, postJson, getWebSocketUrl };
}
