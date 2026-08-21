# Inventory Backend — Complete API & Flow Guide

> **Audience:** QA, frontend engineers, and anyone learning the system.  
> **Base URL:** `http://localhost:4000`  
> **Live OpenAPI UI:** `http://localhost:4000/docs`  
> **Postman collection:** `docs/postman/Inventory-Backend.postman_collection.json`

---

## 0. How to use this document (read this first)

This page is both a **tutorial** and an **API reference**. Follow it in order the first time; later jump to any API section via the table of contents.

### Step A — Start the stack

```bash
npm install
cp .env.example .env          # fill JWT_SECRET, AGENT_JWT_SECRET, DATABASE_URL, ADMIN_SECRET_PASSWORD_HASH
npm run docker:up
npm run prisma:migrate:deploy
npm run seed
npm run dev
```

Confirm:

```bash
curl http://localhost:4000/health
```

You should see `"db":"ok"` and `"redis":"ok"` (or `"degraded"` if Redis is down — notifications/jobs need Redis).

### Step B — Understand roles before calling APIs

| Seed email | Role | Password | What they can do |
|------------|------|----------|------------------|
| `super.admin@inventory.local` | SUPER_ADMIN | `Password123!` | Everything + user CRUD + audit/notifications |
| `dgn.manager@inventory.local` | DGN_IT_MANAGER | `Password123!` | Staff ops + audit/notifications + permanent delete |
| `service.manager@inventory.local` | SERVICE_MANAGER | `Password123!` | Client + Device + OND edit (no user admin, no MANUAL_DELETE) |
| `ravi.sharma@inventory.local` | IT_ENGINEER | `Password123!` | Device/OND edit **only for assigned clients** |
| `sameer.kapoor@client.local` | CLIENT_MANAGER | `Password123!` | View managed devices only |
| `priya.nair@client.local` | EMPLOYEE | `Password123!` | View own assigned device only |

**Auth header for AppUser APIs:**

```http
Authorization: Bearer <token from login>
```

**Auth header for Agent APIs:**

```http
x-agent-api-key: seed-agent-delhi-key
```

(Seed agent is attached to device `DEL-LN-00101`. Look up its `agentId` via Prisma Studio or device resolve.)

### Step C — Recommended first-time walkthrough (end-to-end)

Do these calls in order. Copy IDs from each response into the next call.

| # | What you learn | Call |
|---|----------------|------|
| 1 | Health | `GET /health` |
| 2 | Login + JWT | `POST /api/v1/auth/login` as super.admin |
| 3 | List seeded sites | `GET /api/v1/clients` |
| 4 | Create a site | `POST /api/v1/clients` |
| 5 | Move location (history) | `PATCH /api/v1/clients/:id/location` |
| 6 | Allot a laptop | `POST /api/v1/devices` |
| 7 | See QR + assignment | `GET /api/v1/devices/:id` |
| 8 | PATCH inventory | `PATCH /api/v1/devices/:id` |
| 9 | See **field-level audit** | `GET /api/v1/audit-logs?entityType=Device&entityId=...` |
| 10 | Create + link OND | `POST /other-network-devices` then `PATCH .../link` |
| 11 | Confirm link from Device | `GET /api/v1/devices/:id` → `linkedOtherNetworkDevices` |
| 12 | Agent poll / storage alert | `POST /api/v1/agents/:agentId/poll` |
| 13 | Notifications queue row | `GET /api/v1/notifications` |
| 14 | Discard lifecycle | `POST /api/v1/devices/:id/lifecycle` `{ "eventType":"DISCARD" }` |
| 15 | Prove 403 RBAC | Repeat step 6 with EMPLOYEE token → expect `FORBIDDEN` |

### Step D — How to read each API section below

Every endpoint documents:

1. **Method + path**
2. **Auth** (JWT / agent key / public)
3. **Roles allowed** (who gets through the RBAC guard)
4. **Request body / query** (exact JSON)
5. **Success response** (realistic example matching zod schemas)
6. **Error responses** (same `{ error: { code, message } }` shape)
7. **Side effects** (domain events → Audit / Notification)

