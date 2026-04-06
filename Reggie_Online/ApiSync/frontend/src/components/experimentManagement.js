import { escapeHtml, formatDateSafe, syntaxHighlightJson } from '../utils/formatters.js';

function statusFromLastSeen(lastSeen) {
    const parsedMs = Date.parse(lastSeen || '');
    if (!Number.isFinite(parsedMs)) {
        return { cssClass: 'offline', text: 'Offline', title: 'Invalid or missing Last Seen' };
    }
    const deltaSeconds = Math.max(0, Math.floor((Date.now() - parsedMs) / 1000));
    if (deltaSeconds < 60) return { cssClass: 'online', text: 'Online', title: `Last Seen ${deltaSeconds}s ago` };
    if (deltaSeconds > 180) return { cssClass: 'offline', text: 'Offline', title: `Last Seen ${deltaSeconds}s ago` };
    return { cssClass: 'delayed', text: 'Delayed', title: `Last Seen ${deltaSeconds}s ago` };
}

export function initExperimentManagementComponent({ store, apiClient, scope = window }) {
    const component = {
        renderSensorStatusChip(lastSeen) {
            const status = statusFromLastSeen(lastSeen);
            return `<span class="sensor-card-status-chip ${status.cssClass}" title="${escapeHtml(status.title)}">${status.text}</span>`;
        },
        renderTelemetryJson(lastPackage) {
            if (!lastPackage || typeof lastPackage !== 'object') {
                return '<span class="last-package-field-missing">No package data for this sensor.</span>';
            }
            return `
                <details>
                    <summary>Last_Package JSON</summary>
                    <div class="json-wrap">
                        <pre>${syntaxHighlightJson(lastPackage)}</pre>
                    </div>
                </details>
            `;
        },
        formatSensorTimestamp(value) {
            return formatDateSafe(value);
        },
        getClient() {
            return apiClient;
        },
        getStore() {
            return store;
        },
        refreshCurrentView() {
            if (typeof scope.refreshCurrentSensorView === 'function') {
                scope.refreshCurrentSensorView();
            }
        }
    };

    if (typeof scope.renderSensorStatusBadgeHtml === 'function') {
        scope.renderSensorStatusBadgeHtml = function renderSensorStatusBadgeHtmlFromModule(lastSeen) {
            return component.renderSensorStatusChip(lastSeen);
        };
    }

    return component;
}
