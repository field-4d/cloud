import type { PermissionsResponse } from "../api/permissions";

export function normalizeMac(mac: string | null | undefined): string {
  if (mac == null || mac === "") return "";
  return String(mac).trim().toLowerCase();
}

/**
 * Resolves a friendly device label from permissions resolve `devices[]`, else returns MAC.
 */
export function getDeviceDisplayLabel(
  owner: string,
  mac: string,
  owners: PermissionsResponse["owners"] | undefined
): string {
  const macStr = String(mac).trim();
  if (!owner || !macStr) return macStr;
  if (!owners?.length) return macStr;

  const group = owners.find((g) => g?.owner === owner);
  if (!group?.devices?.length) return macStr;

  const macNorm = normalizeMac(macStr);
  const row = group.devices.find((d) => normalizeMac(d?.mac_address) === macNorm);
  const name = row?.device_name != null ? String(row.device_name).trim() : "";
  return name || macStr;
}
