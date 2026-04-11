import { apiGet } from "./apisyncClient";

export type ExperimentItem = {
  exp_name: string;
  total_sensors: number;
  active_count: number;
  inactive_count: number;
};

export type ExperimentsResponse = {
  success: boolean;
  count: number;
  experiments: ExperimentItem[];
};

export type SensorMetadata = {
  LLA?: string;
  lla?: string;
  Active_Exp?: boolean;
  active_exp?: boolean;
  Owner?: string;
  owner?: string;
  Mac_Address?: string;
  mac_address?: string;
  Exp_Name?: string;
  exp_name?: string;
  Last_Seen?: string;
  last_seen?: string;
  Updated_At?: string;
  updated_at?: string;
  Last_Package?: Record<string, unknown>;
};

export type SensorsMetadataResponse = {
  success: boolean;
  count: number;
  data: SensorMetadata[];
};

export type ActiveMetadataItem = SensorMetadata & {
  Exp_ID?: number | string;
  exp_id?: number | string;
  Location?: string;
  location?: string;
  Coordinates?: { x?: number | null; y?: number | null; z?: number | null };
  coordinates?: { x?: number | null; y?: number | null; z?: number | null };
  Label?: string | string[];
  label?: string | string[];
  Label_Options?: string[];
  label_options?: string[];
  Last_Seen?: string;
  last_seen?: string;
};

export type ActiveMetadataResponse = {
  success: boolean;
  count?: number;
  data?: ActiveMetadataItem[];
};

export function getSensorsMetadata(owner: string, macAddress: string) {
  const params = new URLSearchParams({
    owner,
    mac_address: macAddress,
  });
  return apiGet<SensorsMetadataResponse>(`/GCP-FS/metadata/sensors?${params.toString()}`);
}

export function getExperiments(owner: string, macAddress: string) {
  const params = new URLSearchParams({
    owner,
    mac_address: macAddress,
  });
  return apiGet<ExperimentsResponse>(`/GCP-FS/metadata/experiments?${params.toString()}`);
}

export function getActiveMetadata(owner: string, macAddress: string, lla: string) {
  const params = new URLSearchParams({
    owner,
    mac_address: macAddress,
    lla,
  });
  return apiGet<ActiveMetadataResponse>(`/GCP-FS/metadata/active?${params.toString()}`);
}
