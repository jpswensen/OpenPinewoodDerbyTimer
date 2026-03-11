from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SerialPortInfo:
    device: str
    description: str | None = None
    hwid: str | None = None


def list_serial_ports() -> list[SerialPortInfo]:
    try:
        from serial.tools import list_ports
    except Exception:
        return []

    ports: list[SerialPortInfo] = []
    for p in list_ports.comports():
        ports.append(SerialPortInfo(device=str(p.device), description=getattr(p, "description", None), hwid=getattr(p, "hwid", None)))
    return ports


async def open_serial_connection(port: str, baudrate: int = 115200):
    """Open an asyncio serial connection.

    Requires `pyserial-asyncio` (imported as `serial_asyncio`).
    """

    import serial_asyncio  # type: ignore

    reader, writer = await serial_asyncio.open_serial_connection(url=port, baudrate=baudrate)
    return reader, writer
