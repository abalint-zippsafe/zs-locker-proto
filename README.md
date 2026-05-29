# Locker Prototype

A tiny prototype that simulates 3 lockers. State is kept **in memory** and is
lost when the server restarts.

## Concept

Each locker has three states:

- **open** — door physically open
- **closed** — door physically closed but **not locked**; shows a QR code
- **locked** — door closed and locked

Flow: press **Close door** → a random key is generated and a QR code appears.
The QR points to `…/lock?id=<id>&key=<key>`. Scanning it (or pressing the Lock
button) verifies the key and locks the locker. **Open** unlocks/opens it and
does **not** check the key (a separate service is assumed to authorize that).

## Run

```bash
pnpm install
pnpm dev
```

- Web UI: http://localhost:5173
- API:    http://localhost:3001 (also bound on your LAN IP so phones can scan QR)

## API (no auth, callable from anywhere)

| Method     | Route                       | Notes                                   |
| ---------- | --------------------------- | --------------------------------------- |
| `GET`      | `/api/lockers`              | list locker states                      |
| `POST`     | `/api/lockers/:id/close`    | close door, generate key, return QR URL |
| `GET/POST` | `/lock?id=&key=`            | **verifies key**, then locks            |
| `GET/POST` | `/open?id=`                 | opens, **no key check**                 |

Examples:

```bash
curl -X POST http://localhost:3001/api/lockers/1/close
curl "http://localhost:3001/lock?id=1&key=<key-from-close>"
curl "http://localhost:3001/open?id=1"
```
