import type { DashboardSensor } from "../hooks/useDeviceDashboard";

export type MetadataBatchPayload = {
  sensors: Array<{
    lla: string;
    hostname: string;
    mac_address: string;
    updates: Record<string, unknown>;
  }>;
};

const UNKNOWN_LOCATION_PLACEHOLDER = "unknown location";

function normalizeExperimentName(value: unknown): string {
  return String(value ?? "").trim();
}

export function isSensorActiveInExperiment(sensor: DashboardSensor): boolean {
  const raw = sensor.Active_Exp ?? sensor.active_exp;
  return raw === true || String(raw).toLowerCase() === "true";
}

function isActiveExpRaw(sensor: DashboardSensor): boolean {
  return isSensorActiveInExperiment(sensor);
}

export function getTrimmedLocation(sensor: DashboardSensor): string {
  return String(sensor.Location ?? sensor.location ?? "").trim();
}

export function hasValidExpId(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "number" && Number.isFinite(value)) return true;
  const s = String(value).trim();
  return s.length > 0;
}

export function getExpNameForReplace(sensor: DashboardSensor): string {
  return normalizeExperimentName(sensor.Exp_Name ?? sensor.exp_name);
}

/** Eligible replacements: full device list, not active in experiment (`active_exp` false), not old LLA. */
export function getEligibleReplacementSensors(
  allSensors: DashboardSensor[],
  oldSensor: DashboardSensor
): DashboardSensor[] {
  const oldLla = (oldSensor.LLA ?? oldSensor.lla ?? "").trim();

  return allSensors.filter((candidate) => {
    const lla = (candidate.LLA ?? candidate.lla ?? "").trim();
    if (!lla || lla === oldLla) return false;
    return !isActiveExpRaw(candidate);
  });
}

export function isEligibleReplacementSensor(
  oldSensor: DashboardSensor,
  candidate: DashboardSensor | undefined,
  allSensors: DashboardSensor[]
): boolean {
  if (!candidate) return false;
  const list = getEligibleReplacementSensors(allSensors, oldSensor);
  const candLla = (candidate.LLA ?? candidate.lla ?? "").trim();
  return list.some((s) => (s.LLA ?? s.lla ?? "").trim() === candLla);
}

export type ReplaceValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateReplacePreconditions(
  oldSensor: DashboardSensor | undefined,
  replacementLla: string,
  selectedOwner: string,
  selectedMac: string,
  allSensors: DashboardSensor[]
): ReplaceValidationResult {
  if (!selectedOwner.trim() || !selectedMac.trim()) {
    return { ok: false, reason: "Owner or MAC is missing for this device." };
  }
  if (!oldSensor) {
    return { ok: false, reason: "No sensor selected to replace." };
  }
  const oldLla = (oldSensor.LLA ?? oldSensor.lla ?? "").trim();
  if (!oldLla) {
    return { ok: false, reason: "Old sensor LLA is missing." };
  }
  const trimmed = replacementLla.trim();
  if (!trimmed) {
    return { ok: false, reason: "Select a replacement sensor." };
  }
  if (trimmed === oldLla) {
    return { ok: false, reason: "Replacement LLA must differ from the sensor being replaced." };
  }

  const loc = getTrimmedLocation(oldSensor);
  if (!loc) {
    return { ok: false, reason: "Current sensor has no valid location in metadata." };
  }
  if (loc.toLowerCase() === UNKNOWN_LOCATION_PLACEHOLDER) {
    return { ok: false, reason: "Current sensor has no valid location in metadata." };
  }

  const expName = getExpNameForReplace(oldSensor);
  if (!expName) {
    return { ok: false, reason: "Current experiment name is missing." };
  }
  const expId = oldSensor.Exp_ID ?? oldSensor.exp_id;
  if (!hasValidExpId(expId)) {
    return { ok: false, reason: "Experiment ID is missing for the current sensor." };
  }

  const replacement = allSensors.find((s) => (s.LLA ?? s.lla ?? "").trim() === trimmed);
  if (!replacement) {
    return { ok: false, reason: "Replacement sensor was not found in the device list." };
  }
  if (!isEligibleReplacementSensor(oldSensor, replacement, allSensors)) {
    return {
      ok: false,
      reason: "Replacement sensor is not eligible (must be inactive and not the same LLA).",
    };
  }

  return { ok: true };
}

export function buildReplaceSensorBatchPayload(
  oldSensor: DashboardSensor,
  newSensor: DashboardSensor,
  hostname: string,
  mac_address: string
): MetadataBatchPayload {
  const oldLla = (oldSensor.LLA ?? oldSensor.lla ?? "").trim();
  const newLla = (newSensor.LLA ?? newSensor.lla ?? "").trim();
  const locRaw = getTrimmedLocation(oldSensor);
  const expName = getExpNameForReplace(oldSensor);
  const expId = oldSensor.Exp_ID ?? oldSensor.exp_id;

  return {
    sensors: [
      {
        lla: oldLla,
        hostname,
        mac_address,
        updates: {
          active_exp: false,
          is_active: false,
          location: `${locRaw}-replaced`,
        },
      },
      {
        lla: newLla,
        hostname,
        mac_address,
        updates: {
          exp_id: expId as string | number,
          exp_name: expName,
          active_exp: true,
          is_active: true,
          location: locRaw,
        },
      },
    ],
  };
}
