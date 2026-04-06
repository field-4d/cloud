export function initMetadataModalComponent({ store, apiClient, scope = window }) {
    return {
        open(payload) {
            if (typeof scope.showMetadataModal === 'function') {
                scope.showMetadataModal(payload);
            }
        },
        close() {
            if (typeof scope.closeMetadataModal === 'function') {
                scope.closeMetadataModal();
            }
        },
        save(formPayload) {
            if (typeof scope.saveMetadataChanges === 'function') {
                return scope.saveMetadataChanges(formPayload);
            }
            return Promise.resolve();
        },
        getClient() {
            return apiClient;
        },
        getStore() {
            return store;
        }
    };
}
