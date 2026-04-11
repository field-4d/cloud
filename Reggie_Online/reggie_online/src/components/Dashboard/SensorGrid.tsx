import SensorCard from "./SensorCard";

const placeholderSensors = [
  { id: "001", status: "active" },
  { id: "002", status: "active" },
  { id: "003", status: "inactive" },
];

function SensorGrid() {
  return (
    <section className="p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {placeholderSensors.map((sensor) => (
          <SensorCard key={sensor.id} id={sensor.id} status={sensor.status} />
        ))}
      </div>
    </section>
  );
}

export default SensorGrid;