---

## 1. System flow (mental model)

```
Browser / Postman / Agent
        │
        ▼
   Fastify routes  ── RBAC hooks (401 / 403)
        │
        ▼
   Controller → Service → Prisma repository
        │
        ▼
   DomainEventBus.emit(AuditableEvent)
        ├── AuditListener  → AuditLog (before / after / fieldChanges)
        └── NotificationListener → BullMQ "notifications" → SMTP worker
```

**Rule:** Modules never call each other’s repositories. Device reads linked OND via `OtherNetworkDeviceService`, not the OND repo.

---

## 2. Health

### `GET /health`

| | |
|--|--|
| **Auth** | None |
| **Roles** | Public |

**Success `200` (healthy):**

```json
{
  "status": "ok",
  "service": "inventory-backend",
  "env": "development",
  "uptimeSeconds": 42,
  "checkedAt": "2026-08-20T15:00:00.000Z",
  "db": "ok",
  "redis": "ok",
  "docs": "/docs"
}
```

**Degraded `503`:** `"status":"degraded"` when `db` or `redis` is `"unreachable"`.

---

## 3. Auth

### `POST /api/v1/auth/login`

| | |
|--|--|
| **Auth** | None |
| **Roles** | Any provisioned AppUser |

**Body:**

```json
{
  "email": "super.admin@inventory.local",
  "password": "Password123!"
}
```

**Success `200`:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "11111111-1111-1111-1111-111111111111",
    "name": "Super Admin",
    "email": "super.admin@inventory.local",
    "role": "SUPER_ADMIN"
  }
}
```

Save `token` as `Authorization: Bearer <token>` for all AppUser calls below.

**Errors:**

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request failed validation", "details": {} } }
```
```json
{ "error": { "code": "UNAUTHORIZED", "message": "Invalid email or password" } }
```

---

## 4. Users (user-management)

### `GET /api/v1/users`

| | |
|--|--|
| **Auth** | JWT |
| **Roles** | **SUPER_ADMIN only** |

**Query:** `?page=1&pageSize=20`

**Success `200`:**

```json
{
  "items": [
    {
      "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "name": "Ravi Sharma",
      "email": "ravi.sharma@inventory.local",
      "role": "IT_ENGINEER",
      "isActive": true,
      "createdAt": "2026-08-20T10:00:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 13
}
```

**403 (EMPLOYEE):**

```json
{ "error": { "code": "FORBIDDEN", "message": "Role EMPLOYEE is not permitted to access this resource" } }
```

---

### `POST /api/v1/users`

| | |
|--|--|
| **Auth** | JWT |
| **Roles** | SUPER_ADMIN |

**Body:**

```json
{
  "name": "New Engineer",
  "email": "new.engineer@inventory.local",
  "password": "Password123!",
  "role": "IT_ENGINEER",
  "isActive": true
}
```

**Success `201`:**

```json
{
  "id": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
  "name": "New Engineer",
  "email": "new.engineer@inventory.local",
  "role": "IT_ENGINEER",
  "isActive": true,
  "createdAt": "2026-08-20T15:05:00.000Z"
}
```

**Side effects:** `appUser.created` → AuditLog `CREATE`.

---

### `PATCH /api/v1/users/:id`

| | |
|--|--|
| **Auth** | JWT |
| **Roles** | SUPER_ADMIN |

**Body (any subset):**

```json
{ "isActive": false, "name": "Ravi Sharma (Offboarded)" }
```

**Success `200`:** public user object (same shape as create).

**Side effects:** `appUser.updated` → Audit with `fieldChanges`.

---

### `PATCH /api/v1/devices/:deviceId/assignments/:assignmentId/link-account`

| | |
|--|--|
| **Auth** | JWT |
| **Roles** | SUPER_ADMIN, DGN_IT_MANAGER |

Links an **existing** AppUser (by email) onto a DeviceAssignment. Never auto-creates accounts.

**Body:**

```json
{
  "email": "priya.nair@client.local",
  "linkAs": "employee"
}
```

`linkAs` is `"employee"` or `"manager"`.

**Success `200`:**

