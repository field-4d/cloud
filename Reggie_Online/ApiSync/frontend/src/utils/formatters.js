export function formatDateSafe(value) {
    if (!value) return 'N/A';
    try {
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return String(value);
        return parsed.toLocaleString();
    } catch {
        return String(value);
    }
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function syntaxHighlightJson(value) {
    const escaped = escapeHtml(JSON.stringify(value ?? {}, null, 2));
    return escaped.replace(
        /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g,
        (match) => {
            if (/^"/.test(match)) {
                if (/:$/.test(match)) return `<span class="json-key">${match}</span>`;
                return `<span class="json-string">${match}</span>`;
            }
            if (match === 'true' || match === 'false') return `<span class="json-boolean">${match}</span>`;
            if (match === 'null') return `<span class="json-null">${match}</span>`;
            return `<span class="json-number">${match}</span>`;
        }
    );
}
