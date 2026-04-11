type ExperimentModalProps = {
  open: boolean;
};

function ExperimentModal({ open }: ExperimentModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
        <h2 className="text-lg font-semibold">Experiment</h2>
        <p className="mt-2 text-sm text-slate-600">Placeholder experiment flow.</p>
      </div>
    </div>
  );
}

export default ExperimentModal;