```json
{
  "deviceId": "d1111111-1111-1111-1111-111111111111",
  "assignmentId": "a2222222-2222-2222-2222-222222222222",
  "employeeUserId": "e3333333-3333-3333-3333-333333333333",
  "managerUserId": null,
  "linkedUser": {
    "id": "e3333333-3333-3333-3333-333333333333",
    "name": "Priya Nair",
    "email": "priya.nair@client.local",
    "role": "EMPLOYEE",
    "isActive": true,
    "createdAt": "2026-08-20T10:00:00.000Z"
  },
  "linkAs": "employee"
}
```

---

## 5. Clients (sites)

### `GET /api/v1/clients`

| | |
|--|--|
| **Auth** | JWT |
| **Roles** | All roles *pass the route*; SERVICE_MANAGER+ see all; IT_ENGINEER sees **assigned** clients only; CLIENT_MANAGER/EMPLOYEE get empty list |

**Success `200`:**

```json
{
  "items": [
    {
      "id": "c1111111-1111-1111-1111-111111111111",
      "name": "CRL Delhi",
      "currentLocation": "CRL Delhi - Floor 2",
      "createdAt": "2026-08-20T10:00:00.000Z",
      "updatedAt": "2026-08-20T10:00:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 3
}
```

---

### `POST /api/v1/clients`

| | |
|--|--|
| **Auth** | JWT |
| **Roles** | SUPER_ADMIN, DGN_IT_MANAGER, SERVICE_MANAGER (**not** IT_ENGINEER) |

**Body:**

```json
{
  "name": "CRL Pune",
  "currentLocation": "CRL Pune - HQ"
}
```

**Success `201`:**

```json
{
  "id": "c9999999-9999-9999-9999-999999999999",
  "name": "CRL Pune",
  "currentLocation": "CRL Pune - HQ",
  "createdAt": "2026-08-20T15:10:00.000Z",
  "updatedAt": "2026-08-20T15:10:00.000Z"
}
```

**403 (IT_ENGINEER):**

```json
{ "error": { "code": "FORBIDDEN", "message": "..." } }
```

**Side effects:** `client.created` → Audit.

---

### `PATCH /api/v1/clients/:id/location` (FR-MOVE-01)

| | |
|--|--|
| **Auth** | JWT |
| **Roles** | SUPER_ADMIN, DGN_IT_MANAGER, SERVICE_MANAGER |

Does **not** touch Device rows. Appends a SiteLocation and flips `isCurrent`.

**Body:**

```json
{ "currentLocation": "CRL Pune - Annex" }
```

**Success `200`:** client object with updated `currentLocation`.

**400** if new location equals current.

**Side effects:** `client.location_changed` → Audit with before/after locations.

---

### `POST /api/v1/clients/:id/engineers`

| | |
|--|--|
| **Auth** | JWT |
| **Roles** | Client **edit** roles |

**Body:**

```json
{ "userId": "<IT_ENGINEER AppUser uuid>" }
```

**Success `201`:**

```json
{
  "id": "ea111111-1111-1111-1111-111111111111",
  "appUserId": "eng-uuid",
  "clientId": "client-uuid",
  "isActive": true,
  "assignedAt": "2026-08-20T15:12:00.000Z",
  "unassignedAt": null
}
```

---

### `DELETE /api/v1/clients/:id/engineers/:userId`

Off-boards (sets `isActive=false`). Does **not** deactivate the AppUser.

**Success `200`:** engineer assignment with `isActive: false`.

---

## 6. Devices (Site Inventory)

### `POST /api/v1/devices` — Allotment

| | |
|--|--|
| **Auth** | JWT |
| **Roles** | SUPER_ADMIN, DGN_IT_MANAGER, SERVICE_MANAGER, IT_ENGINEER (engineer must be assigned to `clientId`) |

Creates **Device + current DeviceAssignment + QrCode** in one DB transaction.

**Body:**

