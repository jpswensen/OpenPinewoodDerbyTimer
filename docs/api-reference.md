# PWDTimer API Reference

Base URL: `http://localhost:8000/api`

All endpoints use JSON request/response bodies unless otherwise noted. Timestamps are ISO 8601 UTC. Times from the timer hardware are in **microseconds** (μs).

## Table of Contents

- [Health Check](#health-check)
- [Groups](#groups)
- [Racers](#racers)
- [Import / Export](#import--export)
- [Races](#races)
- [Heats](#heats)
- [Connection](#connection)
- [Certificates](#certificates)
- [WebSocket](#websocket)

---

## Health Check

### `GET /api/health`

Returns server health status.

**Response** `200 OK`
```json
{ "status": "ok" }
```

---

## Groups

### `GET /api/groups`

List all groups.

**Response** `200 OK`
```json
[
  {
    "id": 1,
    "name": "Tiger Cubs",
    "description": "First-year scouts",
    "created_at": "2024-03-11T10:00:00Z",
    "updated_at": "2024-03-11T10:00:00Z"
  }
]
```

### `POST /api/groups`

Create a new group.

**Request Body**
```json
{
  "name": "Tiger Cubs",
  "description": "First-year scouts"
}
```

**Response** `201 Created`
```json
{
  "id": 1,
  "name": "Tiger Cubs",
  "description": "First-year scouts",
  "created_at": "2024-03-11T10:00:00Z",
  "updated_at": "2024-03-11T10:00:00Z"
}
```

### `PUT /api/groups/{group_id}`

Update a group.

**Request Body**
```json
{
  "name": "Wolf Den 3",
  "description": "Updated description"
}
```

**Response** `200 OK` — Returns the updated group object.

### `DELETE /api/groups/{group_id}`

Delete a group. Racers in this group are **not deleted** — their `group_id` is set to `null`.

**Response** `200 OK`
```json
{ "ok": true }
```

**Error** `404 Not Found` — Group does not exist.

---

## Racers

### `GET /api/racers`

List racers. Optionally filter by group.

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `group_id` | int | Filter to racers in this group |

**Response** `200 OK`
```json
[
  {
    "id": 1,
    "name": "John Smith",
    "car_name": "Lightning",
    "car_number": "42",
    "group_id": 1,
    "created_at": "2024-03-11T10:00:00Z",
    "updated_at": "2024-03-11T10:00:00Z"
  }
]
```

### `POST /api/racers`

Create a single racer.

**Request Body**
```json
{
  "name": "John Smith",
  "car_name": "Lightning",
  "car_number": "42",
  "group_id": 1
}
```

- `name` is **required** and must be non-empty.
- All other fields are optional.

**Response** `201 Created` — Returns the created racer object.

### `POST /api/racers/bulk`

Create multiple racers at once.

**Request Body**
```json
[
  { "name": "John Smith", "car_name": "Lightning", "group_id": 1 },
  { "name": "Jane Doe", "car_name": "Thunderbolt", "group_id": 2 }
]
```

**Response** `201 Created`
```json
{
  "created": 2,
  "racers": [ /* array of created racer objects */ ]
}
```

### `PUT /api/racers/{racer_id}`

Update a racer.

**Request Body** — Partial updates supported.
```json
{
  "name": "John Smith Jr.",
  "group_id": 2
}
```

**Response** `200 OK` — Returns the updated racer object.

### `DELETE /api/racers/{racer_id}`

Delete a racer.

**Response** `200 OK`
```json
{ "ok": true }
```

**Error** `404 Not Found` — Racer does not exist.

---

## Import / Export

### `POST /api/import/csv`

Import racers from a CSV file.

**Request** — `multipart/form-data` with a `file` field containing the CSV.

**Expected CSV Columns:**
| Column | Required | Description |
|--------|----------|-------------|
| `name` | Yes | Racer name |
| `car_name` | No | Car name |
| `car_number` | No | Car number |
| `group` or `group_name` | No | Group name (auto-created if it doesn't exist) |

**Response** `200 OK`
```json
{
  "imported": 15,
  "errors": [
    "Row 7: missing 'name' field"
  ]
}
```

### `GET /api/export/csv`

Export all racers as a CSV file download.

**Response** `200 OK` — `Content-Type: text/csv` with `Content-Disposition: attachment; filename=racers.csv`

```csv
name,car_name,car_number,group
John Smith,Lightning,42,Tiger Cubs
Jane Doe,Thunderbolt,17,Wolf
```

---

## Races

### `GET /api/races`

List all races.

**Response** `200 OK`
```json
[
  {
    "id": 1,
    "name": "Pack 123 Annual Derby",
    "num_lanes": 4,
    "status": "setup",
    "created_at": "2024-03-11T10:00:00Z"
  }
]
```

### `POST /api/races`

Create a new race.

**Request Body**
```json
{
  "name": "Pack 123 Annual Derby",
  "num_lanes": 4,
  "status": "setup"
}
```

- `num_lanes` must be between 1 and 8.
- `status` must be one of: `"setup"`, `"in_progress"`, `"completed"`. Defaults to `"setup"`.

**Response** `201 Created`

### `GET /api/races/{race_id}`

Get a single race.

**Response** `200 OK`

### `PUT /api/races/{race_id}`

Update a race.

**Request Body** — Partial updates supported.
```json
{
  "status": "in_progress"
}
```

**Response** `200 OK`

### `DELETE /api/races/{race_id}`

Delete a race and all its heats and results (cascade).

**Response** `200 OK`
```json
{ "ok": true }
```

### `GET /api/races/{race_id}/results`

Get computed race results (standings).

**Response** `200 OK`
```json
[
  {
    "id": 1,
    "race_id": 1,
    "racer_id": 3,
    "average_time": 1523400,
    "best_time": 1498200,
    "total_points": null,
    "overall_place": 1
  }
]
```

Times are in **microseconds**. Divide by 1,000,000 to get seconds.

### `POST /api/races/{race_id}/generate-heats`

Generate a round-robin heat schedule for the race.

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `group_id` | int | Only include racers from this group (optional) |

**Behavior:**
- Replaces any existing heats for this race.
- Uses all racers if `group_id` is not specified.
- Each racer appears exactly once in each lane across all heats.

**Response** `201 Created`
```json
{
  "heats_created": 8,
  "heats": [ /* array of heat objects with lane assignments */ ]
}
```

### `GET /api/races/{race_id}/heats`

List all heats for a race with lane assignments.

**Response** `200 OK`
```json
[
  {
    "id": 1,
    "race_id": 1,
    "heat_number": 1,
    "status": "completed",
    "scheduled_at": "2024-03-11T14:00:00Z",
    "completed_at": "2024-03-11T14:01:00Z",
    "lanes": [
      {
        "id": 1,
        "heat_id": 1,
        "lane_number": 1,
        "racer_id": 3,
        "time_microseconds": 1523400,
        "place": 2
      },
      {
        "id": 2,
        "heat_id": 1,
        "lane_number": 2,
        "racer_id": 7,
        "time_microseconds": 1498200,
        "place": 1
      }
    ]
  }
]
```

### `PUT /api/races/{race_id}/heats/reorder`

Reorder heats within a race.

**Request Body**
```json
{
  "heat_ids": [3, 1, 2, 4]
}
```

The `heat_number` field is updated to match the new order.

**Response** `200 OK`

### `GET /api/races/{race_id}/export/pdf`

Export race results as a PDF document.

**Query Parameters**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `group_id` | int | — | Filter results to a specific group |
| `page_size` | string | `"letter"` | Page size: `"letter"` or `"a4"` |
| `orientation` | string | `"portrait"` | Orientation: `"portrait"` or `"landscape"` |

**Response** `200 OK` — `Content-Type: application/pdf`

---

## Heats

### `PUT /api/heats/{heat_id}`

Update a heat's status and/or lane data.

**Request Body**
```json
{
  "status": "completed",
  "lanes": [
    { "lane_number": 1, "time_microseconds": 1523400, "racer_id": 3 },
    { "lane_number": 2, "time_microseconds": 1498200, "racer_id": 7 }
  ]
}
```

- `status` must be one of: `"pending"`, `"in_progress"`, `"completed"`.
- Setting status to `"completed"` triggers automatic place calculation and race results update.
- Lane `time_microseconds` and `racer_id` can be updated individually.

**Response** `200 OK` — Returns the updated heat with lanes.

### `POST /api/heats/{heat_id}/repeat`

Create a duplicate of this heat with the same lane assignments but `status = "pending"` and no times.

Useful for re-running a heat due to false starts or sensor issues.

**Response** `201 Created` — Returns the new heat object.

---

## Connection

### `GET /api/connection/serial-ports`

List available serial ports.

**Response** `200 OK`
```json
{
  "ports": [
    { "device": "/dev/cu.usbserial-0001", "description": "CP2102 USB to UART" },
    { "device": "/dev/cu.Bluetooth-Incoming-Port", "description": "n/a" }
  ]
}
```

### `GET /api/connection/discover-mdns`

Discover timer devices via mDNS and direct `pwdtimer.local` resolution.

**Response** `200 OK`
```json
{
  "services": [
    { "name": "pwdtimer", "host": "192.168.4.1", "port": 8080 }
  ]
}
```

### `POST /api/connection/connect`

Connect to the timer hardware.

**Request Body — Serial:**
```json
{
  "mode": "serial",
  "serial_port": "/dev/cu.usbserial-0001",
  "baudrate": 115200,
  "auto_reconnect": true
}
```

**Request Body — TCP:**
```json
{
  "mode": "tcp",
  "host": "192.168.4.1",
  "port": 8080,
  "auto_reconnect": true
}
```

**Response** `200 OK`
```json
{ "ok": true, "message": "Connected via serial to /dev/cu.usbserial-0001" }
```

**Error** `400 Bad Request` — Missing required fields or invalid mode.

### `POST /api/connection/disconnect`

Disconnect from the timer.

**Response** `200 OK`
```json
{ "ok": true }
```

### `GET /api/connection/status`

Get current connection status.

**Response** `200 OK`
```json
{
  "connection_state": "connected",
  "mode": "tcp",
  "target": "192.168.4.1:8080",
  "last_message_at": "2024-03-11T14:30:00Z",
  "last_error": null,
  "last_status": {
    "state": 1,
    "state_name": "RESET",
    "start_time_us": 0,
    "current_time_us": 0,
    "num_lanes": 4,
    "lane_end_times_us": [0, 0, 0, 0]
  }
}
```

### `POST /api/connection/arm`

Send the ARM command to the timer.

**Response** `200 OK`
```json
{ "ok": true }
```

### `POST /api/connection/reset`

Send the RESET command to the timer.

**Response** `200 OK`
```json
{ "ok": true }
```

### `POST /api/connection/set-lanes`

Set the number of active lanes on the timer.

**Request Body**
```json
{ "num_lanes": 4 }
```

- `num_lanes` must be between 1 and 8.

**Response** `200 OK`
```json
{ "ok": true }
```

---

## Certificates

### `GET /api/certificates/preview`

Preview a sample certificate.

**Query Parameters**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | string | `"winner"` | Certificate type: `"winner"` or `"participation"` |
| `place` | int | `1` | Place for winner certificates (1, 2, or 3) |

**Response** `200 OK` — `Content-Type: application/pdf`

### `POST /api/certificates/generate`

Generate certificates as a multi-page PDF (one certificate per page).

**Request Body**
```json
{
  "race_id": 1,
  "mode": "winners",
  "places": [1, 2, 3],
  "include_overall": true,
  "include_per_group": true,
  "group_id": null,
  "racer_ids": null,
  "event_name": "Pack 123 Pinewood Derby",
  "event_date": "2024-03-15",
  "issued_by": "Cubmaster Johnson",
  "custom_message": null,
  "page_size": "letter",
  "orientation": "landscape"
}
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `race_id` | int | Race to generate certificates for |
| `mode` | string | `"winners"`, `"participation"`, or `"custom"` |
| `places` | int[] | Which places to include (winners mode) |
| `include_overall` | bool | Include overall standings winners |
| `include_per_group` | bool | Include per-group winners |
| `group_id` | int? | Limit to a specific group |
| `racer_ids` | int[]? | Limit to specific racers |
| `event_name` | string? | Name printed on certificates |
| `event_date` | string? | Date printed on certificates |
| `issued_by` | string | Name of the issuing authority |
| `custom_message` | string? | Custom message (for custom mode) |
| `page_size` | string | `"letter"` or `"a4"` |
| `orientation` | string | `"portrait"` or `"landscape"` |

**Response** `200 OK` — `Content-Type: application/pdf`

---

## WebSocket

### `WebSocket /ws`

Real-time event stream for race updates, connection status, and timer data.

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | string | Authentication token (if `PWD_TIMER_WS_TOKEN` env var is set) |

**Connection:**
```javascript
const ws = new WebSocket('ws://localhost:8000/ws');
// or with auth:
const ws = new WebSocket('ws://localhost:8000/ws?token=mysecrettoken');
```

### Event Types

All messages are JSON objects with `type` and `payload` fields.

#### `connection_status`

Sent on initial connection and whenever the hardware connection state changes.

```json
{
  "type": "connection_status",
  "payload": {
    "connection_state": "connected",
    "mode": "tcp",
    "target": "192.168.4.1:8080",
    "last_message_at": "2024-03-11T14:30:00Z",
    "last_error": null,
    "last_status": {
      "state": 3,
      "state_name": "IN_RACE",
      "start_time_us": 1000000,
      "current_time_us": 2500000,
      "num_lanes": 4,
      "lane_end_times_us": [1500000, 0, 0, 1550000]
    }
  }
}
```

#### `race_state`

Sent when the timer state changes (e.g., RESET → SET → IN_RACE → FINISHED).

```json
{
  "type": "race_state",
  "payload": {
    "state": 3,
    "state_name": "IN_RACE",
    "start_time_us": 1000000,
    "current_time_us": 2500000,
    "num_lanes": 4
  }
}
```

**State values:**

| Code | Name | Description |
|------|------|-------------|
| 1 | `RESET` | Timer cleared, ready for setup |
| 2 | `SET` | Start gate closed, waiting for release |
| 3 | `IN_RACE` | Gate opened, timing in progress |
| 4 | `FINISHED` | All lanes have recorded finish times |

#### `lane_times`

Sent periodically during a race with current lane finish times and places.

```json
{
  "type": "lane_times",
  "payload": {
    "num_lanes": 4,
    "lane_end_times_us": [1500000, 1600000, 0, 1550000],
    "lane_places": { "1": 2, "2": 3, "4": 1 }
  }
}
```

- `lane_end_times_us[i]` is `0` or `null` if lane `i` hasn't finished yet.
- `lane_places` maps **lane number** (1-indexed) to place (1st, 2nd, etc.).

#### `heat_complete`

Sent once when all lanes have finished (timer state = FINISHED). De-duplicated per heat using `start_time_us`.

```json
{
  "type": "heat_complete",
  "payload": {
    "start_time_us": 1000000,
    "num_lanes": 4,
    "lane_end_times_us": [1500000, 1600000, 1550000, 1580000],
    "lane_places": { "1": 1, "2": 4, "3": 2, "4": 3 }
  }
}
```

#### `ping` / `pong`

Keepalive mechanism. Send a ping, receive a pong.

```json
// Send:
{ "type": "ping" }
// or just the text: "ping"

// Receive:
{ "type": "pong" }
// or: "pong"
```

### Client Example (TypeScript)

```typescript
const ws = new WebSocket('ws://localhost:8000/ws');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case 'connection_status':
      console.log('Connection:', msg.payload.connection_state);
      break;
    case 'race_state':
      console.log('State:', msg.payload.state_name);
      break;
    case 'lane_times':
      msg.payload.lane_end_times_us.forEach((time, i) => {
        if (time > 0) {
          const seconds = (time / 1_000_000).toFixed(4);
          const place = msg.payload.lane_places[String(i + 1)];
          console.log(`Lane ${i + 1}: ${seconds}s (${place}${ordinal(place)})`);
        }
      });
      break;
    case 'heat_complete':
      console.log('Heat finished!', msg.payload);
      break;
  }
};
```

---

## Error Responses

All error responses follow this format:

```json
{
  "detail": "Error message describing what went wrong"
}
```

**Common HTTP Status Codes:**

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad request (validation error) |
| `404` | Resource not found |
| `422` | Unprocessable entity (Pydantic validation) |
| `500` | Internal server error |

---

## Time Units

All times from the timer hardware and stored in the database are in **microseconds** (μs).

| Context | Unit | Example |
|---------|------|---------|
| API responses | microseconds (int) | `1523400` |
| Database storage | microseconds (int) | `1523400` |
| Frontend display | seconds (float, 4 dp) | `1.5234` |
| Timer protocol | microseconds (uint32) | `1523400` |

**Conversion:** `seconds = microseconds / 1,000,000`
