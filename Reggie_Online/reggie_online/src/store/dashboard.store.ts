export type DashboardState = {
  sensors: unknown[];
  experiments: unknown[];
  metadata: Record<string, unknown>;
  websocket: {
    connected: boolean;
  };
  ui: {
    loading: boolean;
  };
};

export const initialDashboardState: DashboardState = {
  sensors: [],
  experiments: [],
  metadata: {},
  websocket: {
    connected: false,
  },
  ui: {
    loading: false,
  },
};