```json
{
  "clientId": "c1111111-1111-1111-1111-111111111111",
  "assetTag": "PUN-LN-00999",
  "cpu": "Intel Core i5-1345U",
  "ram": "16 GB",
  "storageTotal": "512 GB SSD",
  "storageUsedPercent": 12,
  "installedSoftware": ["Chrome", "VS Code"],
  "assignment": {
    "userName": "Priya Nair",
    "userPhone": "+91 9800000000",
    "userEmail": "priya.nair@client.local",
    "department": "Engineering",
    "managerName": "Sameer Kapoor",
    "managerPhone": "+91 9800000001",
    "managerEmail": "sameer.kapoor@client.local"
  }
}
```

**Success `201`:**

```json
{
  "id": "d9999999-9999-9999-9999-999999999999",
  "clientId": "c1111111-1111-1111-1111-111111111111",
  "assetTag": "PUN-LN-00999",
  "cpu": "Intel Core i5-1345U",
  "ram": "16 GB",
  "storageTotal": "512 GB SSD",
  "storageUsedPercent": 12,
  "pciCards": null,
  "soundCards": null,
  "connectedDevices": null,
  "installedSoftware": ["Chrome", "VS Code"],
  "status": "ACTIVE",
  "discardedAt": null,
  "deletionDueAt": null,
  "discardWarningSentAt": null,
  "retiredFlag": false,
  "createdAt": "2026-08-20T15:20:00.000Z",
  "updatedAt": "2026-08-20T15:20:00.000Z",
  "qrCode": {
    "id": "q9999999-9999-9999-9999-999999999999",
    "deviceId": "d9999999-9999-9999-9999-999999999999",
    "qrValue": "INV:PUN-LN-00999",
    "printCount": 0,
    "createdAt": "2026-08-20T15:20:00.000Z"
  },
  "currentAssignment": {
    "id": "a9999999-9999-9999-9999-999999999999",
    "deviceId": "d9999999-9999-9999-9999-999999999999",
    "userName": "Priya Nair",
    "userPhone": "+91 9800000000",
    "userEmail": "priya.nair@client.local",
    "department": "Engineering",
    "managerName": "Sameer Kapoor",
    "managerPhone": "+91 9800000001",
    "managerEmail": "sameer.kapoor@client.local",
    "employeeUserId": null,
    "managerUserId": null,
    "managerAcknowledgedAt": null,
    "isCurrent": true,
    "assignedAt": "2026-08-20T15:20:00.000Z",
    "unassignedAt": null
  },
  "linkedOtherNetworkDevices": []
}
```

**Side effects:**

- `device.allotted` → Audit CREATE + **email job** (DEVICE_ALLOTMENT) to userEmail + managerEmail
- `qr.generated` → Audit CREATE

**403 (EMPLOYEE)** as shown in walkthrough step 15.

---

### `GET /api/v1/devices`

| | |
|--|--|
| **Auth** | JWT |
| **Roles** | All (scoped: engineer=assigned clients; manager/employee=linked assignments) |

**Query:** `?page=1&pageSize=20&clientId=<uuid>&status=ACTIVE`

**Success `200`:** `{ items: [DeviceDetail...], page, pageSize, total }`

---

### `GET /api/v1/devices/:id`

Same **DeviceDetail** shape as allotment response, including `linkedOtherNetworkDevices`.

---

### `PATCH /api/v1/devices/:id`

| | |
|--|--|
| **Auth** | JWT |
| **Roles** | Device **edit** roles |

**Body (at least one field):**

```json
{
  "cpu": "Intel Core i7-1355U",
  "ram": "32 GB",
  "storageUsedPercent": 44
}
```

**Success `200`:** full DeviceDetail with updated fields.

**Side effects:** `device.updated` → Audit UPDATE. Example audit `after`:

```json
{
  "cpu": "Intel Core i7-1355U",
  "ram": "32 GB",
  "storageUsedPercent": 44,
  "fieldChanges": {
    "cpu": { "from": "Intel Core i5-1345U", "to": "Intel Core i7-1355U" },
    "ram": { "from": "16 GB", "to": "32 GB" },
    "storageUsedPercent": { "from": 12, "to": 44 }
  },
  "changedAt": "2026-08-20T15:25:00.000Z"
}
```

This is how **every minor change** is recorded.

