import { createStore } from './state/store.js';
import { createApiClient } from './api/client.js';
import { initReceivedPayloadsComponent } from './components/receivedPayloads.js';
import { initExperimentManagementComponent } from './components/experimentManagement.js';
import { initMetadataModalComponent } from './components/metadataModal.js';
import { initErrorPanelComponent } from './components/errorPanel.js';

const store = createStore();
const apiClient = createApiClient({
    getBaseUrl: () => (window.getApiBaseUrl ? window.getApiBaseUrl() : window.location.origin)
});

window.AppModules = {
    store,
    apiClient,
    receivedPayloads: initReceivedPayloadsComponent({ store, apiClient, scope: window }),
    experimentManagement: initExperimentManagementComponent({ store, apiClient, scope: window }),
    metadataModal: initMetadataModalComponent({ store, apiClient, scope: window }),
    errorPanel: initErrorPanelComponent({ store, apiClient, scope: window })
};

window.dispatchEvent(new CustomEvent('modules:ready'));
