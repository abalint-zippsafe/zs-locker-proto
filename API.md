# Locker Simulator — API

A small prototype that simulates lockers. **State is in-memory** and resets when
the server restarts. No authentication — every endpoint is callable from anywhere.

## Base URLs

| Environment | Base URL |
| ----------- | -------- |
| Deployed    | `https://zs-locker-proto.onrender.com` |
| Local       | `http://localhost:3001` |

## Locker states

| `status`  | Meaning |
| --------- | ------- |
| `open`    | Door physically open |
| `closed`  | Door physically closed but **not locked** (a key exists; QR is shown) |
| `locked`  | Door closed and locked |

Lifecycle: `open` → *(close)* → `closed` → *(lock, verifies key)* → `locked` → *(open, no key)* → `open`

---

## Endpoints

### `GET /api/lockers`
List all lockers. The key is never returned here — only `hasKey`.

**200 OK**
```json
[
  { "id": "1", "status": "open",   "hasKey": false },
  { "id": "2", "status": "closed", "hasKey": true  },
  { "id": "3", "status": "locked", "hasKey": true  }
]
```

---

### `POST /api/lockers/:id/close`
Simulates the door physically closing. Generates a fresh key, sets status to
`closed`, and returns the key plus the `lockUrl` encoded into the QR code.

> **Note:** `lockUrl` points to the **external proto page**, not to this
> server's `/lock` endpoint:
> `https://zipp-locker-zms.azurewebsites.net/proto?key=<key>&id=<id>`
> That page is expected to verify the user and then call `/lock` below.

**200 OK**
```json
{
  "id": "1",
  "status": "closed",
  "key": "906db3ad0214abea05674d548bac2f5e",
  "lockUrl": "https://zipp-locker-zms.azurewebsites.net/proto?key=906db3ad0214abea05674d548bac2f5e&id=1"
}
```
**404 Not Found** — `{ "error": "no such locker" }`

---

### `GET|POST /lock`
Takes `id` and `key`, **verifies the key**, then locks the locker. Params may be
sent as query string (so a scanned link works in a browser) or as a JSON body.

| Param | Where | Example |
| ----- | ----- | ------- |
| `id`  | query or body | `1` |
| `key` | query or body | `906db3ad…` |

```
GET  /lock?id=1&key=906db3ad0214abea05674d548bac2f5e
POST /lock      { "id": "1", "key": "906db3ad…" }
```

**200 OK** — `{ "ok": true, "id": "1", "status": "locked" }`

**Errors**
| Status | Body | When |
| ------ | ---- | ---- |
| `404`  | `{ "ok": false, "error": "no such locker" }` | unknown id |
| `409`  | `{ "ok": false, "error": "locker is open, close it first" }` | locker is `open` |
| `403`  | `{ "ok": false, "error": "invalid key" }` | key does not match |

> If the request `Accept`s `text/html` (i.e. opened in a browser), the same
> outcomes are returned as a simple confirmation/error HTML page instead of JSON.

---

### `GET|POST /open`
Opens the locker and clears its key. **Does not verify the key** — a separate
service is assumed to authorize this. Also available as
`GET|POST /api/lockers/:id/open`.

| Param | Where | Example |
| ----- | ----- | ------- |
| `id`  | query, path, or body | `1` |

```
GET  /open?id=1
POST /api/lockers/1/open
```

**200 OK** — `{ "ok": true, "id": "1", "status": "open" }`
**404 Not Found** — `{ "ok": false, "error": "no such locker" }`

---

## Quick walkthrough (curl)

```bash
BASE=https://zs-locker-proto.onrender.com

# 1. close locker 1 -> get a key
curl -X POST $BASE/api/lockers/1/close

# 2. lock it with that key (normally the proto page does this)
curl "$BASE/lock?id=1&key=<key-from-step-1>"

# 3. check state
curl $BASE/api/lockers

# 4. open it (no key needed)
curl "$BASE/open?id=1"
```
