from __future__ import annotations

import json
import os

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.event_bus import event_bus

router = APIRouter(tags=["websocket"])


def _timer_status_payload(status) -> dict:
    return {
        "state": status.state,
        "state_name": status.state_name,
        "start_time_us": status.start_time_us,
        "current_time_us": status.current_time_us,
        "num_lanes": status.num_lanes,
    }


def _lane_times_payload(status) -> dict:
    lane_end_times_us = status.lane_end_times_us
    finished = [(idx + 1, t) for idx, t in enumerate(lane_end_times_us) if t is not None and t > 0]
    finished.sort(key=lambda x: (x[1], x[0]))
    lane_places = {lane: place for place, (lane, _t) in enumerate(finished, start=1)}

    return {
        "num_lanes": status.num_lanes,
        "lane_end_times_us": lane_end_times_us,
        "lane_places": lane_places,
    }


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    required_token = os.getenv("PWD_TIMER_WS_TOKEN")
    if required_token:
        token = websocket.query_params.get("token")
        if token != required_token:
            await websocket.close(code=1008)
            return

    await websocket.accept()
    await event_bus.register(websocket)

    mgr = getattr(websocket.app.state, "connection_manager", None)
    if mgr is not None:
        status = mgr.get_status()
        await websocket.send_json({"type": "connection_status", "payload": status.to_dict()})
        if status.last_status is not None:
            await websocket.send_json(
                {"type": "race_state", "payload": _timer_status_payload(status.last_status)}
            )
            await websocket.send_json(
                {"type": "lane_times", "payload": _lane_times_payload(status.last_status)}
            )

    try:
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
                continue

            try:
                data = json.loads(msg)
            except json.JSONDecodeError:
                continue

            if isinstance(data, dict) and data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        await event_bus.unregister(websocket)
