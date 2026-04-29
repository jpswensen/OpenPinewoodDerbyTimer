# API Reference

Base URL: `http://localhost:8000/api`

The frontend uses these endpoints through `frontend/src/api/`. JSON is used unless noted.

## Health

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Server health check |

Response:

```json
{ "status": "ok" }
```

## Groups

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/groups` | List groups |
| `POST` | `/api/groups` | Create a group |
| `GET` | `/api/groups/{group_id}` | Get one group |
| `PUT` | `/api/groups/{group_id}` | Update a group |
| `DELETE` | `/api/groups/{group_id}` | Delete a group; racers remain but become ungrouped |

Create/update body:

```json
{ "name": "Tiger Cubs", "description": "Optional notes" }
```

## Racers

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/racers` | List racers; optional `group_id` query |
| `POST` | `/api/racers` | Create one racer |
| `POST` | `/api/racers/bulk` | Create multiple racers |
| `GET` | `/api/racers/{racer_id}` | Get one racer |
| `PUT` | `/api/racers/{racer_id}` | Update a racer |
| `DELETE` | `/api/racers/{racer_id}` | Delete a racer |

Racer body:

```json
{
  "name": "Ethan Martinez",
  "car_name": "Blue Blaze",
  "car_number": "101",
  "group_id": 1
}
```

## CSV import/export

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/import/csv` | Upload racer CSV as multipart `file` |
| `GET` | `/api/export/csv` | Download racers as CSV |
| `POST` | `/api/reset-all-data` | Delete groups, racers, races, heats, lanes, and results |

Supported CSV columns:

| Column | Required | Notes |
| --- | --- | --- |
| `name` or `Name` | Yes | Racer name |
| `car_name`, `Car Name`, or `car` | No | Car name |
| `car_number`, `Car Number`, or `number` | No | Car number |
| `group`, `group_name`, or `Group` | No | Group is auto-created |

Import response:

```json
{
  "groups_created": 5,
  "racers_created": 25,
  "errors": []
}
```

## Races and heats

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/races` | List races |
| `POST` | `/api/races` | Create race |
| `GET` | `/api/races/{race_id}` | Get race |
| `PUT` | `/api/races/{race_id}` | Update race |
| `DELETE` | `/api/races/{race_id}` | Delete race, heats, lanes, and results |
| `POST` | `/api/races/{race_id}/generate-heats` | Generate round-robin heats; optional `group_id` |
| `GET` | `/api/races/{race_id}/heats` | List heats |
| `PUT` | `/api/races/{race_id}/heats/reorder` | Reorder heats |
| `POST` | `/api/heats/{heat_id}/repeat` | Append duplicate heat for a rerun |
| `PUT` | `/api/heats/{heat_id}` | Update heat status, lane assignments, DNF, and times |
| `DELETE` | `/api/heats/{heat_id}` | Delete heat |
| `GET` | `/api/races/{race_id}/results` | Calculate/list race results |
| `GET` | `/api/races/{race_id}/results/pdf` | Download results PDF |

Create race body:

```json
{ "name": "Pack Derby 2026", "num_lanes": 4, "status": "setup" }
```

Reorder body:

```json
{ "heat_ids": [3, 1, 2] }
```

Heat update body supports partial updates:

```json
{
  "status": "completed",
  "lanes": [
    { "lane_number": 1, "racer_id": 10, "time_microseconds": 2345123, "dnf": false },
    { "lane_number": 2, "racer_id": 11, "dnf": true }
  ]
}
```

## Timer connection

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/connection/status` | Current connection status and last timer status |
| `GET` | `/api/connection/serial-ports` | List available serial ports |
| `POST` | `/api/connection/connect` | Connect by serial, TCP, or UDP |
| `POST` | `/api/connection/disconnect` | Disconnect timer |
| `POST` | `/api/connection/arm` | Send `ARM` |
| `POST` | `/api/connection/reset` | Send `RESET` |
| `POST` | `/api/connection/set-lanes` | Send `SET_LANES:n` |
| `GET` | `/api/connection/discover-mdns` | mDNS helper retained for network-capable variants |
| `GET` | `/api/connection/serial-monitor` | Get serial monitor setting |
| `POST` | `/api/connection/serial-monitor` | Toggle serial monitor events |

Serial connect:

```json
{
  "mode": "serial",
  "serial_port": "/dev/cu.usbserial-0001",
  "baudrate": 115200,
  "auto_reconnect": true
}
```

UDP connect:

```json
{
  "mode": "udp",
  "udp_host": "192.168.4.1",
  "udp_cmd_port": 9100,
  "udp_status_port": 9101,
  "auto_reconnect": true
}
```

Set lanes:

```json
{ "num_lanes": 4 }
```

## Certificates

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/certificates/preview` | Generate preview PDF; query `type=winner|participation`, `place=1` |
| `POST` | `/api/certificates/generate` | Generate certificate PDF |

Certificate requests are driven by the UI in `CertificatesPage.tsx` and include race, group/racer selection, certificate type, event name, date, and issuer text.

## WebSocket

Path: `/ws`

If `PWD_TIMER_WS_TOKEN` is set on the backend, clients must connect with `?token=...`.

Server-to-client JSON messages:

| Type | Payload |
| --- | --- |
| `connection_status` | Connection state, mode, target, error, and last timer status |
| `race_state` | Timer state, start/current times, active lane count, gate state |
| `lane_times` | Race-relative lane times and lane places |
| `heat_complete` | Final lane times when firmware reaches `FINISHED` |
| `serial_data` | Optional serial monitor TX/RX line |

Client pings:

```json
{ "type": "ping" }
```

Server response:

```json
{ "type": "pong" }
```
