import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

const STATUS = {
  open: { label: "OPEN", dot: "bg-emerald-500", text: "text-emerald-400", icon: "🔓" },
  closed: { label: "CLOSED (unlocked)", dot: "bg-amber-500", text: "text-amber-400", icon: "🚪" },
  locked: { label: "LOCKED", dot: "bg-rose-500", text: "text-rose-400", icon: "🔒" },
};

function LockerCard({ locker, onClose, onOpen }) {
  const s = STATUS[locker.status] ?? STATUS.open;

  return (
    <div className="flex w-full flex-col rounded-2xl border border-slate-700 bg-slate-800/60 p-6 shadow-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-100">Locker {locker.id}</h2>
        <span className={`flex items-center gap-2 text-sm font-medium ${s.text}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
          {s.label}
        </span>
      </div>

      <div className="mt-6 flex min-h-[208px] flex-1 items-center justify-center rounded-xl bg-slate-900/70 p-4">
        {locker.status === "closed" && locker.lockUrl ? (
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-white p-3">
              <QRCodeSVG value={locker.lockUrl} size={140} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">
                scan to lock
              </span>
              <span className="text-[11px] uppercase tracking-wide text-slate-500">
                key
              </span>
              <code className="max-w-[120px] break-all text-xs text-slate-200">
                {locker.key}
              </code>
            </div>
          </div>
        ) : (
          <span className="text-7xl">{s.icon}</span>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-2">
        {locker.status === "open" && (
          <button
            onClick={() => onClose(locker.id)}
            className="rounded-lg bg-amber-600 px-4 py-2 font-medium text-white transition hover:bg-amber-500"
          >
            Close door (generate key)
          </button>
        )}

        {locker.status !== "open" && (
          <button
            onClick={() => onOpen(locker.id)}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-500"
          >
            Open (no key check)
          </button>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [lockers, setLockers] = useState([]);
  // Keys/lockUrls live only on the client for the locker that was just closed,
  // mirroring that the QR is shown locally on the device.
  const [secrets, setSecrets] = useState({}); // { [id]: { key, lockUrl } }

  async function refresh() {
    const res = await fetch("/api/lockers", { cache: "no-store" });
    const data = await res.json();
    setLockers(data);
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, []);

  async function handleClose(id) {
    const res = await fetch(`/api/lockers/${id}/close`, { method: "POST" });
    const data = await res.json();
    setSecrets((s) => ({ ...s, [id]: { key: data.key, lockUrl: data.lockUrl } }));
    refresh();
  }

  async function handleOpen(id) {
    await fetch(`/open?id=${id}`);
    setSecrets((s) => {
      const { [id]: _, ...rest } = s;
      return rest;
    });
    refresh();
  }

  // Merge server state with client-held lockUrl so the QR can render.
  const view = lockers.map((l) => ({
    ...l,
    lockUrl: l.status === "closed" ? secrets[l.id]?.lockUrl : undefined,
    key: l.status === "closed" ? secrets[l.id]?.key : undefined,
  }));

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-bold">🔐 Locker Prototype</h1>
          <p className="mt-2 text-slate-400">
            Close a door to generate a key &amp; QR. Scanning the QR verifies the
            key and locks. Open does not check the key.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {view.map((l) => (
            <LockerCard
              key={l.id}
              locker={l}
              onClose={handleClose}
              onOpen={handleOpen}
            />
          ))}
        </div>

        <footer className="mt-10 text-center text-xs text-slate-500">
          API: <code>POST /api/lockers/:id/close</code> ·{" "}
          <code>GET /lock?id=&amp;key=</code> · <code>GET /open?id=</code>
        </footer>
      </div>
    </div>
  );
}
