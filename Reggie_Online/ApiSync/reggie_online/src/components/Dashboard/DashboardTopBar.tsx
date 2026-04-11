import { useState } from "react";
import { Circle, Clock, Download, Funnel, Home, PlayCircle, Upload } from "lucide-react";
import { UNASSIGNED_EXPERIMENT } from "../../hooks/useDeviceDashboard";

type SortMode = "location_asc" | "location_desc" | "last_seen_desc" | "last_seen_asc" | "status";
type ActivityFilter = "Active" | "Inactive" | "Indefinite" | "Replaced";
type ExperimentActionMode = "hidden" | "start" | "end";
type ExperimentHeaderStatus = "running" | "prepared" | "idle";

type DashboardTopBarProps = {
  selectedMac: string;
  selectedExperiment: string;
  experimentOptions: string[];
  sortMode: SortMode;
  activeCount: number;
  totalCount: number;
  onHomeClick: () => void;
  onExperimentClick: (exp: string) => void;
  onSortChange: (mode: SortMode) => void;
  selectedActivities: ActivityFilter[];
  selectedLabels: string[];
  labelOptions: string[];
  onToggleActivity: (activity: ActivityFilter) => void;
  onToggleLabel: (label: string) => void;
  onClearFilters: () => void;
  onUploadCsvClick: () => void;
  onDownloadCsvClick: () => void;
  canClearPreparedExperiment: boolean;
  onClearPreparedExperimentClick: () => void;
  experimentActionMode: ExperimentActionMode;
  experimentStatus: ExperimentHeaderStatus;
  onStartExperimentClick: () => void;
  onEndExperimentClick: () => void;
  onSettingsClick: () => void;
};

