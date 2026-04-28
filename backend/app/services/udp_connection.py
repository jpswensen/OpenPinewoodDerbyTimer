"""UDP transport for ConnectionManager.

Provides an asyncio reader/writer pair that mimics the shape used by the
serial and TCP paths, so :class:`ConnectionManager` can drive UDP without
special-casing.

Design choices
--------------
* The firmware binds UDP/9100 for inbound commands and broadcasts status
  frames to 255.255.255.255:9101.  The backend therefore:

  - Sends commands to (``host``, 9100) where ``host`` defaults to the
    well-known SoftAP address ``192.168.4.1``.  Sending directly avoids the
    per-OS quirks of cross-subnet broadcast TX.
  - Receives status frames by binding ``0.0.0.0:9101`` with ``SO_BROADCAST``
    enabled.  This works whether the firmware addresses the directed
    broadcast (192.168.4.255) or the limited broadcast (255.255.255.255).

* UDP is connectionless, so "connection state" is really just whether the
  socket is open.  Auto-reconnect is meaningless here, but we let
  :class:`ConnectionManager` retain its uniform handling: when no datagrams
  arrive for a long stretch the existing read loop keeps waiting; an OS-level
  socket error is the only thing that surfaces as a disconnect.
"""

from __future__ import annotations

import asyncio
import socket
from typing import Tuple


class _UdpReader:
    """Mimics ``asyncio.StreamReader.read`` over a datagram queue."""

    def __init__(self) -> None:
        self._queue: asyncio.Queue[bytes] = asyncio.Queue()
        self._closed = asyncio.Event()
        self._buffer = b""

    def feed(self, data: bytes) -> None:
        if data:
            self._queue.put_nowait(data)

    def close(self) -> None:
        self._closed.set()
        # Wake any pending read so it returns b"" (EOF) and the read loop
        # treats it as a disconnect.
        self._queue.put_nowait(b"")

    async def read(self, n: int = -1) -> bytes:
        if self._buffer:
            chunk, self._buffer = self._buffer, b""
            return chunk if n < 0 else chunk[:n]

        chunk = await self._queue.get()
        if not chunk:
            return b""  # closed

        if n < 0 or len(chunk) <= n:
            return chunk
        self._buffer = chunk[n:]
        return chunk[:n]


class _UdpWriter:
    """Minimal subset of ``asyncio.StreamWriter`` used by ConnectionManager."""

    def __init__(self, transport: asyncio.DatagramTransport, dest: Tuple[str, int]) -> None:
        self._transport = transport
        self._dest = dest

    def write(self, data: bytes) -> None:
        self._transport.sendto(data, self._dest)

    async def drain(self) -> None:  # pragma: no cover - UDP has no flow control
        return

    def close(self) -> None:
        try:
            self._transport.close()
        except Exception:
            pass

    async def wait_closed(self) -> None:  # pragma: no cover
        return


class _UdpProtocol(asyncio.DatagramProtocol):
    def __init__(self, reader: _UdpReader) -> None:
        self._reader = reader

    def datagram_received(self, data: bytes, addr) -> None:  # noqa: ANN001
        self._reader.feed(data)

    def error_received(self, exc: Exception) -> None:  # noqa: D401, ANN001
        # Surface as EOF so ConnectionManager can reconnect / report.
        self._reader.close()

    def connection_lost(self, exc: Exception | None) -> None:  # noqa: ANN001
        self._reader.close()


async def open_udp_connection(
    host: str,
    *,
    cmd_port: int = 9100,
    status_port: int = 9101,
):
    """Bind the broadcast-receive socket and prepare the command-send socket.

    Returns a ``(reader, writer)`` pair. ``host`` is the unicast destination
    used for outbound commands (typically ``192.168.4.1`` — the SoftAP IP).
    """

    loop = asyncio.get_running_loop()
    reader = _UdpReader()

    # RX endpoint: bind to status_port on all interfaces, allow broadcast.
    rx_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    rx_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    rx_sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    rx_sock.bind(("0.0.0.0", status_port))
    rx_sock.setblocking(False)
    rx_transport, _ = await loop.create_datagram_endpoint(
        lambda: _UdpProtocol(reader), sock=rx_sock
    )

    # TX endpoint: ephemeral local port, sends unicast to (host, cmd_port).
    try:
        tx_transport, _ = await loop.create_datagram_endpoint(
            lambda: asyncio.DatagramProtocol(),
            local_addr=("0.0.0.0", 0),
            allow_broadcast=True,
        )
    except Exception:
        rx_transport.close()
        raise

    writer = _UdpWriter(tx_transport, (host, cmd_port))

    # Combine both transports under one closer so ConnectionManager.close
    # tears them down together.
    original_close = writer.close

    def close_both() -> None:
        try:
            rx_transport.close()
        finally:
            original_close()

    writer.close = close_both  # type: ignore[assignment]

    return reader, writer
