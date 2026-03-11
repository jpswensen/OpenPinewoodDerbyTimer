from __future__ import annotations

import socket
import time
from dataclasses import dataclass


@dataclass(frozen=True)
class MdnsService:
    name: str
    host: str | None
    port: int | None
    addresses: list[str]


def resolve_hostname(hostname: str) -> list[str]:
    """Resolve a hostname using the OS resolver (works for mDNS on most systems)."""

    try:
        infos = socket.getaddrinfo(hostname, None)
    except Exception:
        return []

    addrs: list[str] = []
    for info in infos:
        sockaddr = info[4]
        if isinstance(sockaddr, tuple) and sockaddr:
            ip = sockaddr[0]
            if ip not in addrs:
                addrs.append(ip)
    return addrs


def discover_services(
    service_types: list[str] | None = None,
    timeout_seconds: float = 1.5,
) -> list[MdnsService]:
    """Discover timer services via mDNS.

    We primarily look for a custom `_pwdtimer._tcp.local.` service. If firmware doesn't
    advertise a service type but does set a hostname (`pwdtimer.local`), callers can
    use `resolve_hostname`.

    This function returns an empty list if `zeroconf` is unavailable.
    """

    if service_types is None:
        service_types = ["_pwdtimer._tcp.local."]

    try:
        from zeroconf import ServiceBrowser, ServiceStateChange, Zeroconf
    except Exception:
        return []

    found: dict[str, MdnsService] = {}

    class _Listener:
        def remove_service(self, zc, service_type, name):
            return

        def add_service(self, zc, service_type, name):
            info = zc.get_service_info(service_type, name)
            if not info:
                return
            addresses: list[str] = []
            for addr in info.addresses:
                try:
                    ip = socket.inet_ntoa(addr)
                    if ip not in addresses:
                        addresses.append(ip)
                except Exception:
                    continue
            host = info.server.rstrip(".") if getattr(info, "server", None) else None
            port = int(info.port) if getattr(info, "port", None) else None
            found[name] = MdnsService(name=name, host=host, port=port, addresses=addresses)

        def update_service(self, zc, service_type, name):
            self.add_service(zc, service_type, name)

    zc = Zeroconf()
    try:
        listener = _Listener()
        for st in service_types:
            ServiceBrowser(zc, st, listener)
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            time.sleep(0.05)
    finally:
        zc.close()

    return list(found.values())
