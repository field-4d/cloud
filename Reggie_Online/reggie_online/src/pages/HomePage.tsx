import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header/Header";
import { resolvePermissions, type PermissionsResponse } from "../api/permissions";

const DEFAULT_EMAIL = "nir.averbuch@mail.huji.ac.il";
const LS_LAST_OWNER = "f4d_last_owner";
const LS_LAST_MAC = "f4d_last_mac";
const LS_PREFERRED_OWNER = "f4d_preferred_owner";
const LS_PREFERRED_MAC = "f4d_preferred_mac";

function HomePage() {
  const [email] = useState(DEFAULT_EMAIL);
  const [permissions, setPermissions] = useState<PermissionsResponse["owners"]>([]);
  const [selectedOwner, setSelectedOwner] = useState("");
  const [selectedMac, setSelectedMac] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const macOptions = useMemo(() => {
    const ownerEntry = permissions.find((item) => item.owner === selectedOwner);
    return ownerEntry?.mac_addresses ?? [];
  }, [permissions, selectedOwner]);

  useEffect(() => {
    resolvePermissions(email)
      .then((data) => {
        const owners = data.owners ?? [];
        setPermissions(owners);

        const ownerMap = new Map(owners.map((item) => [item.owner, item.mac_addresses]));
        const preferredOwner = localStorage.getItem(LS_PREFERRED_OWNER) ?? "";
        const preferredMac = localStorage.getItem(LS_PREFERRED_MAC) ?? "";
        const lastOwner = localStorage.getItem(LS_LAST_OWNER) ?? "";
        const lastMac = localStorage.getItem(LS_LAST_MAC) ?? "";

        const preferredValid =
          preferredOwner && preferredMac && (ownerMap.get(preferredOwner) ?? []).includes(preferredMac);
        const lastValid = lastOwner && lastMac && (ownerMap.get(lastOwner) ?? []).includes(lastMac);

        if (preferredValid) {
          setSelectedOwner(preferredOwner);
          setSelectedMac(preferredMac);
        } else if (lastValid) {
          setSelectedOwner(lastOwner);
          setSelectedMac(lastMac);
        } else if (owners.length > 0) {
          const firstOwner = owners[0];
          setSelectedOwner(firstOwner.owner);
          setSelectedMac(firstOwner.mac_addresses[0] ?? "");
        }
        setError("");
      })
      .catch((err) => {
        setError(`Failed to resolve permissions: ${String((err as { message?: string })?.message ?? err)}`);
      });
  }, [email]);

  useEffect(() => {
    if (!selectedOwner) return;
    const nextMacOptions = permissions.find((item) => item.owner === selectedOwner)?.mac_addresses ?? [];
    const nextMac = nextMacOptions[0] ?? "";
    setSelectedMac((prev) => (nextMacOptions.includes(prev) ? prev : nextMac));
  }, [permissions, selectedOwner]);

  function handleOpenDashboard() {
    if (!selectedOwner || !selectedMac) return;
    localStorage.setItem(LS_LAST_OWNER, selectedOwner);
    localStorage.setItem(LS_LAST_MAC, selectedMac);
    const params = new URLSearchParams({
      owner: selectedOwner,
      mac: selectedMac,
    });
    navigate(`/dashboard?${params.toString()}`);
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-3xl p-6 space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-2">
          <h2 className="text-base font-semibold text-slate-900">Login foundation</h2>
          <p className="text-sm text-slate-600">
            Current placeholder user (no auth flow yet): <span className="font-medium text-slate-800">{email}</span>
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Device context</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col text-sm text-slate-700">
              Owner
              <select
                className="mt-1 rounded-md border border-slate-300 px-2 py-2"
                value={selectedOwner}
                onChange={(event) => setSelectedOwner(event.target.value)}
              >
                {permissions.map((item) => (
                  <option key={item.owner} value={item.owner}>
                    {item.owner}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col text-sm text-slate-700">
              MAC Address
              <select
                className="mt-1 rounded-md border border-slate-300 px-2 py-2"
                value={selectedMac}
                onChange={(event) => setSelectedMac(event.target.value)}
              >
                {macOptions.map((mac) => (
                  <option key={mac} value={mac}>
                    {mac}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={handleOpenDashboard}
            disabled={!selectedOwner || !selectedMac}
          >
            Open Dashboard
          </button>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </section>
      </main>
    </div>
  );
}

export default HomePage;
