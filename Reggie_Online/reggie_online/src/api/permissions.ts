import { apiGet } from "./apisyncClient";

export type PermissionsResponse = {
  success: boolean;
  email: string;
  owners: Array<{ owner: string; mac_addresses: string[] }>;
};

export function resolvePermissions(email: string) {
  const query = encodeURIComponent(email);
  return apiGet<PermissionsResponse>(`/GCP-FS/permissions/resolve?email=${query}`);
}
