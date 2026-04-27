from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.services.connection_manager import ConnectionManager
from app.services.mdns_discovery import discover_services, resolve_hostname

router = APIRouter(prefix="/api/connection", tags=["connection"])


def _manager(request: Request) -> ConnectionManager:
    mgr = getattr(request.app.state, "connection_manager", None)
    if mgr is None:
        raise HTTPException(status_code=500, detail="connection manager not initialized")
    return mgr


@router.get("/serial-ports")
async def list_serial_ports(request: Request) -> list[dict]:
    ports = _manager(request).list_serial_ports()
    return [
        {"device": p.device, "description": p.description, "hwid": p.hwid}
        for p in ports
    ]


@router.get("/discover-mdns")
async def discover_mdns(timeout_seconds: float = 1.5) -> dict:
    services = await asyncio.to_thread(discover_services, timeout_seconds=timeout_seconds)
    pwdtimer_local_addresses = await asyncio.to_thread(resolve_hostname, "pwdtimer.local")
    return {
        "services": [
            {
                "name": s.name,
                "host": s.host,
                "port": s.port,
                "addresses": s.addresses,
            }
            for s in services
        ],
        "pwdtimer_local_addresses": pwdtimer_local_addresses,
    }


class ConnectRequest(BaseModel):
    mode: str  # serial|tcp
    serial_port: str | None = None
    baudrate: int = 115200
    host: str | None = None
    port: int = 8080
    auto_reconnect: bool = True


@router.post("/connect")
async def connect(payload: ConnectRequest, request: Request) -> dict:
    mgr = _manager(request)

    if payload.mode == "serial":
        if not payload.serial_port:
            raise HTTPException(status_code=400, detail="serial_port is required for serial mode")
        await mgr.connect_serial(
            port=payload.serial_port, baudrate=payload.baudrate, auto_reconnect=payload.auto_reconnect
        )
        return mgr.get_status().to_dict()

    if payload.mode == "tcp":
        if not payload.host:
            raise HTTPException(status_code=400, detail="host is required for tcp mode")
        await mgr.connect_tcp(host=payload.host, port=payload.port, auto_reconnect=payload.auto_reconnect)
        return mgr.get_status().to_dict()

    raise HTTPException(status_code=400, detail="mode must be 'serial' or 'tcp'")


@router.post("/disconnect")
async def disconnect(request: Request) -> dict:
    mgr = _manager(request)
    await mgr.disconnect()
    return mgr.get_status().to_dict()


@router.get("/status")
async def status(request: Request) -> dict:
    return _manager(request).get_status().to_dict()


@router.post("/arm")
async def arm(request: Request) -> dict:
    mgr = _manager(request)
    try:
        since = mgr.get_status().last_message_at
        await mgr.send_arm()
        await mgr.wait_for_fresh_status(since)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return mgr.get_status().to_dict()


@router.post("/reset")
async def reset(request: Request) -> dict:
    mgr = _manager(request)
    try:
        since = mgr.get_status().last_message_at
        await mgr.send_reset()
        await mgr.wait_for_fresh_status(since)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return mgr.get_status().to_dict()


class SetLanesRequest(BaseModel):
    num_lanes: int


@router.post("/set-lanes")
async def set_lanes(payload: SetLanesRequest, request: Request) -> dict:
    mgr = _manager(request)
    try:
        since = mgr.get_status().last_message_at
        await mgr.send_set_lanes(payload.num_lanes)
        await mgr.wait_for_fresh_status(since)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return mgr.get_status().to_dict()


@router.post("/serial-monitor")
async def toggle_serial_monitor(request: Request) -> dict:
    mgr = _manager(request)
    mgr._serial_monitor_enabled = not mgr._serial_monitor_enabled
    return {"enabled": mgr._serial_monitor_enabled}


@router.get("/serial-monitor")
async def serial_monitor_status(request: Request) -> dict:
    mgr = _manager(request)
    return {"enabled": mgr._serial_monitor_enabled}
