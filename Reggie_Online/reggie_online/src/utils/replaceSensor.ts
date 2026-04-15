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

/** True if this row looks like a retired “replaced” slot (not a valid replacement pick). */
export function sensorMarkedAsReplacedSlot(sensor: DashboardSensor): boolean {
  const loc = getTrimmedLocation(sensor).toLowerCase();
  if (loc.includes("-replaced")) return true;

  const raw =
    (sensor as Record<string, unknown>).Activity ??
    (sensor as Record<string, unknown>).activity ??
    (sensor as Record<string, unknown>).Status ??
    (sensor as Record<string, unknown>).status;
  if (typeof raw === "string" && raw.toLowerCase().includes("replaced")) return true;

  const rawLabel = sensor.Label ?? sensor.label;
  const labelText = Array.isArray(rawLabel)
    ? rawLabel.map((v) => String(v)).join(" ")
    : String(rawLabel ?? "");
  if (labelText.toLowerCase().includes("replaced")) return true;

  return false;
}

/** Eligible replacements: inactive, not the old LLA, not a replaced slot. */
export function getEligibleReplacementSensors(
  allSensors: DashboardSensor[],
  oldSensor: DashboardSensor
): DashboardSensor[] {
  const oldLla = (oldSensor.LLA ?? oldSensor.lla ?? "").trim();

  return allSensors.filter((candidate) => {
    const lla = (candidate.LLA ?? candidate.lla ?? "").trim();
    if (!lla || lla === oldLla) return false;
    if (sensorMarkedAsReplacedSlot(candidate)) return false;
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

/**
 * When the user pings a sensor while choosing a replacement: if that ping is not a valid
 * replacement option, returns a message to show in red. Returns null if the ping should apply.
 */
export function getReplacementPingRejectionReason(
  oldSensor: DashboardSensor,
  pingLla: string,
  allSensors: DashboardSensor[]
): string | null {
  const trimmed = pingLla.trim();
  if (!trimmed) return null;

  const candidate = allSensors.find((s) => (s.LLA ?? s.lla ?? "").trim() === trimmed);
  if (!candidate) {
    return "Ping is from an LLA that is not on this gateway’s sensor list. Only known sensors can be selected.";
  }
  if (isEligibleReplacementSensor(oldSensor, candidate, allSensors)) {
    return null;
  }

  const oldLla = (oldSensor.LLA ?? oldSensor.lla ?? "").trim();
  if (trimmed === oldLla) {
    return "That ping is the sensor you are replacing. Choose a different inactive sensor (not this LLA).";
  }
  if (sensorMarkedAsReplacedSlot(candidate)) {
    return "That sensor is a replaced slot (location ends with “-replaced”, or status/label says replaced). Those rows are not valid replacements—pick an inactive sensor that is not marked replaced.";
  }
  if (isActiveExpRaw(candidate)) {
    return "That sensor is still active in an experiment. Only inactive sensors can be used as the replacement.";
  }
  return "That sensor is not an eligible replacement. Use the dropdown or ping an inactive sensor from the list.";
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
  if (sensorMarkedAsReplacedSlot(replacement)) {
    return {
      ok: false,
      reason:
        "That sensor is a replaced slot (location/status/label indicates replaced). Pick an inactive sensor that is not a replaced slot.",
    };
  }
  if (!isEligibleReplacementSensor(oldSensor, replacement, allSensors)) {
    return {
      ok: false,
      reason: "Replacement sensor is not eligible (must be inactive, not the same LLA, and not a replaced slot).",
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
