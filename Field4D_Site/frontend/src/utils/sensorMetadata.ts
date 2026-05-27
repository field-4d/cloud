/** True when LLA identifies a virtual MAX31855 freezer thermocouple sensor. */
export function isFreezerThermocoupleLla(lla: string): boolean {
  return String(lla).includes('_freezer_thermo_');
}

/** User-facing sensor type label, or null when no special type applies. */
export function getSensorTypeLabel(lla: string): string | null {
  if (isFreezerThermocoupleLla(lla)) return 'Freezer Thermocouple';
  return null;
}

/** Secondary line for sensor dropdown: "Freezer Thermocouple · {lla}". */
export function getSensorTypeSubtitle(llaIds: string[]): string | undefined {
  if (llaIds.length === 0) return undefined;
  const typeLabel = getSensorTypeLabel(llaIds[0]);
  if (!typeLabel) return undefined;
  const llaPart = llaIds.length === 1 ? llaIds[0] : llaIds.join(', ');
  return `${typeLabel} · ${llaPart}`;
}
