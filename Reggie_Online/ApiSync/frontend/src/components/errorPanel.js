export function initErrorPanelComponent({ store, apiClient, scope = window }) {
    return {
        clear() {
            if (typeof scope.clearErrors === 'function') {
                scope.clearErrors();
            }
        },
        add(payload) {
            if (typeof scope.displayError === 'function') {
                scope.displayError(payload);
            }
        },
        getClient() {
            return apiClient;
        },
        getStore() {
            return store;
        }
    };
}
