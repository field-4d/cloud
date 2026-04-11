type ConfirmModalProps = {
  open: boolean;
  message?: string;
};

function ConfirmModal({ open, message = "Are you sure?" }: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
        <h2 className="text-lg font-semibold">Confirm</h2>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
      </div>
    </div>
  );
}

export default ConfirmModal;
