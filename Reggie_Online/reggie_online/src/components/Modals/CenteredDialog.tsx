ccimport type { ReactNode } from "react";

type CenteredDialogProps = {
  open: boolean;
  title: string;
  tone?: "neutral" | "success" | "warning";
  size?: "normal" | "wide";
  onClose?: () => void;
  children?: ReactNode;
  actions?: ReactNode;
};

function CenteredDialog({
  open,
  title,
  tone = "neutral",
  size = "normal",
  onClose,
  children,
  actions,
}: CenteredDialogProps) {
  if (!open) return null;

  const toneClass =
    tone === "success"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : tone === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-white text-slate-800";

  const widthClass = size === "wide" ? "max-w-2xl" : "max-w-md";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className={`w-full ${widthClass} rounded-lg border p-4 text-sm shadow-lg space-y-2 ${toneClass}`}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="font-semibold">{title}</p>
        {children}
        {actions ? <div className="pt-2 flex items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export default CenteredDialog;