---

### `POST /api/v1/devices/:id/assignments` — User-on-device change

| | |
|--|--|
| **Auth** | JWT |
| **Roles** | Device edit |

Closes current assignment (`isCurrent=false`) and inserts a new current row. **Does not change Device.id or QR.**

**Body:** same shape as `assignment` in allotment.

**Success `200`:** new assignment object.

---

### `POST /api/v1/devices/:id/lifecycle`

| | |
|--|--|
| **Auth** | JWT |
| **Roles** | Device edit; **MANUAL_DELETE** additionally requires SUPER_ADMIN or DGN_IT_MANAGER |

**Body:**

```json
{ "eventType": "DISCARD" }
```

Allowed user-initiated `eventType` values: `DISCARD` | `REACTIVATE` | `MANUAL_DELETE` | `RETIRE` | `SCRAP`.

**Success `200` (DISCARD):** DeviceDetail with:

```json
{
  "status": "DISCARDED",
  "discardedAt": "2026-08-20T15:30:00.000Z",
  "deletionDueAt": "2026-11-18T15:30:00.000Z",
  "retiredFlag": false
}
```

(`deletionDueAt` = now + 90 days.)

**409** illegal transition; **403** SERVICE_MANAGER attempting `MANUAL_DELETE`.

**Side effects:** `device.discarded` / `device.reactivated` / `device.deleted` / … → Audit.

---

### `GET /api/v1/devices/:id/history/software` & `.../hardware`

Paged history from agent polls.

**Software item example:**

```json
{
  "id": "...",
  "deviceId": "...",
  "pollLogId": "...",
  "softwareName": "Slack",
  "action": "ADDED",
  "detectedAt": "2026-08-20T15:40:00.000Z"
}
```

---

### `GET /api/v1/devices/manager-lookup?query=sameer`

| | |
|--|--|
| **Roles** | Device edit |

Returns manager autofill suggestions for the allotment form.

---

### `GET /api/v1/devices/download-agent?clientId=<uuid>`

| | |
|--|--|
| **Roles** | Device edit |

**Success `200`:**

```json
{
  "clientId": "c1111111-1111-1111-1111-111111111111",
  "token": "eyJ...",
  "expiresAt": "2026-08-20T16:20:00.000Z",
  "tokenType": "agent-download"
}
```

---

## 7. QR

### `GET /api/v1/qr/:deviceId/image?format=png|svg`

| | |
|--|--|
| **Auth** | JWT |
| **Roles** | Device **view** |

Returns raw PNG bytes (`image/png`) or SVG (`image/svg+xml`). Increments `printCount`.

**Side effects:** `qr.printed` → Audit.

---

### `GET /api/v1/qr/resolve/:qrValue`

Example path: `/api/v1/qr/resolve/INV:DEL-LN-00101`

**Success `200` (fresh agent):**

```json
{
  "status": "ok",
  "stale": false,
  "qrValue": "INV:DEL-LN-00101",
  "device": {
    "id": "...",
    "clientId": "...",
    "assetTag": "DEL-LN-00101",
    "status": "ACTIVE",
    "cpu": "...",
    "ram": "...",
    "storageUsedPercent": 41
  },
  "agent": {
    "id": "...",
    "lastPollAt": "2026-08-20T14:00:00.000Z",
    "lastPollStatus": "SUCCESS"
  }
}
```

**Stale warning** (`status: "stale_warning"`) when QR unknown, agent missing, or last poll older than `QR_STALE_POLL_THRESHOLD_MS`.

---

### `POST /api/v1/qr/:deviceId/run-poll`

| | |
|--|--|
| **Roles** | Device edit |

Emits `agent.poll.requested` (does not invent telemetry). Returns `{ deviceId, agentId, requestedAt }`.

---

## 8. Agents

### `POST /api/v1/agents/:agentId/poll`

| | |
|--|--|
| **Auth** | `x-agent-api-key` (not JWT) |
| **Roles** | N/A — agent identity |

**Headers:**

```http
x-agent-api-key: seed-agent-delhi-key
Content-Type: application/json
```

**Body:**

