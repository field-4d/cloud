import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "../components/Header/Header";
import SensorDetailsModal from "../components/Modals/SensorDetailsModal";
import CenteredDialog from "../components/Modals/CenteredDialog";
import DashboardTopBar from "../components/Dashboard/DashboardTopBar";
import { formatIsoToLocal } from "../utils/date";
import { buildCsv, triggerCsvDownload } from "../utils/csv";
import { parseCsvRows } from "../utils/csvUpload";
import {
  UNASSIGNED_EXPERIMENT,
  useDeviceDashboard,
  type DashboardSensor,
} from "../hooks/useDeviceDashboard";
import ReplaceSensorModal from "../components/Modals/ReplaceSensorModal";
import {
  buildReplaceSensorBatchPayload,
  isSensorActiveInExperiment,
  validateReplacePreconditions,
} from "../utils/replaceSensor";
import { useNavigate, useSearchParams } from "react-router-dom";

const REPLACE_SUCCESS_MESSAGE =
  "Replacement request sent successfully. Changes will appear in the frontend only after the next metadata sync. This may take up to 10 minutes.";
const REQUIRED_UPLOAD_COLUMNS = [
  "Exp_Name",
  "LLA",
  "Location",
  "Label",
  "Coordinates_X",
  "Coordinates_Y",
  "Coordinates_Z",
] as const;

type MetadataBatchPayload = {
  sensors: Array<{
    lla: string;
    hostname: string;
    mac_address: string;
    updates: Record<string, unknown>;
  }>;
};

type PendingUploadSummary = {
  expName: string;
  sensorsToUpdate: number;
  rowsWithLabels: number;
  rowsWithRealCoordinates: number;
  rowsWithLocations: number;
};

type UploadToast = {
  kind: "success" | "error";
  message: string;
};

type CsvValidationIssue = {
  rowLabel: string;
  metaLine: string;
  message: string;
};

type ExperimentActionErrorDialog = {
  title: string;
  message: string;
};

type ExperimentActionMode = "hidden" | "start" | "end";
type ExperimentHeaderStatus = "running" | "prepared" | "idle";

type PingToastState = {
  lla: string;
  title: string;
};

const LS_LAST_OWNER = "f4d_last_owner";
const LS_LAST_MAC = "f4d_last_mac";
const LS_PREFERRED_OWNER = "f4d_preferred_owner";
const LS_PREFERRED_MAC = "f4d_preferred_mac";
const LS_SKIP_DEVICE_PROMPT = "f4d_skip_device_prompt";

function sanitizeFilenameSuffix(value: string): string {
  const cleaned = value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "unnamed_experiment";
}

/** Mirrors experimentScopedSensors in useDeviceDashboard. */
function normalizeExperimentName(value: unknown): string {
  return String(value ?? "").trim();
}

function isSensorVisibleForExperimentFilter(
  sensor: DashboardSensor | undefined,
  selectedExperiment: string
): boolean {
  if (!sensor) return false;
  if (selectedExperiment === "all") return true;
  const exp = normalizeExperimentName(sensor.Exp_Name ?? sensor.exp_name);
  if (selectedExperiment === UNASSIGNED_EXPERIMENT) return !exp;
  return exp === selectedExperiment;
}

