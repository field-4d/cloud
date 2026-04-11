import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { DashboardSensor } from "../../hooks/useDeviceDashboard";
import {
  getEligibleReplacementSensors,
  getExpNameForReplace,
  getReplacementPingRejectionReason,
  getTrimmedLocation,
  validateReplacePreconditions,
} from "../../utils/replaceSensor";

const SYNC_NOTICE =
  "The replacement will appear after the next metadata sync, up to 10 minutes.";

export type ReplaceSensorModalProps = {
  open: boolean;
  onClose: () => void;
  oldSensor: DashboardSensor | null;
  allSensors: DashboardSensor[];
  selectedOwner: string;
  selectedMac: string;
  replacementLla: string;
  onReplacementLlaChange: (lla: string) => void;
  pingBridgeRef: MutableRefObject<(lla: string) => void>;
  onConfirmSend: () => void;
  submitting: boolean;
};

function FieldReadonly({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-xs leading-snug">
      <span className="text-slate-500">{label}</span>{" "}
      <span className="font-medium text-slate-900">{value}</span>
    </p>
  );
}

function ReplaceSensorModal({
  open,
  onClose,
  oldSensor,
  allSensors,
  selectedOwner,
  selectedMac,
  replacementLla,
  onReplacementLlaChange,
  pingBridgeRef,
  onConfirmSend,
  submitting,
}: ReplaceSensorModalProps) {
  const [approvalStep, setApprovalStep] = useState<1 | 2>(1);
  const [pingSelectionWarning, setPingSelectionWarning] = useState<string | null>(null);

  const eligible = useMemo(
    () => (oldSensor ? getEligibleReplacementSensors(allSensors, oldSensor) : []),
    [allSensors, oldSensor]
  );

  const validation = useMemo(
    () =>
      validateReplacePreconditions(oldSensor ?? undefined, replacementLla, selectedOwner, selectedMac, allSensors),
    [oldSensor, replacementLla, selectedOwner, selectedMac, allSensors]
  );

  useEffect(() => {
    if (open && oldSensor) {
      setApprovalStep(1);
      setPingSelectionWarning(null);
    }
  }, [open, oldSensor]);

  useEffect(() => {
    if (!open) setPingSelectionWarning(null);
  }, [open]);

  const handleReplacementLlaChange = useCallback(
    (value: string) => {
      setPingSelectionWarning(null);
      onReplacementLlaChange(value);
    },
    [onReplacementLlaChange]
  );

  useEffect(() => {
    if (!open || !oldSensor) {
      pingBridgeRef.current = () => {};
      return;
    }

    pingBridgeRef.current = (lla: string) => {
      const trimmed = lla.trim();
      if (!trimmed) return;
      const reason = getReplacementPingRejectionReason(oldSensor, trimmed, allSensors);
      if (reason) {
        setPingSelectionWarning(reason);
        return;
      }
      handleReplacementLlaChange(trimmed);
    };

    return () => {
      pingBridgeRef.current = () => {};
    };
  }, [open, oldSensor, allSensors, handleReplacementLlaChange, pingBridgeRef]);

  const ownerDisplay =
    oldSensor?.Owner ?? oldSensor?.owner ?? (selectedOwner.trim() || "—");
  const macDisplay = String(
    (oldSensor?.Mac_Address ?? oldSensor?.mac_address ?? selectedMac.trim()) || "—"
  );

  const locDisplay = oldSensor ? getTrimmedLocation(oldSensor) || "—" : "—";
  const expNameDisplay = oldSensor ? getExpNameForReplace(oldSensor) || "—" : "—";
  const expIdDisplay = oldSensor
    ? String(oldSensor.Exp_ID ?? oldSensor.exp_id ?? "—")
    : "—";
  const llaDisplay = oldSensor ? (oldSensor.LLA ?? oldSensor.lla ?? "—") : "—";

  const confirmToStep2Disabled = submitting || !validation.ok;

  const summaryLines =
    oldSensor && validation.ok && replacementLla.trim()
      ? `Replace sensor at location ${getTrimmedLocation(oldSensor) || "?"}?\n\nOld sensor:\n${(oldSensor.LLA ?? oldSensor.lla ?? "").trim()}\n\nReplacement sensor:\n${replacementLla.trim()}`
      : null;

  if (!open || !oldSensor) return null;

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-4"
      onClick={submitting ? undefined : onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[min(90vh,720px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700/20 bg-white shadow-[0_-12px_48px_rgba(0,0,0,0.35)] sm:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="replace-sensor-toast-title"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 rounded-t-2xl bg-[#333f48] px-4 py-3 text-[#82c3ab]">
          <h2 id="replace-sensor-toast-title" className="text-sm font-bold tracking-wide">
            {approvalStep === 1 ? "Replace Sensor" : "Confirm replacement"}
          </h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xs font-semibold text-white/90 hover:bg-white/10 disabled:opacity-40"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {approvalStep === 1 ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid md:grid-cols-2 md:divide-x md:divide-slate-200">
                <section className="space-y-2 bg-slate-50 p-4">
                  <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">Current sensor</p>
                  <FieldReadonly label="LLA" value={llaDisplay} />
                  <FieldReadonly label="Location" value={locDisplay} />
                  <FieldReadonly label="Experiment" value={expNameDisplay} />
                  <FieldReadonly label="Experiment ID" value={expIdDisplay} />
                  <FieldReadonly label="Owner" value={ownerDisplay} />
                  <FieldReadonly label="MAC" value={macDisplay} />
                </section>

                <section className="space-y-3 p-4">
                  <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">Replacement</p>
                  <p className="text-xs text-slate-600">
                    Choose an inactive sensor below. The next eligible ping from a replacement device will also update
                    this selection automatically. Pinging a replaced slot or an active sensor will show a warning below.
                  </p>
                  {pingSelectionWarning ? (
                    <p
                      className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-900"
                      role="alert"
                    >
                      {pingSelectionWarning}
                    </p>
                  ) : null}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="replace-sensor-select">
                      Inactive sensor (LLA)
                    </label>
                    <select
                      id="replace-sensor-select"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-800"
                      value={replacementLla}
                      onChange={(e) => handleReplacementLlaChange(e.target.value)}
                      disabled={submitting || eligible.length === 0}
                    >
                      <option value="">
                        {eligible.length === 0 ? "No eligible sensors" : "Select replacement…"}
                      </option>
                      {eligible.map((s) => {
                        const lla = (s.LLA ?? s.lla ?? "").trim();
                        const loc = getTrimmedLocation(s) || lla;
                        return (
                          <option key={lla} value={lla}>
                            {lla} — {loc}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </section>
              </div>

              {summaryLines ? (
                <div className="border-t border-slate-200 bg-slate-100/80 px-4 py-3">
                  <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">Summary</p>
                  <pre className="whitespace-pre-wrap font-sans text-xs text-slate-800">{summaryLines}</pre>
                </div>
              ) : null}

              {!validation.ok ? (
                <p className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">{validation.reason}</p>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg border border-emerald-700 bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                onClick={() => setApprovalStep(2)}
                disabled={confirmToStep2Disabled}
              >
                Confirm Replacement
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
              <p className="text-sm font-semibold text-slate-900">Review before sending</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">{SYNC_NOTICE}</p>
              <p className="mt-4 text-xs text-slate-600">
                Only continue if you are ready to submit this replacement to the server.
              </p>
              {summaryLines ? (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">Summary</p>
                  <pre className="whitespace-pre-wrap font-sans text-xs text-slate-800">{summaryLines}</pre>
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3">
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                onClick={() => setApprovalStep(1)}
                disabled={submitting}
              >
                Back
              </button>
              <button
                type="button"
                className="rounded-lg border border-emerald-700 bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                onClick={onConfirmSend}
                disabled={submitting}
              >
                {submitting ? "Sending…" : "Approve and send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ReplaceSensorModal;
