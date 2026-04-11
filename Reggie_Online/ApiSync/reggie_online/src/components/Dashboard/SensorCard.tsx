type SensorCardProps = {
  id: string;
  status: string;
};

function SensorCard({ id, status }: SensorCardProps) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="font-medium text-slate-900">Sensor {id}</h3>
      <p className="mt-1 text-sm text-slate-600">Status: {status}</p>
    </article>
  );
}

export default SensorCard;
