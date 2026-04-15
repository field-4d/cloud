import type { ActiveMetadataItem } from "../../api/metadata";
import { formatIsoToLocal } from "../../utils/date";

type SensorDetailsModalProps = {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  error: string;
  details: ActiveMetadataItem | null;
  lastPingAt?: string;
  /** When true, show Replace Sensor after details load (active experiment sensor). */
  showReplaceAction?: boolean;
  onReplaceSensor?: () => void;
  showDeleteAction?: boolean;
  onDeleteSensor?: () => void;
  deleteSubmitting?: boolean;
};

function SensorDetailsModal({
  open,
  onClose,
  loading,
  error,
  details,
  lastPingAt,
  showReplaceAction = false,
  onReplaceSensor,
  showDeleteAction = false,
  onDeleteSensor,
  deleteSubmitting = false,
}: SensorDetailsModalProps) {
  if (!open) return null;

  const lla = details?.LLA ?? details?.lla ?? "-";
  const owner = details?.Owner ?? details?.owner ?? "-";
  const expName = details?.Exp_Name ?? details?.exp_name ?? "-";
  const expId = details?.Exp_ID ?? details?.exp_id ?? "-";
  const location = details?.Location ?? details?.location ?? "-";
  const activeExp = String(details?.Active_Exp ?? details?.active_exp ?? "-");
  const lastSeen = details?.Last_Seen ?? details?.last_seen;
  const coords = details?.Coordinates ?? details?.coordinates;
  const label = details?.Label ?? details?.label;
  const labelOptions = details?.Label_Options ?? details?.label_options;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Sensor Details</h2>
        {loading ? (
          <>
            <p className="mt-3 text-sm text-slate-600">Loading sensor details...</p>
            <div className="mt-4">
              <button className="rounded-md bg-slate-800 px-3 py-2 text-sm text-white" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : error ? (
          <>
            <p className="mt-3 text-sm text-red-700">{error}</p>
            <div className="mt-4">
              <button className="rounded-md bg-slate-800 px-3 py-2 text-sm text-white" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-3 space-y-1 text-sm text-slate-700">
              <p>
                <strong>LLA:</strong> {lla}
              </p>
              <p>
                <strong>Owner:</strong> {owner}
              </p>
              <p>
                <strong>Experiment name:</strong> {expName}
              </p>
              <p>
                <strong>Experiment ID:</strong> {String(expId)}
              </p>
              <p>
                <strong>Location:</strong> {location}
              </p>
              <p>
                <strong>Coordinates:</strong>{" "}
                {coords ? `x=${coords.x ?? "-"}, y=${coords.y ?? "-"}, z=${coords.z ?? "-"}` : "-"}
              </p>
              <p>
                <strong>Label:</strong> {Array.isArray(label) ? label.join(", ") : (label ?? "-")}
              </p>
              <p>
                <strong>Label options:</strong>{" "}
                {Array.isArray(labelOptions) && labelOptions.length > 0 ? labelOptions.join(", ") : "-"}
              </p>
              <p>
                <strong>Active_Exp:</strong> {activeExp}
              </p>
              <p>
                <strong>Last Seen:</strong> {lastSeen ? formatIsoToLocal(lastSeen) : "-"}
              </p>
              <p>
                <strong>Last Ping:</strong> {lastPingAt ? formatIsoToLocal(lastPingAt) : "No ping yet"}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {showReplaceAction && onReplaceSensor ? (
                <button
                  type="button"
                  className="rounded-md border border-emerald-700 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReplaceSensor();
                  }}
                >
                  Replace Sensor
                </button>
              ) : null}
              {showDeleteAction && onDeleteSensor ? (
                <button
                  type="button"
                  className="rounded-md border border-red-700 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSensor();
                  }}
                  disabled={deleteSubmitting}
                >
                  {deleteSubmitting ? "Deleting..." : "Delete Sensor"}
                </button>
              ) : null}
              <button className="rounded-md bg-slate-800 px-3 py-2 text-sm text-white" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SensorDetailsModal;
