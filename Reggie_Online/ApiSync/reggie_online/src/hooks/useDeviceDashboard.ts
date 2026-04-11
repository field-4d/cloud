import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getActiveMetadata,
  getExperiments,
  getSensorsMetadata,
  type ActiveMetadataItem,
  type ActiveMetadataResponse,
  type ExperimentItem,
  type SensorMetadata,
  type SensorsMetadataResponse,
} from "../api/metadata";
import { createReconnectingPingSocket } from "../websocket/pingSocket";

export type DashboardSensor = SensorMetadata & {
  lastPingAt?: string;
  Location?: string;
  location?: string;
  Label?: string | string[];
  label?: string | string[];
  Exp_ID?: number | string;
  exp_id?: number | string;
  Mac_Address?: string;
};

type PingMessage = {
  payload?: {
    LLA?: string;
    lla?: string;
  };
};

type SortMode = "location_asc" | "location_desc" | "last_seen_desc" | "last_seen_asc" | "status";
type ActivityFilter = "Active" | "Inactive" | "Indefinite" | "Replaced";

type UseDeviceDashboardArgs = {
  owner: string;
  mac: string;
  nowTs: number;
  /** Called when a WebSocket ping matches a known sensor LLA (after lastPingAt is updated). */
  onSensorPing?: (lla: string) => void;
};

const ONLINE_SECONDS = 180;
const DELAYED_SECONDS = 540;
export const UNASSIGNED_EXPERIMENT = "UNASSIGNED";

function normalizeExperimentName(value: unknown): string {
  return String(value ?? "").trim();
}