function DashboardPage() {
  const [searchParams] = useSearchParams();
  const selectedOwner = (searchParams.get("owner") ?? "").trim();
  const selectedMac = (searchParams.get("mac") ?? "").trim();
  const [nowTs, setNowTs] = useState(Date.now());
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingUploadPayload, setPendingUploadPayload] = useState<MetadataBatchPayload | null>(null);
  const [pendingUploadSummary, setPendingUploadSummary] = useState<PendingUploadSummary | null>(null);
  const [uploadToast, setUploadToast] = useState<UploadToast | null>(null);
  const [showClearPreparedConfirm, setShowClearPreparedConfirm] = useState(false);
  const [showPreferredPrompt, setShowPreferredPrompt] = useState(false);
  const [showStartExperimentConfirm, setShowStartExperimentConfirm] = useState(false);
  const [showEndExperimentConfirm, setShowEndExperimentConfirm] = useState(false);
  const [experimentActionError, setExperimentActionError] = useState<ExperimentActionErrorDialog | null>(null);
  const [csvValidationIssues, setCsvValidationIssues] = useState<CsvValidationIssue[]>([]);
  const [csvValidationTotalCount, setCsvValidationTotalCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!uploadToast) return;
    const ms = uploadToast.message.startsWith("Replacement request sent") ? 12000 : 4000;
    const timer = window.setTimeout(() => setUploadToast(null), ms);
    return () => window.clearTimeout(timer);
  }, [uploadToast]);

  useEffect(() => {
    if (!selectedOwner || !selectedMac) return;
    localStorage.setItem(LS_LAST_OWNER, selectedOwner);
    localStorage.setItem(LS_LAST_MAC, selectedMac);
  }, [selectedOwner, selectedMac]);

  useEffect(() => {
    if (!selectedOwner || !selectedMac) return;
    const preferredOwner = localStorage.getItem(LS_PREFERRED_OWNER) ?? "";
    const preferredMac = localStorage.getItem(LS_PREFERRED_MAC) ?? "";
    const skipPrompt = (localStorage.getItem(LS_SKIP_DEVICE_PROMPT) ?? "").toLowerCase() === "true";
    const hasPreferred = Boolean(preferredOwner && preferredMac);
    if (!hasPreferred && !skipPrompt) setShowPreferredPrompt(true);
  }, [selectedOwner, selectedMac]);

  const sensorsRef = useRef<DashboardSensor[]>([]);
  const cardRefsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [pingHighlightLla, setPingHighlightLla] = useState<string | null>(null);
  const [pingToast, setPingToast] = useState<PingToastState | null>(null);
  const pingHighlightTimerRef = useRef<number | null>(null);
  const pingToastTimerRef = useRef<number | null>(null);
  const pendingPingScrollLlaRef = useRef<string | null>(null);
  const replacePingBridgeRef = useRef<(lla: string) => void>(() => {});

  const [replaceTarget, setReplaceTarget] = useState<DashboardSensor | null>(null);
  const [replaceReplacementLla, setReplaceReplacementLla] = useState("");
  const [replaceSubmitting, setReplaceSubmitting] = useState(false);

  const handleSensorPing = useCallback((lla: string) => {
    const sensor = sensorsRef.current.find((s) => (s.LLA ?? s.lla) === lla);
    const title = String(sensor?.Location ?? sensor?.location ?? lla);

    if (pingHighlightTimerRef.current !== null) {
      window.clearTimeout(pingHighlightTimerRef.current);
      pingHighlightTimerRef.current = null;
    }
    if (pingToastTimerRef.current !== null) {
      window.clearTimeout(pingToastTimerRef.current);
      pingToastTimerRef.current = null;
    }

    setPingHighlightLla(null);
    requestAnimationFrame(() => {
      setPingHighlightLla(lla);
      pingHighlightTimerRef.current = window.setTimeout(() => {
        setPingHighlightLla(null);
        pingHighlightTimerRef.current = null;
      }, 4500);
    });

    setPingToast({ lla, title });
    pingToastTimerRef.current = window.setTimeout(() => {
      setPingToast(null);
      pingToastTimerRef.current = null;
    }, 5000);

    replacePingBridgeRef.current(lla);
  }, []);

  useEffect(() => {
    return () => {
      if (pingHighlightTimerRef.current !== null) window.clearTimeout(pingHighlightTimerRef.current);
      if (pingToastTimerRef.current !== null) window.clearTimeout(pingToastTimerRef.current);
    };
  }, []);

  const {
    experimentOptions,
    sensors,
    error,
    lastRefreshAt,
    isRefreshing,
    selectedExperiment,
    sensorSearch,
    sortMode,
    selectedActivities,
    selectedLabels,
    labelOptions,
    detailsOpen,
    detailsLoading,
    detailsError,
    detailsData,
    selectedSensor,
    experimentScopedSensors,
    sortedSensors,
    groupedSortedSensors,
    getSensorStatus,
    getSensorKey,
    setSensorSearch,
    setSortMode,
    toggleActivityFilter,
    toggleLabelFilter,
    clearFilters,
    handleManualRefresh,
    refreshDeviceData,
    handleExperimentPillClick,
    openSensorDetails,
    closeSensorDetails,
  } = useDeviceDashboard({
    owner: selectedOwner,
    mac: selectedMac,
    nowTs,
    onSensorPing: handleSensorPing,
  });

  useEffect(() => {
    sensorsRef.current = sensors;
  }, [sensors]);

  const setSensorCardRef = useCallback((lla: string) => (el: HTMLElement | null) => {
    if (el) cardRefsRef.current.set(lla, el);
    else cardRefsRef.current.delete(lla);
  }, []);

  const scrollPingToastIntoView = useCallback(() => {
    if (!pingToast) return;
    const sensor = sensorsRef.current.find((s) => (s.LLA ?? s.lla) === pingToast.lla);

    const needsSwitchToAll =
      selectedExperiment !== "all" &&
      selectedExperiment !== UNASSIGNED_EXPERIMENT &&
      !isSensorVisibleForExperimentFilter(sensor, selectedExperiment);

    if (needsSwitchToAll) {
      pendingPingScrollLlaRef.current = pingToast.lla;
      handleExperimentPillClick("all");
      return;
    }

    cardRefsRef.current.get(pingToast.lla)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [pingToast, selectedExperiment, handleExperimentPillClick]);

  useEffect(() => {
    if (selectedExperiment !== "all") return;
    const lla = pendingPingScrollLlaRef.current;
    if (!lla) return;
    pendingPingScrollLlaRef.current = null;

    const tryScroll = () => {
      const el = cardRefsRef.current.get(lla);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return true;
      }
      return false;
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!tryScroll()) {
          window.setTimeout(() => {
            tryScroll();
          }, 100);
        }
      });
    });
  }, [selectedExperiment, groupedSortedSensors, sortedSensors]);

  const hasValidContext = Boolean(selectedOwner && selectedMac);

  const activeSummary = useMemo(() => {
    const total = experimentScopedSensors.length;
    const active = experimentScopedSensors.reduce((count, sensor) => {
      const raw = sensor.Active_Exp ?? sensor.active_exp;
      return raw ? count + 1 : count;
    }, 0);
    return { active, total };
  }, [experimentScopedSensors]);

  const refreshCountdownSeconds = useMemo(() => {
    if (isRefreshing) return 0;
    if (!lastRefreshAt) return 30;
    const elapsed = Math.max(0, Math.floor((nowTs - new Date(lastRefreshAt).getTime()) / 1000));
    return Math.max(0, 30 - elapsed);
  }, [isRefreshing, lastRefreshAt, nowTs]);

  const selectedExperimentSensors = useMemo(() => {
    if (selectedExperiment === "all") return [];
    return experimentScopedSensors;
  }, [experimentScopedSensors, selectedExperiment]);

  const canClearPreparedExperiment = useMemo(() => {
    if (selectedExperiment === "all") return false;
    if (selectedExperimentSensors.length === 0) return false;
    return selectedExperimentSensors.every((sensor) => (sensor.Active_Exp ?? sensor.active_exp) === false);
  }, [selectedExperiment, selectedExperimentSensors]);

  const isExperimentActionScope =
    selectedExperiment !== "all" && selectedExperiment !== UNASSIGNED_EXPERIMENT;

  const activeSensorCountInExperiment = useMemo(
    () =>
      selectedExperimentSensors.reduce((count, sensor) => {
        const raw = sensor.Active_Exp ?? sensor.active_exp;
        const isActive = raw === true || String(raw).toLowerCase() === "true";
        return isActive ? count + 1 : count;
      }, 0),
    [selectedExperimentSensors]
  );

  const experimentHasSensors = selectedExperimentSensors.length > 0;
  const experimentActionMode: ExperimentActionMode = !isExperimentActionScope || !experimentHasSensors
    ? "hidden"
    : activeSensorCountInExperiment > 0
      ? "end"
      : "start";

  const experimentHeaderStatus: ExperimentHeaderStatus =
    selectedExperiment === "all" || experimentScopedSensors.length === 0
      ? "idle"
      : experimentScopedSensors.some((sensor) => {
            const raw = sensor.Active_Exp ?? sensor.active_exp;
            return raw === true || String(raw).toLowerCase() === "true";
          })
        ? "running"
        : "prepared";

  function getExperimentActionTimestamp(): string {
    return new Date().toISOString().slice(0, 19);
  }

  function resetUploadInput(target?: HTMLInputElement | null) {
    if (target) target.value = "";
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  }

  function parseCsvValidationIssue(issueText: string): CsvValidationIssue {
    const [headerRaw, ...rest] = issueText.split("\n");
    const detail = rest.join("\n").trim();
    const header = headerRaw.trim();
    const match = header.match(/^Row\s+(\d+)(?:\s+\((.+)\))?$/);
    const rowLabel = match ? `Row ${match[1]}` : "Row";
    const metaLine = match?.[2] ?? "";
    return {
      rowLabel,
      metaLine,
      message: detail || issueText,
    };
  }

  async function postBatchMetadataUpdate(batchPayload: MetadataBatchPayload): Promise<boolean> {
    const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
    if (!apiBase) {
      setExperimentActionError({
        title: "Cannot update experiment",
        message: "Missing API base URL (VITE_API_BASE).",
      });
      return false;
    }

    try {
      const response = await fetch(`${apiBase}/FS/sensor/update-metadata`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batchPayload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) {
        console.error("Experiment action failed.", {
          status: response.status,
          statusText: response.statusText,
          response: body,
        });
        setExperimentActionError({
          title: "Experiment update failed",
          message: "Request to update experiment state failed. Check console for details.",
        });
        return false;
      }
      return true;
    } catch (error) {
      console.error("Experiment action threw an error.", error);
      setExperimentActionError({
        title: "Experiment update failed",
        message: "Network/runtime error while updating experiment state.",
      });
      return false;
    }
  }

  function handleCloseReplaceModal() {
    if (replaceSubmitting) return;
    setReplaceTarget(null);
    setReplaceReplacementLla("");
  }

  async function handleConfirmReplaceSensor() {
    if (!replaceTarget || replaceSubmitting) return;
    const v = validateReplacePreconditions(
      replaceTarget,
      replaceReplacementLla,
      selectedOwner,
      selectedMac,
      sensors
    );
    if (v.ok === false) {
      setExperimentActionError({ title: "Cannot replace sensor", message: v.reason });
      return;
    }
    const newSensor = sensors.find((s) => (s.LLA ?? s.lla ?? "").trim() === replaceReplacementLla.trim());
    if (!newSensor) {
      setExperimentActionError({
        title: "Cannot replace sensor",
        message: "Replacement sensor was not found.",
      });
      return;
    }
    setReplaceSubmitting(true);
    try {
      const payload = buildReplaceSensorBatchPayload(replaceTarget, newSensor, selectedOwner, selectedMac);
      const ok = await postBatchMetadataUpdate(payload);
      if (ok) {
        setReplaceTarget(null);
        setReplaceReplacementLla("");
        setUploadToast({ kind: "success", message: REPLACE_SUCCESS_MESSAGE });
        await refreshDeviceData(selectedOwner, selectedMac);
      }
    } finally {
      setReplaceSubmitting(false);
    }
  }

  function handleStartExperimentClick() {
    if (!isExperimentActionScope) return;
    if (!experimentHasSensors) {
      setExperimentActionError({
        title: "Cannot start experiment.",
        message: `No sensors are assigned to experiment "${selectedExperiment}".`,
      });
      return;
    }

    const activeSensors = selectedExperimentSensors.filter((sensor) => {
      const raw = sensor.Active_Exp ?? sensor.active_exp;
      return raw === true || String(raw).toLowerCase() === "true";
    });
    const inactiveSensors = selectedExperimentSensors.filter((sensor) => {
      const raw = sensor.Active_Exp ?? sensor.active_exp;
      return !(raw === true || String(raw).toLowerCase() === "true");
    });

    if (activeSensors.length > 0 && inactiveSensors.length > 0) {
      const previewLines = activeSensors.slice(0, 3).map((sensor) => {
        const lla = sensor.LLA ?? sensor.lla ?? "unknown_lla";
        const activeIn = String(sensor.Exp_Name ?? sensor.exp_name ?? "UNASSIGNED");
        return `${lla} (active in ${activeIn})`;
      });
      const remainingCount = activeSensors.length - previewLines.length;
      const moreLine = remainingCount > 0 ? `\n\n...and ${remainingCount} more sensors` : "";
      setExperimentActionError({
        title: `Cannot start experiment "${selectedExperiment}".`,
        message: `Some sensors are already active:\n\n${previewLines.join("\n")}${moreLine}\n\nPlease end the running experiment first.`,
      });
      return;
    }

    setShowStartExperimentConfirm(true);
  }

  function handleEndExperimentClick() {
    if (!isExperimentActionScope) return;
    if (!experimentHasSensors) {
      setExperimentActionError({
        title: "Cannot end experiment.",
        message: `No sensors are assigned to experiment "${selectedExperiment}".`,
      });
      return;
    }
    setShowEndExperimentConfirm(true);
  }

  async function handleConfirmStartExperiment() {
    const timestamp = getExperimentActionTimestamp();
    const batchPayload: MetadataBatchPayload = {
      sensors: selectedExperimentSensors
        .map((sensor) => {
          const lla = (sensor.LLA ?? sensor.lla ?? "").trim();
          if (!lla) return null;
          return {
            lla,
            hostname: selectedOwner,
            mac_address: selectedMac,
            updates: {
              exp_name: selectedExperiment,
              exp_location: String(
                (sensor as Record<string, unknown>).Exp_Location ??
                  (sensor as Record<string, unknown>).exp_location ??
                  sensor.Location ??
                  sensor.location ??
                  ""
              ),
              active_exp: true,
              is_active: true,
              exp_started_at: timestamp,
            },
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    };
    if (batchPayload.sensors.length === 0) {
      setExperimentActionError({
        title: "Cannot start experiment.",
        message: `No sensors are assigned to experiment "${selectedExperiment}".`,
      });
      setShowStartExperimentConfirm(false);
      return;
    }

    const ok = await postBatchMetadataUpdate(batchPayload);
    if (!ok) return;

    setShowStartExperimentConfirm(false);
    await refreshAfterExperimentMutation(selectedExperiment);
    setUploadToast({ kind: "success", message: `Started experiment "${selectedExperiment}".` });
  }

  async function handleConfirmEndExperiment() {
    const timestamp = getExperimentActionTimestamp();
    const batchPayload: MetadataBatchPayload = {
      sensors: selectedExperimentSensors
        .map((sensor) => {
          const lla = (sensor.LLA ?? sensor.lla ?? "").trim();
          if (!lla) return null;
          return {
            lla,
            hostname: selectedOwner,
            mac_address: selectedMac,
            updates: {
              active_exp: false,
              exp_ended_at: timestamp,
              exp_id: "",
              exp_name: "",
              exp_location: "",
              exp_started_at: null,
              label: [],
              label_options: [],
              location: null,
              coordinates: { x: null, y: null, z: null },
            },
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    };
    if (batchPayload.sensors.length === 0) {
      setExperimentActionError({
        title: "Cannot end experiment.",
        message: `No sensors are assigned to experiment "${selectedExperiment}".`,
      });
      setShowEndExperimentConfirm(false);
      return;
    }

    const ok = await postBatchMetadataUpdate(batchPayload);
    if (!ok) return;

    setShowEndExperimentConfirm(false);
    await refreshAfterExperimentMutation(selectedExperiment);
    setUploadToast({
      kind: "success",
      message: `Experiment "${selectedExperiment}" ended for ${selectedExperimentSensors.length} sensors.`,
    });
  }

  function handleHomeClick() {
    navigate("/");
  }

  function handleUploadCsvClick() {
    resetUploadInput();
    uploadInputRef.current?.click();
  }

  function handleDownloadCsvClick() {
    const toCsvCell = (value: unknown): string | number | boolean | null | undefined => {
      if (value === null || value === undefined) return "";
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
      return String(value);
    };

    const headers = [
      "Exp_Name",
      "LLA",
      "Location",
      "Label",
      "Coordinates_X",
      "Coordinates_Y",
      "Coordinates_Z",
    ];

    const rows = experimentScopedSensors.map((sensor) => {
      const labelRaw = sensor.Label ?? sensor.label;
      const label = Array.isArray(labelRaw) ? labelRaw.join("|") : (labelRaw ?? "");

      const coordinates =
        (sensor as Record<string, unknown>).Coordinates ??
        (sensor as Record<string, unknown>).coordinates;
      const coordinatesRecord =
        coordinates && typeof coordinates === "object" ? (coordinates as Record<string, unknown>) : undefined;

      return [
        toCsvCell(sensor.Exp_Name ?? sensor.exp_name ?? ""),
        toCsvCell(sensor.LLA ?? sensor.lla),
        toCsvCell(sensor.Location ?? sensor.location),
        toCsvCell(label),
        toCsvCell(coordinatesRecord?.x ?? coordinatesRecord?.X),
        toCsvCell(coordinatesRecord?.y ?? coordinatesRecord?.Y),
        toCsvCell(coordinatesRecord?.z ?? coordinatesRecord?.Z),
      ];
    });

    const csv = buildCsv(headers, rows);
    const safeOwner = (selectedOwner || "unknown_owner").replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeMac = (selectedMac || "unknown_mac").replace(/[^a-zA-Z0-9_-]/g, "_");
    const selectedExperimentTrimmed = selectedExperiment.trim();
    const scopePart =
      selectedExperimentTrimmed === "all"
        ? "all"
        : selectedExperimentTrimmed === UNASSIGNED_EXPERIMENT
          ? "unassigned"
          : sanitizeFilenameSuffix(selectedExperimentTrimmed);
    const filename = `field4d_sensor_metadata_template_${safeOwner}_${safeMac}_${scopePart}.csv`;
    triggerCsvDownload(filename, csv);
    if (
      selectedExperimentTrimmed !== "all" &&
      selectedExperimentTrimmed !== UNASSIGNED_EXPERIMENT &&
      scopePart !== selectedExperimentTrimmed
    ) {
      setUploadToast({
        kind: "error",
        message: `Experiment name contained unsupported filename characters. Downloaded as: ${scopePart}`,
      });
    }
  }

  async function handleUploadFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingUploadPayload(null);
    setPendingUploadSummary(null);
    setCsvValidationIssues([]);
    setCsvValidationTotalCount(0);

    const text = await file.text();
    const parsed = parseCsvRows(text);

    if (parsed.length === 0) {
      console.error("CSV upload validation failed:", ["CSV is empty or missing a header row."]);
      resetUploadInput(event.currentTarget);
      return;
    }

    const header = parsed[0].map((cell) => cell.trim());
    if (header.length === 0 || header.every((cell) => !cell)) {
      console.error("CSV upload validation failed:", ["CSV header row is missing."]);
      resetUploadInput(event.currentTarget);
      return;
    }

    const colIndex = new Map<string, number>();
    header.forEach((name, index) => colIndex.set(name, index));
    const missingColumns = REQUIRED_UPLOAD_COLUMNS.filter((column) => !colIndex.has(column));
    if (missingColumns.length > 0) {
      console.error("CSV upload validation failed:", [`Missing required columns: ${missingColumns.join(", ")}`]);
      resetUploadInput(event.currentTarget);
      return;
    }

    const sensorCountByLla = new Map<string, number>();
    sensors.forEach((sensor) => {
      const lla = (sensor.LLA ?? sensor.lla ?? "").trim();
      if (!lla) return;
      sensorCountByLla.set(lla, (sensorCountByLla.get(lla) ?? 0) + 1);
    });

    const seenLla = new Set<string>();
    const seenLocations = new Set<string>();
    const seenCoordinateTriplets = new Set<string>();
    const seenExpNames = new Set<string>();
    const globalLabelOptionsSet = new Set<string>();
    const rowErrors: string[] = [];
    const validPayloadItems: MetadataBatchPayload["sensors"] = [];
    let rowsWithLabels = 0;
    let rowsWithRealCoordinates = 0;
    let rowsWithLocations = 0;

    const dataRows = parsed.slice(1).filter((row) => row.some((cell) => cell.trim() !== ""));
    if (dataRows.length === 0) {
      console.error("CSV upload validation failed:", ["CSV contains no non-empty data rows."]);
      resetUploadInput(event.currentTarget);
      return;
    }

    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
      const row = dataRows[rowIndex];
      const csvRowNumber = rowIndex + 2;

      const lla = (row[colIndex.get("LLA") ?? -1] ?? "").trim();
      const rawLabel = (row[colIndex.get("Label") ?? -1] ?? "").trim();
      const parsedLabels = rawLabel
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean);
      const location = (row[colIndex.get("Location") ?? -1] ?? "").trim();
      const expName = (row[colIndex.get("Exp_Name") ?? -1] ?? "").trim();
      const rawX = (row[colIndex.get("Coordinates_X") ?? -1] ?? "").trim();
      const rawY = (row[colIndex.get("Coordinates_Y") ?? -1] ?? "").trim();
      const rawZ = (row[colIndex.get("Coordinates_Z") ?? -1] ?? "").trim();

      const currentRowErrors: string[] = [];

      if (!lla) {
        currentRowErrors.push(`Row ${csvRowNumber}: LLA is required.`);
      } else {
        if (seenLla.has(lla)) currentRowErrors.push(`Row ${csvRowNumber}: duplicate LLA "${lla}" in uploaded file.`);
        seenLla.add(lla);

        const sensorMatches = sensorCountByLla.get(lla) ?? 0;
        if (sensorMatches !== 1) {
          currentRowErrors.push(`Row ${csvRowNumber}: LLA "${lla}" must match exactly one loaded sensor.`);
        }
      }

      if (!location) {
        currentRowErrors.push(`Row ${csvRowNumber}: Location is required.`);
      } else if (seenLocations.has(location)) {
        currentRowErrors.push(`Row ${csvRowNumber}: duplicate non-empty Location "${location}".`);
      }

      if (!expName) {
        currentRowErrors.push(`Row ${csvRowNumber}: Exp_Name is required and cannot be empty.`);
      } else {
        seenExpNames.add(expName);
      }

      const hasAnyCoordinate = rawX !== "" || rawY !== "" || rawZ !== "";
      const hasAllCoordinates = rawX !== "" && rawY !== "" && rawZ !== "";
      if (hasAnyCoordinate && !hasAllCoordinates) {
        currentRowErrors.push(`Row ${csvRowNumber}: Coordinates must be all empty or all numeric values.`);
      }

      let coordX: number | undefined;
      let coordY: number | undefined;
      let coordZ: number | undefined;
      if (hasAllCoordinates) {
        coordX = Number(rawX);
        coordY = Number(rawY);
        coordZ = Number(rawZ);
        if (!Number.isFinite(coordX) || !Number.isFinite(coordY) || !Number.isFinite(coordZ)) {
          currentRowErrors.push(`Row ${csvRowNumber}: Coordinates_X/Y/Z must be valid numbers.`);
        } else {
          const isDefaultCoordinates = coordX === 0 && coordY === 0 && coordZ === 0;
          if (!isDefaultCoordinates) {
            const coordKey = `${coordX}|${coordY}|${coordZ}`;
            if (seenCoordinateTriplets.has(coordKey)) {
              currentRowErrors.push(`Row ${csvRowNumber}: duplicate non-empty coordinate triplet (${coordKey}).`);
            }
            seenCoordinateTriplets.add(coordKey);
          }
        }
      }

      if (currentRowErrors.length > 0) {
        const contextParts = [
          lla ? `LLA: ${lla}` : "",
          location ? `Location: ${location}` : "",
          expName ? `Exp: ${expName}` : "",
        ].filter(Boolean);
        const contextHeader = `Row ${csvRowNumber}${contextParts.length > 0 ? ` (${contextParts.join(", ")})` : ""}`;
        rowErrors.push(
          ...currentRowErrors.map((errorText) => `${contextHeader}\n${errorText.replace(/^Row\s+\d+:\s*/, "")}`)
        );
        continue;
      }

      seenLocations.add(location);
      rowsWithLocations += 1;
      parsedLabels.forEach((labelValue) => globalLabelOptionsSet.add(labelValue));

      const updates: Record<string, unknown> = {
        exp_name: expName,
      };
      if (parsedLabels.length > 0) updates.label = parsedLabels;
      if (parsedLabels.length > 0) rowsWithLabels += 1;
      if (location) updates.location = location;
      const isDefaultCoordinates = coordX === 0 && coordY === 0 && coordZ === 0;
      if (coordX !== undefined && coordY !== undefined && coordZ !== undefined && !isDefaultCoordinates) {
        updates.coordinates = { x: coordX, y: coordY, z: coordZ };
        rowsWithRealCoordinates += 1;
      }

      validPayloadItems.push({
        lla,
        hostname: selectedOwner,
        mac_address: selectedMac,
        updates,
      });
    }

    if (seenExpNames.size !== 1) {
      rowErrors.push("CSV must contain exactly one unique non-empty Exp_Name across all data rows.");
    }

    if (rowErrors.length > 0) {
      console.error("CSV upload validation failed:", rowErrors);
      const previewErrors = rowErrors.slice(0, 3);
      setCsvValidationIssues(previewErrors.map(parseCsvValidationIssue));
      setCsvValidationTotalCount(rowErrors.length);
      resetUploadInput(event.currentTarget);
      return;
    }

    const sharedLabelOptions = Array.from(globalLabelOptionsSet);
    if (sharedLabelOptions.length > 0) {
      validPayloadItems.forEach((sensorItem) => {
        sensorItem.updates.label_options = sharedLabelOptions;
      });
    }

    const preparedPayload: MetadataBatchPayload = { sensors: validPayloadItems };
    setPendingUploadPayload(preparedPayload);
    setPendingUploadSummary({
      expName: Array.from(seenExpNames)[0] ?? "",
      sensorsToUpdate: validPayloadItems.length,
      rowsWithLabels,
      rowsWithRealCoordinates,
      rowsWithLocations,
    });
    console.log("CSV upload payload prepared. Awaiting user confirmation.", {
      fileName: file.name,
      payload: preparedPayload,
    });

    resetUploadInput(event.currentTarget);
  }

  function handleCancelUpload() {
    setPendingUploadPayload(null);
    setPendingUploadSummary(null);
    resetUploadInput();
  }

  async function refreshAfterExperimentMutation(nextExperiment?: string) {
    const refreshed = await refreshDeviceData(selectedOwner, selectedMac);
    if (!refreshed) return;
    if (nextExperiment && nextExperiment.trim()) {
      handleExperimentPillClick(nextExperiment.trim());
    }
  }

  function handlePreferredYes() {
    localStorage.setItem(LS_PREFERRED_OWNER, selectedOwner);
    localStorage.setItem(LS_PREFERRED_MAC, selectedMac);
    setShowPreferredPrompt(false);
  }

  function handlePreferredNotNow() {
    setShowPreferredPrompt(false);
  }

  function handlePreferredDontAskAgain() {
    localStorage.setItem(LS_SKIP_DEVICE_PROMPT, "true");
    setShowPreferredPrompt(false);
  }

  async function handleConfirmUpload() {
    if (!pendingUploadPayload) return;
    const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
    if (!apiBase) {
      console.error("CSV upload aborted: VITE_API_BASE is missing or empty.");
      setUploadToast({ kind: "error", message: "Upload failed: missing API base URL." });
      return;
    }

    try {
      const response = await fetch(`${apiBase}/FS/sensor/update-metadata`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pendingUploadPayload),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        console.error("CSV upload API request failed.", {
          status: response.status,
          statusText: response.statusText,
          response: body,
        });
        setUploadToast({ kind: "error", message: "Metadata upload failed. Check console for details." });
        return;
      }

      console.log("CSV upload API request succeeded.", body);
      await refreshAfterExperimentMutation(pendingUploadSummary?.expName);
      setPendingUploadPayload(null);
      setPendingUploadSummary(null);
      setUploadToast({ kind: "success", message: "Metadata upload completed successfully." });
      resetUploadInput();
    } catch (postError) {
      console.error("CSV upload API request threw an error.", postError);
      setUploadToast({ kind: "error", message: "Metadata upload failed due to a network/runtime error." });
      resetUploadInput();
    }
  }

  async function handleConfirmClearPreparedExperiment() {
    const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
    if (!apiBase) {
      console.error("Clear prepared experiment aborted: VITE_API_BASE is missing or empty.");
      setUploadToast({ kind: "error", message: "Clear failed: missing API base URL." });
      return;
    }

    const batchPayload: MetadataBatchPayload = {
      sensors: selectedExperimentSensors
        .map((sensor) => {
          const lla = (sensor.LLA ?? sensor.lla ?? "").trim();
          if (!lla) return null;
          return {
            lla,
            hostname: selectedOwner,
            mac_address: selectedMac,
            updates: {
              active_exp: false,
              exp_id: "",
              exp_name: "",
              exp_location: "",
              exp_started_at: null,
              exp_ended_at: null,
              label: [],
              label_options: [],
              location: null,
              coordinates: { x: null, y: null, z: null },
            },
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    };

    try {
      const response = await fetch(`${apiBase}/FS/sensor/update-metadata`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batchPayload),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        console.error("Clear prepared experiment request failed.", {
          status: response.status,
          statusText: response.statusText,
          response: body,
        });
        setUploadToast({ kind: "error", message: "Failed to clear prepared experiment." });
        return;
      }

      console.log("Clear prepared experiment request succeeded.", body);
      setShowClearPreparedConfirm(false);
      await refreshAfterExperimentMutation("all");
      setUploadToast({ kind: "success", message: "Prepared experiment was cleared successfully." });
    } catch (error) {
      console.error("Clear prepared experiment request threw an error.", error);
      setUploadToast({ kind: "error", message: "Failed to clear prepared experiment." });
    }
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="p-6 space-y-6">
        {!hasValidContext && (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-2">
            <h2 className="text-base font-semibold text-slate-900">Missing dashboard context</h2>
            <p className="text-sm text-slate-600">
              Owner or MAC is missing. Select a device context on Home to open the dashboard.
            </p>
            <button
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              onClick={handleHomeClick}
            >
              Go to Home
            </button>
          </section>
        )}
        <DashboardTopBar
          selectedMac={selectedMac}
          selectedExperiment={selectedExperiment}
          experimentOptions={experimentOptions}
          sortMode={sortMode}
          activeCount={activeSummary.active}
          totalCount={activeSummary.total}
          onHomeClick={handleHomeClick}
          onExperimentClick={handleExperimentPillClick}
          onSortChange={setSortMode}
          selectedActivities={selectedActivities}
          selectedLabels={selectedLabels}
          labelOptions={labelOptions}
          onToggleActivity={toggleActivityFilter}
          onToggleLabel={toggleLabelFilter}
          onClearFilters={clearFilters}
          onUploadCsvClick={handleUploadCsvClick}
          onDownloadCsvClick={handleDownloadCsvClick}
          canClearPreparedExperiment={canClearPreparedExperiment}
          onClearPreparedExperimentClick={() => setShowClearPreparedConfirm(true)}
          experimentActionMode={experimentActionMode}
          experimentStatus={experimentHeaderStatus}
          onStartExperimentClick={handleStartExperimentClick}
          onEndExperimentClick={handleEndExperimentClick}
          onSettingsClick={() => console.info("Settings placeholder")}
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleUploadFileChange}
        />

        {error && (
          <section className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</section>
        )}

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Sensors</h2>
              <p className="text-xs text-slate-500">
                Auto refresh: every 30s | Last refresh: {lastRefreshAt ? formatIsoToLocal(lastRefreshAt) : "Not yet"}
                {isRefreshing ? " | Refreshing..." : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                className="w-52 rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 md:w-64"
                placeholder="Search sensors..."
                value={sensorSearch}
                onChange={(event) => setSensorSearch(event.target.value)}
              />
              <button
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                onClick={handleManualRefresh}
                disabled={isRefreshing || !selectedOwner || !selectedMac}
              >
                Refresh now
              </button>
              <span className="text-xs text-slate-500">
                {isRefreshing ? "Refreshing..." : `Next auto refresh in ${refreshCountdownSeconds}s`}
              </span>
            </div>
          </div>
          {selectedExperiment === "all" ? (
            groupedSortedSensors.length === 0 ? (
              <p className="text-sm text-slate-500">No sensors found.</p>
            ) : (
              <div className="space-y-5">
                {groupedSortedSensors.map((group) => (
                  <div key={group.expName}>
                    <h3 className="mb-2 text-sm font-semibold text-slate-800">{group.expName.toUpperCase()} EXPERIMENT</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {group.sensors.map((sensor, index) => {
                        const lla = sensor.LLA ?? sensor.lla ?? `sensor-${index + 1}`;
                        const location = sensor.Location ?? sensor.location ?? "Unknown location";
                        const status = String(sensor.Active_Exp ?? sensor.active_exp ?? "unknown");
                        const lastSeen = sensor.Last_Seen ?? sensor.last_seen;
                        const sensorStatus = getSensorStatus(lastSeen);
                        return (
                          <article
                            key={getSensorKey(sensor, index)}
                            ref={setSensorCardRef(lla)}
                            data-sensor-lla={lla}
                            className={`rounded-md border border-slate-200 bg-white p-3 cursor-pointer${pingHighlightLla === lla ? " sensor-card-pinging" : " hover:bg-slate-50"}`}
                            onClick={() => openSensorDetails(lla)}
                          >
                            <p className="font-semibold text-slate-900">{location}</p>
                            <p className="text-xs text-slate-500">LLA: {lla}</p>
                            <p className="text-sm text-slate-600">Active_Exp: {status}</p>
                            <p className="text-sm text-slate-600">
                              Last Seen: {lastSeen ? formatIsoToLocal(lastSeen) : "No last_seen"}
                            </p>
                            <p className="text-sm text-slate-600">
                              Last Ping: {sensor.lastPingAt ? formatIsoToLocal(sensor.lastPingAt) : "No ping yet"}
                            </p>
                            <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-700">
                              <span className={`inline-block h-2.5 w-2.5 rounded-full ${sensorStatus.className}`} />
                              <span>Status: {sensorStatus.label}</span>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : sortedSensors.length === 0 ? (
            <p className="text-sm text-slate-500">No sensors found.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {sortedSensors.map((sensor, index) => {
                const lla = sensor.LLA ?? sensor.lla ?? `sensor-${index + 1}`;
                const location = sensor.Location ?? sensor.location ?? "Unknown location";
                const status = String(sensor.Active_Exp ?? sensor.active_exp ?? "unknown");
                const lastSeen = sensor.Last_Seen ?? sensor.last_seen;
                const sensorStatus = getSensorStatus(lastSeen);
                return (
                  <article
                    key={getSensorKey(sensor, index)}
                    ref={setSensorCardRef(lla)}
                    data-sensor-lla={lla}
                    className={`rounded-md border border-slate-200 bg-white p-3 cursor-pointer${pingHighlightLla === lla ? " sensor-card-pinging" : " hover:bg-slate-50"}`}
                    onClick={() => openSensorDetails(lla)}
                  >
                    <p className="font-semibold text-slate-900">{location}</p>
                    <p className="text-xs text-slate-500">LLA: {lla}</p>
                    <p className="text-sm text-slate-600">Active_Exp: {status}</p>
                    <p className="text-sm text-slate-600">
                      Last Seen: {lastSeen ? formatIsoToLocal(lastSeen) : "No last_seen"}
                    </p>
                    <p className="text-sm text-slate-600">
                      Last Ping: {sensor.lastPingAt ? formatIsoToLocal(sensor.lastPingAt) : "No ping yet"}
                    </p>
                    <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-700">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${sensorStatus.className}`} />
                      <span>Status: {sensorStatus.label}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
      {pingToast ? (
        <div
          className="pointer-events-auto fixed bottom-[30px] left-1/2 z-[2000] flex w-[min(100vw-24px,320px)] -translate-x-1/2 flex-row items-center justify-between gap-3 rounded-[30px] bg-[#333f48] px-5 py-3 text-sm font-bold text-[#82c3ab] shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
          role="status"
          aria-live="polite"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <svg className="h-6 w-6 shrink-0 fill-[#8ec1ae]" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <div className="min-w-0 leading-snug">
              <div className="truncate text-[0.95rem] text-white">{pingToast.title}</div>
              <div className="font-mono text-[0.75rem] text-[#a5b15a]">{pingToast.lla}</div>
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md bg-[#8ec1ae] px-3 py-1.5 text-[0.75rem] font-extrabold text-[#243330] transition hover:opacity-90"
            onClick={scrollPingToastIntoView}
          >
            Find →
          </button>
        </div>
      ) : null}
      <ReplaceSensorModal
        open={Boolean(replaceTarget)}
        onClose={handleCloseReplaceModal}
        oldSensor={replaceTarget}
        allSensors={sensors}
        selectedOwner={selectedOwner}
        selectedMac={selectedMac}
        replacementLla={replaceReplacementLla}
        onReplacementLlaChange={setReplaceReplacementLla}
        pingBridgeRef={replacePingBridgeRef}
        onConfirmSend={handleConfirmReplaceSensor}
        submitting={replaceSubmitting}
      />
      <SensorDetailsModal
        open={detailsOpen}
        onClose={closeSensorDetails}
        loading={detailsLoading}
        error={detailsError}
        details={detailsData}
        lastPingAt={selectedSensor?.lastPingAt}
        showReplaceAction={
          hasValidContext && Boolean(selectedSensor && isSensorActiveInExperiment(selectedSensor))
        }
        onReplaceSensor={() => {
          if (!selectedSensor) return;
          setReplaceTarget(selectedSensor);
          setReplaceReplacementLla("");
          closeSensorDetails();
        }}
      />
      <CenteredDialog
        open={showPreferredPrompt}
        title="Set this as your preferred device?"
        tone="neutral"
        onClose={handlePreferredNotNow}
        actions={
          <>
            <button
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              onClick={handlePreferredYes}
            >
              Yes
            </button>
            <button
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              onClick={handlePreferredNotNow}
            >
              Not now
            </button>
            <button
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              onClick={handlePreferredDontAskAgain}
            >
              Don&apos;t ask me again
            </button>
          </>
        }
      />
      <CenteredDialog
        open={Boolean(pendingUploadPayload && pendingUploadSummary)}
        title="Confirm metadata upload"
        tone="success"
        size="wide"
        onClose={handleCancelUpload}
        actions={
          <>
            <button
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              onClick={handleCancelUpload}
            >
              Cancel
            </button>
            <button
              className="rounded border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs text-white hover:bg-emerald-800"
              onClick={handleConfirmUpload}
            >
              Confirm Upload
            </button>
          </>
        }
      >
        {pendingUploadSummary && (
          <>
            <p>Experiment name: {pendingUploadSummary.expName}</p>
            <p>Number of sensors to update: {pendingUploadSummary.sensorsToUpdate}</p>
            <p>Rows with non-empty labels: {pendingUploadSummary.rowsWithLabels}</p>
            <p>Rows with real coordinates: {pendingUploadSummary.rowsWithRealCoordinates}</p>
            <p>Rows with non-empty locations: {pendingUploadSummary.rowsWithLocations}</p>
            <p className="text-xs text-slate-600">
              This updates metadata only and does not activate the experiment.
            </p>
          </>
        )}
      </CenteredDialog>
      <CenteredDialog
        open={showClearPreparedConfirm}
        title={`Clear prepared experiment "${selectedExperiment}"?`}
        tone="warning"
        onClose={() => setShowClearPreparedConfirm(false)}
        actions={
          <>
            <button
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              onClick={() => setShowClearPreparedConfirm(false)}
            >
              Cancel
            </button>
            <button
              className="rounded border border-red-700 bg-red-700 px-3 py-1.5 text-xs text-white hover:bg-red-800"
              onClick={handleConfirmClearPreparedExperiment}
            >
              Clear Prepared Experiment
            </button>
          </>
        }
      >
        <p>This will remove the uploaded inactive experiment metadata from all sensors in this experiment.</p>
        <p>It will not delete the sensors themselves.</p>
        <p>This action is intended for undoing a CSV preparation before experiment start.</p>
      </CenteredDialog>
      <CenteredDialog
        open={showStartExperimentConfirm}
        title="Start Experiment"
        tone="success"
        onClose={() => setShowStartExperimentConfirm(false)}
        actions={
          <>
            <button
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              onClick={() => setShowStartExperimentConfirm(false)}
            >
              Cancel
            </button>
            <button
              className="rounded border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-xs text-white hover:bg-emerald-800"
              onClick={handleConfirmStartExperiment}
            >
              Start Experiment
            </button>
          </>
        }
      >
        <p>
          Start experiment "{selectedExperiment}" for {selectedExperimentSensors.length} sensors?
        </p>
      </CenteredDialog>
      <CenteredDialog
        open={showEndExperimentConfirm}
        title="End Experiment"
        tone="warning"
        onClose={() => setShowEndExperimentConfirm(false)}
        actions={
          <>
            <button
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              onClick={() => setShowEndExperimentConfirm(false)}
            >
              Cancel
            </button>
            <button
              className="rounded border border-red-700 bg-red-700 px-3 py-1.5 text-xs text-white hover:bg-red-800"
              onClick={handleConfirmEndExperiment}
            >
              End Experiment
            </button>
          </>
        }
      >
        <p>
          End experiment "{selectedExperiment}" for {selectedExperimentSensors.length} sensors?
        </p>
      </CenteredDialog>
      <CenteredDialog
        open={Boolean(experimentActionError)}
        title={experimentActionError?.title ?? "Experiment action error"}
        tone="warning"
        onClose={() => setExperimentActionError(null)}
      >
        <p className="whitespace-pre-line">{experimentActionError?.message}</p>
      </CenteredDialog>
      <CenteredDialog
        open={csvValidationIssues.length > 0}
        title="CSV validation failed"
        tone="warning"
        size="wide"
        onClose={() => {
          setCsvValidationIssues([]);
          setCsvValidationTotalCount(0);
        }}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            {csvValidationTotalCount} issue{csvValidationTotalCount === 1 ? "" : "s"} found.
          </p>
          <div className="space-y-2">
            {csvValidationIssues.map((issue, index) => (
              <div key={`${issue.rowLabel}-${index}`} className="rounded-md border border-amber-300 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">{issue.rowLabel}</p>
                {issue.metaLine ? <p className="text-xs text-amber-800">{issue.metaLine}</p> : null}
                <p className="mt-1 text-sm text-amber-900 whitespace-pre-line">{issue.message}</p>
              </div>
            ))}
          </div>
          {csvValidationTotalCount > csvValidationIssues.length ? (
            <p className="text-xs text-slate-600">
              ...and {csvValidationTotalCount - csvValidationIssues.length} more errors
            </p>
          ) : null}
        </div>
      </CenteredDialog>
      <CenteredDialog
        open={Boolean(uploadToast)}
        title={uploadToast?.kind === "success" ? "Upload status" : "Operation status"}
        tone={uploadToast?.kind === "success" ? "success" : "warning"}
        onClose={() => setUploadToast(null)}
      >
        <p>{uploadToast?.message}</p>
      </CenteredDialog>
    </div>
  );
}

export default DashboardPage;