```json
{
  "cpu": "Intel Core i5-1345U",
  "ram": "16 GB",
  "storageTotal": "512 GB SSD",
  "storageUsedPercent": 82,
  "installedSoftware": ["Chrome", "VS Code", "Slack"]
}
```

**Success `200`:**

```json
{
  "pollLogId": "p1111111-1111-1111-1111-111111111111",
  "status": "SUCCESS",
  "softwareChanges": [
    { "softwareName": "Slack", "action": "ADDED" }
  ],
  "hardwareChanges": [],
  "storageUsedPercent": 82
}
```

If `storageUsedPercent >= 80` → emits `device.storage.threshold_breached` → Notification job (STORAGE_THRESHOLD).

**401** without/invalid API key.

---

### `POST /api/v1/agents/:agentId/deregister`

| | |
|--|--|
| **Auth** | Agent API key |
| **Rate limit** | 5 / 15 minutes |

**Body:**

```json
{ "adminSecret": "<plaintext matching ADMIN_SECRET_PASSWORD_HASH>" }
```

**Success `200`:** `{ "agentId": "...", "deregistered": true }`  
**403** wrong secret.

---

## 9. Other Network Devices

### `POST /api/v1/other-network-devices`

| | |
|--|--|
| **Roles** | OND **edit** (staff + engineer on assigned client) |

**Serial rule:** if both `scannedSerialNumber` and `manualSerialNumber` are sent, **scanned wins**.

**Body:**

```json
{
  "clientId": "c1111111-1111-1111-1111-111111111111",
  "type": "KEYBOARD",
  "name": "Logitech K120",
  "scannedSerialNumber": "SCAN-999",
  "manualSerialNumber": "MANUAL-111",
  "purchaseDate": "2024-06-01",
  "status": "STOCK",
  "warrantyStatus": "UNDER_WARRANTY",
  "warrantyExpiryDate": "2030-01-01"
}
```

**Success `201`:**

```json
{
  "id": "o9999999-9999-9999-9999-999999999999",
  "clientId": "c1111111-1111-1111-1111-111111111111",
  "type": "KEYBOARD",
  "name": "Logitech K120",
  "serialNumber": "SCAN-999",
  "purchaseDate": "2024-06-01T00:00:00.000Z",
  "status": "STOCK",
  "attachedDeviceId": null,
  "warrantyStatus": "UNDER_WARRANTY",
  "effectiveWarrantyStatus": "UNDER_WARRANTY",
  "warrantyExpiryDate": "2030-01-01T00:00:00.000Z",
  "createdAt": "2026-08-20T15:50:00.000Z",
  "updatedAt": "2026-08-20T15:50:00.000Z"
}
```

If `warrantyExpiryDate` is in the past, `effectiveWarrantyStatus` becomes `"EXPIRED"` even when stored `warrantyStatus` is still `UNDER_WARRANTY`.

---

### `PATCH /api/v1/other-network-devices/:id/link`

**Body:**

```json
{ "attachedDeviceId": "d9999999-9999-9999-9999-999999999999" }
```

or `{ "attachedDeviceId": null }` to unlink.

**Success `200`:** OND object with `attachedDeviceId` set.

Then `GET /devices/:id` shows the OND inside `linkedOtherNetworkDevices`.

---

### `GET / PATCH / DELETE` OND

| Method | Path | Roles |
|--------|------|-------|
| GET | `/api/v1/other-network-devices` | view |
| GET | `/api/v1/other-network-devices/:id` | view |
| PATCH | `/api/v1/other-network-devices/:id` | edit |
| DELETE | `/api/v1/other-network-devices/:id` | delete (SUPER_ADMIN / DGN_IT_MANAGER) |

---

## 10. Audit logs

### `GET /api/v1/audit-logs`

| | |
|--|--|
| **Auth** | JWT |
| **Roles** | SUPER_ADMIN, DGN_IT_MANAGER |

**Query:** `?page=1&pageSize=50&entityType=Device&entityId=<uuid>&action=UPDATE`

**Success `200`:**