export function useDeviceDashboard({ owner, mac, nowTs, onSensorPing }: UseDeviceDashboardArgs) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [experiments, setExperiments] = useState<ExperimentItem[]>([]);
  const [sensors, setSensors] = useState<DashboardSensor[]>([]);
  const [error, setError] = useState("");
  const [lastRefreshAt, setLastRefreshAt] = useState<string>();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [detailsData, setDetailsData] = useState<ActiveMetadataItem | null>(null);
  const [detailsLla, setDetailsLla] = useState("");
  const [selectedExperiment, setSelectedExperiment] = useState("all");
  const [sensorSearch, setSensorSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("status");
  const [selectedActivities, setSelectedActivities] = useState<ActivityFilter[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);

  const unmatchedLoggedRef = useRef<Set<string>>(new Set());
  const sensorIndexByLlaRef = useRef<Map<string, number>>(new Map());
  const refreshTimerRef = useRef<number | null>(null);
  const onSensorPingRef = useRef(onSensorPing);
  onSensorPingRef.current = onSensorPing;

  const experimentOptions = useMemo(() => {
    const set = new Set<string>();
    experiments.forEach((exp) => {
      const name = normalizeExperimentName(exp.exp_name);
      if (name) set.add(name);
    });
    sensors.forEach((sensor) => {
      const name = normalizeExperimentName(sensor.Exp_Name ?? sensor.exp_name);
      if (name) set.add(name);
    });
    const options = Array.from(set).sort((a, b) => a.localeCompare(b));
    const hasUnassigned = sensors.some((sensor) => !normalizeExperimentName(sensor.Exp_Name ?? sensor.exp_name));
    if (hasUnassigned) options.unshift(UNASSIGNED_EXPERIMENT);
    return options;
  }, [experiments, sensors]);

  const updateExpParam = useCallback(
    (exp: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("exp", exp === "all" ? "all" : exp);
        return next;
      });
    },
    [setSearchParams]
  );

  useEffect(() => {
    const expParam = (searchParams.get("exp") ?? "all").trim();
    if (!expParam || expParam.toLowerCase() === "all") {
      if (selectedExperiment !== "all") setSelectedExperiment("all");
      return;
    }

    const match = experimentOptions.find((name) => name.toLowerCase() === expParam.toLowerCase());
    if (!match) {
      if (selectedExperiment !== "all") setSelectedExperiment("all");
      updateExpParam("all");
      return;
    }

    if (selectedExperiment !== match) setSelectedExperiment(match);
  }, [searchParams, experimentOptions, selectedExperiment, updateExpParam]);

  const mergeSensorsWithRealtime = useCallback((incoming: SensorMetadata[]) => {
    setSensors((prev) => {
      const prevByLla = new Map<string, DashboardSensor>();
      prev.forEach((item) => {
        const lla = item.LLA ?? item.lla;
        if (lla) prevByLla.set(lla, item);
      });
      return (incoming ?? []).map((sensor) => {
        const lla = sensor.LLA ?? sensor.lla;
        const existing = lla ? prevByLla.get(lla) : undefined;
        return {
          ...sensor,
          lastPingAt: existing?.lastPingAt,
        };
      });
    });
  }, []);

  const refreshSensorsMetadata = useCallback(
    async (ownerArg: string, macArg: string): Promise<boolean> => {
      setIsRefreshing(true);
      try {
        const sensorResponse = await getSensorsMetadata(ownerArg, macArg);
        mergeSensorsWithRealtime(sensorResponse.data ?? []);
        setLastRefreshAt(new Date().toISOString());
        setError("");
        return true;
      } catch (fetchError) {
        setError(`Failed to refresh sensors: ${String((fetchError as { message?: string })?.message ?? fetchError)}`);
        return false;
      } finally {
        setIsRefreshing(false);
      }
    },
    [mergeSensorsWithRealtime]
  );

  const refreshDeviceData = useCallback(
    async (ownerArg: string, macArg: string): Promise<boolean> => {
      setIsRefreshing(true);
      try {
        const [expResponse, sensorResponse] = await Promise.all([
          getExperiments(ownerArg, macArg),
          getSensorsMetadata(ownerArg, macArg),
        ]);
        setExperiments(expResponse.experiments ?? []);
        mergeSensorsWithRealtime(sensorResponse.data ?? []);
        setLastRefreshAt(new Date().toISOString());
        setError("");
        return true;
      } catch (fetchError) {
        setError(`Failed to refresh metadata: ${String((fetchError as { message?: string })?.message ?? fetchError)}`);
        return false;
      } finally {
        setIsRefreshing(false);
      }
    },
    [mergeSensorsWithRealtime]
  );

  useEffect(() => {
    if (!owner || !mac) return;
    let cancelled = false;

    Promise.all([getExperiments(owner, mac), getSensorsMetadata(owner, mac)])
      .then(([expResponse, sensorResponse]: [Awaited<ReturnType<typeof getExperiments>>, SensorsMetadataResponse]) => {
        if (cancelled) return;
        setExperiments(expResponse.experiments ?? []);
        mergeSensorsWithRealtime(sensorResponse.data ?? []);
        setLastRefreshAt(new Date().toISOString());
        setError("");
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setExperiments([]);
        setSensors([]);
        setError(`Failed to load metadata: ${String((fetchError as { message?: string })?.message ?? fetchError)}`);
      });

    return () => {
      cancelled = true;
    };
  }, [owner, mac, mergeSensorsWithRealtime]);

  useEffect(() => {
    if (!owner || !mac) return;
    if (refreshTimerRef.current !== null) {
      window.clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    const refreshSensors = () => {
      void refreshSensorsMetadata(owner, mac);
    };

    refreshTimerRef.current = window.setInterval(refreshSensors, 30000);
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [owner, mac, refreshSensorsMetadata]);

  useEffect(() => {
    const map = new Map<string, number>();
    sensors.forEach((sensor, index) => {
      const lla = sensor.LLA ?? sensor.lla;
      if (lla) map.set(lla, index);
    });
    sensorIndexByLlaRef.current = map;
  }, [sensors]);

  useEffect(() => {
    const disconnect = createReconnectingPingSocket({
      onMessage: (raw) => {
        const msg = raw as PingMessage;
        const lla = msg?.payload?.LLA ?? msg?.payload?.lla;
        if (!lla) return;

        const pingAt = new Date().toISOString();
        const sensorIndex = sensorIndexByLlaRef.current.get(lla);
        if (sensorIndex === undefined) {
          if (import.meta.env.DEV && !unmatchedLoggedRef.current.has(lla)) {
            unmatchedLoggedRef.current.add(lla);
            console.debug("Unmatched Ping LLA ignored:", lla);
          }
          return;
        }

        setSensors((prev) => {
          if (sensorIndex < 0 || sensorIndex >= prev.length) return prev;
          const current = prev[sensorIndex];
          const currentLla = current?.LLA ?? current?.lla;
          if (currentLla !== lla) return prev;
          const next = [...prev];
          next[sensorIndex] = { ...current, lastPingAt: pingAt };
          return next;
        });

        onSensorPingRef.current?.(lla);
      },
    });

    return disconnect;
  }, []);

  useEffect(() => {
    if (!detailsOpen || !detailsLla || !owner || !mac) return;
    let cancelled = false;
    setDetailsLoading(true);
    setDetailsError("");

    getActiveMetadata(owner, mac, detailsLla)
      .then((response: ActiveMetadataResponse) => {
        if (cancelled) return;
        setDetailsData((response.data && response.data.length > 0 ? response.data[0] : null) as ActiveMetadataItem | null);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setDetailsData(null);
        setDetailsError(
          `Failed to load sensor details: ${String((fetchError as { message?: string })?.message ?? fetchError)}`
        );
      })
      .finally(() => {
        if (cancelled) return;
        setDetailsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailsOpen, detailsLla, owner, mac]);

  const selectedSensor = detailsLla ? sensors.find((sensor) => (sensor.LLA ?? sensor.lla) === detailsLla) : undefined;

  const experimentScopedSensors = useMemo(() => {
    if (selectedExperiment === "all") return sensors;
    if (selectedExperiment === UNASSIGNED_EXPERIMENT) {
      return sensors.filter((sensor) => !normalizeExperimentName(sensor.Exp_Name ?? sensor.exp_name));
    }
    return sensors.filter(
      (sensor) => normalizeExperimentName(sensor.Exp_Name ?? sensor.exp_name) === selectedExperiment
    );
  }, [sensors, selectedExperiment]);

  const searchedSensors = useMemo(() => {
    const query = sensorSearch.trim().toLowerCase();
    if (!query) return experimentScopedSensors;

    return experimentScopedSensors.filter((sensor) => {
      const location = (sensor.Location ?? sensor.location ?? "").toLowerCase();
      const lla = (sensor.LLA ?? sensor.lla ?? "").toLowerCase();
      const expName =
        normalizeExperimentName(sensor.Exp_Name ?? sensor.exp_name) || UNASSIGNED_EXPERIMENT;
      const expNameLower = expName.toLowerCase();
      const rawLabel = sensor.Label ?? sensor.label;
      const labelText = Array.isArray(rawLabel)
        ? rawLabel.map((value) => String(value)).join(" ").toLowerCase()
        : String(rawLabel ?? "").toLowerCase();

      return (
        location.includes(query) || lla.includes(query) || labelText.includes(query) || expNameLower.includes(query)
      );
    });
  }, [experimentScopedSensors, sensorSearch]);

  const labelOptions = useMemo(() => {
    const set = new Set<string>();
    experimentScopedSensors.forEach((sensor) => {
      const raw = sensor.Label ?? sensor.label;
      if (Array.isArray(raw)) {
        raw.forEach((value) => {
          const normalized = String(value).trim();
          if (normalized) set.add(normalized);
        });
        return;
      }
      if (raw !== undefined && raw !== null) {
        const normalized = String(raw).trim();
        if (normalized) set.add(normalized);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [experimentScopedSensors]);

  useEffect(() => {
    if (selectedLabels.length === 0) return;
    const allowed = new Set(labelOptions);
    setSelectedLabels((prev) => prev.filter((label) => allowed.has(label)));
  }, [labelOptions, selectedLabels.length]);

  const getActivityCategory = useCallback((sensor: DashboardSensor): ActivityFilter => {
    const rawActivity =
      (sensor as Record<string, unknown>).Activity ??
      (sensor as Record<string, unknown>).activity ??
      (sensor as Record<string, unknown>).Status ??
      (sensor as Record<string, unknown>).status;

    if (typeof rawActivity === "string") {
      const normalized = rawActivity.trim().toLowerCase();
      if (normalized.includes("replaced")) return "Replaced";
      if (normalized.includes("inactive")) return "Inactive";
      if (normalized.includes("active")) return "Active";
      if (normalized.includes("indefinite")) return "Indefinite";
    }

    const activeExp = sensor.Active_Exp ?? sensor.active_exp;
    if (activeExp === true) return "Active";
    if (activeExp === false) return "Inactive";
    return "Indefinite";
  }, []);

  const activityAndLabelFilteredSensors = useMemo(() => {
    if (selectedActivities.length === 0 && selectedLabels.length === 0) return searchedSensors;

    const selectedActivitySet = new Set(selectedActivities);
    const selectedLabelSet = new Set(selectedLabels);

    return searchedSensors.filter((sensor) => {
      const activityOk =
        selectedActivitySet.size === 0 ? true : selectedActivitySet.has(getActivityCategory(sensor));

      const raw = sensor.Label ?? sensor.label;
      const sensorLabels = Array.isArray(raw)
        ? raw.map((value) => String(value).trim()).filter(Boolean)
        : raw !== undefined && raw !== null
          ? [String(raw).trim()].filter(Boolean)
          : [];

      const labelOk =
        selectedLabelSet.size === 0 ? true : sensorLabels.some((label) => selectedLabelSet.has(label));

      return activityOk && labelOk;
    });
  }, [searchedSensors, selectedActivities, selectedLabels, getActivityCategory]);

  const getSensorStatus = useCallback(
    (lastSeen?: string): { label: string; className: string } => {
      if (!lastSeen) return { label: "unknown", className: "bg-slate-500" };
      const ageSeconds = Math.floor((nowTs - new Date(lastSeen).getTime()) / 1000);
      if (ageSeconds <= ONLINE_SECONDS) return { label: "online", className: "bg-green-500" };
      if (ageSeconds <= DELAYED_SECONDS) return { label: "delayed", className: "bg-yellow-500" };
      return { label: "offline", className: "bg-red-500" };
    },
    [nowTs]
  );

  const sortSensorsList = useCallback(
    (source: DashboardSensor[]) => {
      const list = [...source];
      const getLla = (sensor: DashboardSensor) => sensor.LLA ?? sensor.lla ?? "";
      const compareLla = (a: DashboardSensor, b: DashboardSensor) => getLla(a).localeCompare(getLla(b));
      const parseLastSeen = (sensor: DashboardSensor) => {
        const raw = sensor.Last_Seen ?? sensor.last_seen;
        if (!raw) return null;
        const ms = new Date(raw).getTime();
        return Number.isNaN(ms) ? null : ms;
      };
      const getLocation = (sensor: DashboardSensor) => sensor.Location ?? sensor.location ?? "Unknown location";
      const getStatusRank = (sensor: DashboardSensor) => {
        const status = getSensorStatus(sensor.Last_Seen ?? sensor.last_seen).label;
        if (status === "online") return 0;
        if (status === "delayed") return 1;
        if (status === "offline") return 2;
        return 3;
      };

      list.sort((a, b) => {
        if (sortMode === "location_asc") {
          const cmp = getLocation(a).localeCompare(getLocation(b));
          return cmp !== 0 ? cmp : compareLla(a, b);
        }
        if (sortMode === "location_desc") {
          const cmp = getLocation(b).localeCompare(getLocation(a));
          return cmp !== 0 ? cmp : compareLla(a, b);
        }
        if (sortMode === "last_seen_desc") {
          const aMs = parseLastSeen(a);
          const bMs = parseLastSeen(b);
          if (aMs === null && bMs === null) return compareLla(a, b);
          if (aMs === null) return 1;
          if (bMs === null) return -1;
          const cmp = bMs - aMs;
          return cmp !== 0 ? cmp : compareLla(a, b);
        }
        if (sortMode === "last_seen_asc") {
          const aMs = parseLastSeen(a);
          const bMs = parseLastSeen(b);
          if (aMs === null && bMs === null) return compareLla(a, b);
          if (aMs === null) return 1;
          if (bMs === null) return -1;
          const cmp = aMs - bMs;
          return cmp !== 0 ? cmp : compareLla(a, b);
        }
        const rankCmp = getStatusRank(a) - getStatusRank(b);
        return rankCmp !== 0 ? rankCmp : compareLla(a, b);
      });

      return list;
    },
    [sortMode, getSensorStatus]
  );

  const sortedSensors = useMemo(
    () => sortSensorsList(activityAndLabelFilteredSensors),
    [activityAndLabelFilteredSensors, sortSensorsList]
  );

  const groupedSortedSensors = useMemo(() => {
    if (selectedExperiment !== "all") return [];
    const groups = new Map<string, DashboardSensor[]>();
    activityAndLabelFilteredSensors.forEach((sensor) => {
      const expName = normalizeExperimentName(sensor.Exp_Name ?? sensor.exp_name) || UNASSIGNED_EXPERIMENT;
      if (!groups.has(expName)) groups.set(expName, []);
      groups.get(expName)!.push(sensor);
    });
    return Array.from(groups.entries())
      .map(([expName, items]) => ({
        expName,
        sensors: sortSensorsList(items),
      }))
      .sort((a, b) => a.expName.localeCompare(b.expName));
  }, [activityAndLabelFilteredSensors, selectedExperiment, sortSensorsList]);

  const getSensorKey = useCallback((sensor: DashboardSensor, _index: number) => {
    return sensor.LLA ?? sensor.lla;
  }, []);

  const handleManualRefresh = useCallback(() => {
    if (!owner || !mac || isRefreshing) return;
    void refreshDeviceData(owner, mac);
  }, [owner, mac, isRefreshing, refreshDeviceData]);

  const handleExperimentPillClick = useCallback(
    (exp: string) => {
      setSelectedExperiment(exp);
      updateExpParam(exp);
    },
    [updateExpParam]
  );

  const openSensorDetails = useCallback((lla?: string) => {
    if (!lla) return;
    setDetailsLla(lla);
    setDetailsData(null);
    setDetailsError("");
    setDetailsOpen(true);
  }, []);

  const closeSensorDetails = useCallback(() => {
    setDetailsOpen(false);
  }, []);

  const toggleActivityFilter = useCallback((activity: ActivityFilter) => {
    setSelectedActivities((prev) =>
      prev.includes(activity) ? prev.filter((item) => item !== activity) : [...prev, activity]
    );
  }, []);

  const toggleLabelFilter = useCallback((label: string) => {
    setSelectedLabels((prev) => (prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]));
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedActivities([]);
    setSelectedLabels([]);
  }, []);

  return {
    experiments,
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
  };
}
