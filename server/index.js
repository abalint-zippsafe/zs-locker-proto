// Simple in-memory locker simulator API.
// State is held in memory only and is lost when the process restarts.

import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

// --- In-memory locker state -------------------------------------------------
// status: "open"  -> door physically open
//         "closed"-> door physically closed but NOT locked (shows a QR code)
//         "locked"-> door closed and locked
const lockers = new Map();
for (const id of ["1", "2", "3"]) {
  lockers.set(id, { id, status: "open", key: null });
}

// Best-effort LAN IP so QR codes are reachable from a phone on the same network.
function lanIp() {
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const net of iface || []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}
const FALLBACK_BASE_URL = process.env.BASE_URL || `http://${lanIp()}:${PORT}`;

// Build the base URL for QR codes. Prefer an explicit BASE_URL, otherwise use
// the incoming request's host/proto (works behind a hosting proxy), and fall
// back to the LAN IP for local use.
function baseUrl(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  const host = req.get("host");
  if (host) return `${req.protocol}://${host}`;
  return FALLBACK_BASE_URL;
}

function publicLocker(l) {
  // Never expose the key in list responses; only return it right after closing.
  return { id: l.id, status: l.status, hasKey: Boolean(l.key) };
}

const app = express();
app.set("trust proxy", true); // respect X-Forwarded-* when behind a host proxy
app.use(cors());
app.use(express.json());

// Never cache state endpoints: the UI polls /api/lockers and must always see
// the live state. Without this, a CDN/browser cache can serve a stale "closed"
// response after the locker has already been locked. Hashed static assets,
// served later, keep their normal caching.
app.use(["/api", "/lock", "/open"], (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// List all lockers
app.get("/api/lockers", (_req, res) => {
  res.json([...lockers.values()].map(publicLocker));
});

// Physically close the door: generates a fresh key and exposes the lock URL/QR.
app.post("/api/lockers/:id/close", (req, res) => {
  const l = lockers.get(req.params.id);
  if (!l) return res.status(404).json({ error: "no such locker" });

  l.key = crypto.randomBytes(16).toString("hex");
  l.status = "closed";

  const lockUrl = `${baseUrl(req)}/lock?id=${l.id}&key=${l.key}`;
  res.json({ id: l.id, status: l.status, key: l.key, lockUrl });
});

// --- LOCK -------------------------------------------------------------------
// Takes an id and a key, verifies the key, then locks. Callable from anywhere.
// Accepts both query params (so a scanned QR opens it in a browser) and JSON.
function doLock(req, res) {
  const id = req.query.id ?? req.body?.id;
  const key = req.query.key ?? req.body?.key;
  const l = id != null ? lockers.get(String(id)) : null;

  const wantsHtml = (req.headers.accept || "").includes("text/html");
  const fail = (code, msg) => {
    if (wantsHtml) return res.status(code).send(htmlPage("❌ " + msg, "#dc2626"));
    return res.status(code).json({ ok: false, error: msg });
  };

  if (!l) return fail(404, "no such locker");
  if (l.status === "open") return fail(409, "locker is open, close it first");
  if (!l.key || key !== l.key) return fail(403, "invalid key");

  l.status = "locked";
  if (wantsHtml) return res.send(htmlPage(`🔒 Locker ${l.id} locked`, "#16a34a"));
  res.json({ ok: true, id: l.id, status: l.status });
}
app.get("/lock", doLock);
app.post("/lock", doLock);

// --- OPEN -------------------------------------------------------------------
// Opens the locker. Does NOT verify the key — a separate service authorizes
// this. Callable from anywhere.
function doOpen(req, res) {
  const id = req.params.id ?? req.query.id ?? req.body?.id;
  const l = id != null ? lockers.get(String(id)) : null;

  const wantsHtml = (req.headers.accept || "").includes("text/html");
  if (!l) {
    if (wantsHtml) return res.status(404).send(htmlPage("❌ no such locker", "#dc2626"));
    return res.status(404).json({ ok: false, error: "no such locker" });
  }

  l.status = "open";
  l.key = null;
  if (wantsHtml) return res.send(htmlPage(`🔓 Locker ${l.id} opened`, "#16a34a"));
  res.json({ ok: true, id: l.id, status: l.status });
}
app.get("/open", doOpen);
app.post("/open", doOpen);
app.get("/api/lockers/:id/open", doOpen);
app.post("/api/lockers/:id/open", doOpen);

function htmlPage(message, color) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Locker</title></head>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#0f172a">
<div style="background:white;padding:2rem 3rem;border-radius:1rem;font-size:1.5rem;color:${color};font-weight:600">
${message}</div></body></html>`;
}

// Serve the built React UI when it exists (single-service production hosting).
const distDir = path.join(__dirname, "..", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback for any non-API GET that didn't match a route above.
  app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Locker API on ${FALLBACK_BASE_URL}`);
  console.log(`  GET  /api/lockers`);
  console.log(`  POST /api/lockers/:id/close`);
  console.log(`  GET|POST /lock?id=&key=   (verifies key)`);
  console.log(`  GET|POST /open?id=        (no key check)`);
});