```json
{
  "items": [
    {
      "id": "au111111-1111-1111-1111-111111111111",
      "entityType": "Device",
      "entityId": "d9999999-9999-9999-9999-999999999999",
      "action": "UPDATE",
      "performedBy": "11111111-1111-1111-1111-111111111111",
      "before": {
        "cpu": "Intel Core i5-1345U",
        "ram": "16 GB",
        "storageUsedPercent": 12
      },
      "after": {
        "cpu": "Intel Core i7-1355U",
        "ram": "32 GB",
        "storageUsedPercent": 44,
        "fieldChanges": {
          "cpu": { "from": "Intel Core i5-1345U", "to": "Intel Core i7-1355U" },
          "ram": { "from": "16 GB", "to": "32 GB" },
          "storageUsedPercent": { "from": 12, "to": 44 }
        },
        "changedAt": "2026-08-20T15:25:00.000Z"
      },
      "createdAt": "2026-08-20T15:25:00.120Z"
    }
  ],
  "page": 1,
  "pageSize": 50,
  "total": 1
}
```

**This is the source of truth for “what changed and when”.** Every mutating API emits an AuditableEvent; Audit writes one row with full before/after and field-level diffs on UPDATE.

---

## 11. Notifications

### `GET /api/v1/notifications`

| | |
|--|--|
| **Roles** | SUPER_ADMIN, DGN_IT_MANAGER |

**Success `200`:**

```json
{
  "items": [
    {
      "id": "n1111111-1111-1111-1111-111111111111",
      "deviceId": "d9999999-9999-9999-9999-999999999999",
      "type": "DEVICE_ALLOTMENT",
      "recipients": ["priya.nair@client.local", "sameer.kapoor@client.local"],
      "status": "SENT",
      "sentAt": "2026-08-20T15:20:05.000Z",
      "createdAt": "2026-08-20T15:20:00.500Z"
    }
  ],
  "page": 1,
  "pageSize": 50,
  "total": 1
}
```

`type` enum: `DEVICE_ALLOTMENT` | `STORAGE_THRESHOLD` | `DISCARD_WARNING`  
`status`: `PENDING` | `SENT` | `FAILED`

Emails are **never** sent inside the HTTP request — only via BullMQ worker. If `SMTP_HOST` is empty, send is skipped (dry-run) and still marked SENT.

---

## 12. Error envelope (all APIs)

Every error uses:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Human readable explanation",
    "details": {}
  }
}
```

| HTTP | code |
|------|------|
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHORIZED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` |

---

## 13. Lifecycle / jobs (background)

Daily cron (03:00 UTC) via BullMQ queue `lifecycle-sweep`:

1. Find `DISCARDED` devices with `deletionDueAt <= now` → emit `device.deleted` (Audit) → hard-delete.
2. Find devices within **15 days** of deletion that have `discardWarningSentAt = null` → claim timestamp → emit `device.discard.warning` → email.

Idempotent: re-running the same day does not double-delete or double-notify.

---

## 14. Seed cheat-sheet

| Resource | Value |
|----------|-------|
| Password (all users) | `Password123!` |
| Agent API key | `seed-agent-delhi-key` |
| Sample asset tags | `DEL-LN-00101` … `BLR-LN-00305` (15 devices) |
| Clients | CRL Delhi, CRL Mumbai, CRL Bengaluru |
| Docs | `/docs` |
| Postman | `docs/postman/Inventory-Backend.postman_collection.json` |

---

## 15. Quick curl recipe (copy-paste)

```bash
# 1) Login
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"super.admin@inventory.local","password":"Password123!"}' \
  | jq -r .token)

# 2) List clients
curl -s http://localhost:4000/api/v1/clients -H "Authorization: Bearer $TOKEN" | jq

# 3) List devices
curl -s 'http://localhost:4000/api/v1/devices?pageSize=5' -H "Authorization: Bearer $TOKEN" | jq

# 4) Audit recent changes
curl -s 'http://localhost:4000/api/v1/audit-logs?pageSize=10' -H "Authorization: Bearer $TOKEN" | jq
```

You now have enough to **test every path**, **see real payloads**, and **verify that every change appears in audit with field-level detail**.
