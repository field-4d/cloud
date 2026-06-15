import { apiGet } from "./apisyncClient";

export type PermissionsDeviceInfo = {
  mac_address: string;
  device_name?: string | null;
  description?: string | null;
  ip_addresses?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  source?: string | null;
};

export type PermissionsResponse = {
  success: boolean;
  email: string;
  owners: Array<{
    owner: string;
    mac_addresses: string[];
    devices?: PermissionsDeviceInfo[];
  }>;
};

export function resolvePermissions(email: string) {
  const query = encodeURIComponent(email);
  return apiGet<PermissionsResponse>(`/GCP-FS/permissions/resolve?email=${query}`);
}
