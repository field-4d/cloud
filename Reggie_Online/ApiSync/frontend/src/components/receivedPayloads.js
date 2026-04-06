import { escapeHtml, formatDateSafe } from '../utils/formatters.js';

export function initReceivedPayloadsComponent({ store, apiClient, scope = window }) {
    function installOverrides() {
        if (typeof scope.renderPingPayloadCard === 'function') {
            scope.renderPingPayloadCard = function renderPingPayloadCardFromModule(payloadItem, data) {
                if (!payloadItem) return;
                payloadItem.classList.add('payload-item-compact');
                const payload = data?.payload || {};
                const lla = payload.LLA || 'N/A';
                const owner = payload.owner || payload.hostname || 'N/A';
                const macAddress = payload.mac_address || 'N/A';

                payloadItem.innerHTML = component.renderPingCard({
                    ...payload,
                    timestamp: data?.timestamp
                });

                if (typeof scope.bindPayloadIdentityActions === 'function') {
                    scope.bindPayloadIdentityActions(payloadItem, owner, macAddress);
                }
            };
        }
    }

    const component = {
        renderPingCard(payload = {}) {
            const lla = payload.LLA || 'N/A';
            const owner = payload.owner || payload.hostname || 'N/A';
            const mac = payload.mac_address || 'N/A';
            const timestamp = formatDateSafe(payload.timestamp || payload._timestamp || '');
            return `
                <div class="payload-monitor-header">
                    <div class="payload-monitor-title-wrap">
                        <div class="payload-monitor-lla">LLA: ${escapeHtml(lla)}</div>
                    </div>
                    <div class="payload-monitor-time">${escapeHtml(timestamp)}</div>
                </div>
                <div class="payload-monitor-identity">
                    <div class="payload-monitor-identity-item">
                        <span class="payload-monitor-identity-label">Owner:</span>
                        <button type="button" class="payload-identity-chip">${escapeHtml(owner)}</button>
                    </div>
                    <div class="payload-monitor-identity-item">
                        <span class="payload-monitor-identity-label">Device:</span>
                        <button type="button" class="payload-identity-chip">${escapeHtml(mac)}</button>
                    </div>
                </div>
            `;
        },
        resolveOwnerDevice(owner, macAddress) {
            if (!owner || !macAddress) return false;
            if (typeof scope.handlePayloadIdentityClick === 'function') {
                scope.handlePayloadIdentityClick(owner, macAddress);
                return true;
            }
            return false;
        },
        getClient() {
            return apiClient;
        },
        getStore() {
            return store;
        }
    };

    installOverrides();

    return component;
}