function DashboardTopBar({
  selectedMac,
  selectedExperiment,
  experimentOptions,
  sortMode,
  activeCount,
  totalCount,
  onHomeClick,
  onExperimentClick,
  onSortChange,
  selectedActivities,
  selectedLabels,
  labelOptions,
  onToggleActivity,
  onToggleLabel,
  onClearFilters,
  onUploadCsvClick,
  onDownloadCsvClick,
  canClearPreparedExperiment,
  onClearPreparedExperimentClick,
  experimentActionMode,
  experimentStatus,
  onStartExperimentClick,
  onEndExperimentClick,
  onSettingsClick,
}: DashboardTopBarProps) {
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilterTab, setActiveFilterTab] = useState<"activity" | "label">("activity");
  const [expOverflowOpen, setExpOverflowOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const visibleExperiments = experimentOptions.slice(0, 5);
  const overflowExperiments = experimentOptions.slice(5);
  const statusUi = (() => {
    if (experimentStatus === "running") {
      return {
        icon: <PlayCircle className="h-3.5 w-3.5" />,
        label: "RUNNING",
        className: "border-emerald-300 bg-emerald-50 text-emerald-700",
      };
    }
    if (experimentStatus === "prepared") {
      return {
        icon: <Clock className="h-3.5 w-3.5" />,
        label: "PREPARED",
        className: "border-amber-300 bg-amber-50 text-amber-700",
      };
    }
    return {
      icon: <Circle className="h-3.5 w-3.5" />,
      label: "IDLE",
      className: "border-slate-300 bg-slate-50 text-slate-700",
    };
  })();

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onHomeClick}
            title="Home"
            aria-label="Home"
          >
            <Home className="mr-1 inline-block h-4 w-4" />
            Home
          </button>
          <div className="relative">
            <button
              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => setSortOpen((prev) => !prev)}
            >
              Sort By ▼
            </button>
            {sortOpen && (
              <div className="absolute left-0 z-10 mt-1 w-56 rounded-md border border-slate-200 bg-white p-1 shadow-md">
                <button
                  className={`block w-full rounded px-2 py-1 text-left text-sm ${
                    sortMode === "location_asc" ? "bg-slate-100" : "hover:bg-slate-50"
                  }`}
                  onClick={() => {
                    onSortChange("location_asc");
                    setSortOpen(false);
                  }}
                >
                  Location A → Z
                </button>
                <button
                  className={`block w-full rounded px-2 py-1 text-left text-sm ${
                    sortMode === "location_desc" ? "bg-slate-100" : "hover:bg-slate-50"
                  }`}
                  onClick={() => {
                    onSortChange("location_desc");
                    setSortOpen(false);
                  }}
                >
                  Location Z → A
                </button>
                <button
                  className={`block w-full rounded px-2 py-1 text-left text-sm ${
                    sortMode === "last_seen_desc" ? "bg-slate-100" : "hover:bg-slate-50"
                  }`}
                  onClick={() => {
                    onSortChange("last_seen_desc");
                    setSortOpen(false);
                  }}
                >
                  Last Package newest first
                </button>
                <button
                  className={`block w-full rounded px-2 py-1 text-left text-sm ${
                    sortMode === "last_seen_asc" ? "bg-slate-100" : "hover:bg-slate-50"
                  }`}
                  onClick={() => {
                    onSortChange("last_seen_asc");
                    setSortOpen(false);
                  }}
                >
                  Last Package newest last
                </button>
                <button
                  className={`block w-full rounded px-2 py-1 text-left text-sm ${
                    sortMode === "status" ? "bg-slate-100" : "hover:bg-slate-50"
                  }`}
                  onClick={() => {
                    onSortChange("status");
                    setSortOpen(false);
                  }}
                >
                  Status
                </button>
              </div>
            )}
          </div>
          <div className="relative">
            <button
              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => setFilterOpen((prev) => !prev)}
              title="Toggle filters dropdown"
              aria-label="Filters"
            >
              <Funnel className="mr-1 inline-block h-4 w-4" />
              Filter
            </button>
            {filterOpen && (
              <div className="absolute left-0 top-full z-10 mt-1 w-80 rounded-md border border-slate-200 bg-white p-3 shadow-md">
                <div className="mb-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filters</p>
                    <button
                      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      onClick={onClearFilters}
                    >
                      Clear
                    </button>
                  </div>
                  <div className="inline-flex rounded border border-slate-300 bg-slate-50 p-0.5">
                    <button
                      className={`rounded px-2 py-1 text-[11px] font-semibold tracking-wide ${
                        activeFilterTab === "activity"
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-600 hover:text-slate-800"
                      }`}
                      onClick={() => setActiveFilterTab("activity")}
                    >
                      ACTIVITY
                    </button>
                    <button
                      className={`rounded px-2 py-1 text-[11px] font-semibold tracking-wide ${
                        activeFilterTab === "label"
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-600 hover:text-slate-800"
                      }`}
                      onClick={() => setActiveFilterTab("label")}
                    >
                      LABEL
                    </button>
                  </div>
                </div>

                {activeFilterTab === "activity" ? (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Activity</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(["Active", "Inactive", "Indefinite", "Replaced"] as const).map((activity) => (
                        <label key={activity} className="inline-flex items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={selectedActivities.includes(activity)}
                            onChange={() => onToggleActivity(activity)}
                          />
                          <span>{activity}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Label</p>
                    {labelOptions.length === 0 ? (
                      <p className="text-xs text-slate-500">No labels available.</p>
                    ) : (
                      <div className="max-h-32 space-y-1 overflow-auto pr-1">
                        {labelOptions.map((label) => (
                          <label key={label} className="flex items-center gap-2 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={selectedLabels.includes(label)}
                              onChange={() => onToggleLabel(label)}
                            />
                            <span className="truncate">{label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onUploadCsvClick}
            title="Upload CSV metadata file"
            aria-label="Upload CSV metadata file"
          >
            <Upload className="mr-1 inline-block h-4 w-4" />
            Upload
          </button>
          <button
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onDownloadCsvClick}
            title="Download CSV"
            aria-label="Download CSV"
          >
            <Download className="mr-1 inline-block h-4 w-4" />
            Download
          </button>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs xl:justify-center">
          <span className="text-slate-600">Device: {selectedMac || "-"}</span>
          {selectedExperiment === UNASSIGNED_EXPERIMENT ? (
            <>
              <span className="text-slate-400">|</span>
              <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                UNASSIGNED
              </span>
            </>
          ) : null}
          <span className="text-slate-400">|</span>
          <span className="text-slate-700">
            Experiment: <span className="font-medium">{selectedExperiment === "all" ? "ALL" : selectedExperiment}</span>
          </span>
          <span className="text-slate-400">|</span>
          <div className="flex flex-wrap items-center gap-1">
            <button
              className={`rounded px-2 py-1 text-xs ${
                selectedExperiment === "all" ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700"
              }`}
              onClick={() => onExperimentClick("all")}
            >
              ALL
            </button>
            {visibleExperiments.map((name) => (
              <button
                key={name}
                className={`rounded px-2 py-1 text-xs ${
                  selectedExperiment === name ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700"
                }`}
                onClick={() => onExperimentClick(name)}
              >
                {name.toUpperCase()}
              </button>
            ))}
            {overflowExperiments.length > 0 && (
              <div className="relative">
                <button
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  onClick={() => setExpOverflowOpen((prev) => !prev)}
                >
                  More ▼
                </button>
                {expOverflowOpen && (
                  <div className="absolute left-0 top-full z-10 mt-1 min-w-40 rounded-md border border-slate-200 bg-white p-1 shadow-md">
                    {overflowExperiments.map((name) => (
                      <button
                        key={name}
                        className={`block w-full rounded px-2 py-1 text-left text-xs ${
                          selectedExperiment === name ? "bg-slate-100" : "hover:bg-slate-50"
                        }`}
                        onClick={() => {
                          onExperimentClick(name);
                          setExpOverflowOpen(false);
                        }}
                      >
                        {name.toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <span className="text-slate-400">|</span>
          <span className="font-medium text-slate-700">
            Active: {activeCount} / {totalCount}
          </span>
          <span className="text-slate-400">|</span>
          <span
            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${statusUi.className}`}
            title="Experiment status"
          >
            {statusUi.icon}
            {statusUi.label}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={onClearPreparedExperimentClick}
            disabled={!canClearPreparedExperiment}
            title={!canClearPreparedExperiment ? "Available only for inactive selected experiments" : undefined}
          >
            Clear Prepared Experiment
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {experimentActionMode === "start" ? (
              <button
                className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-100"
                onClick={onStartExperimentClick}
              >
                Start Experiment
              </button>
            ) : null}
            {experimentActionMode === "end" ? (
              <button
                className="rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-100"
                onClick={onEndExperimentClick}
              >
                End Experiment
              </button>
            ) : null}
          </div>
          <div className="relative">
            <button
              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => setSettingsOpen((prev) => !prev)}
            >
              Settings ▼
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border border-slate-200 bg-white p-1 shadow-md">
                <button
                  className="block w-full rounded px-2 py-1 text-left text-sm text-slate-700 hover:bg-slate-50"
                  onClick={onSettingsClick}
                >
                  Alerts
                </button>
                <button
                  className="block w-full rounded px-2 py-1 text-left text-sm text-slate-700 hover:bg-slate-50"
                  onClick={onSettingsClick}
                >
                  3D View
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default DashboardTopBar;
