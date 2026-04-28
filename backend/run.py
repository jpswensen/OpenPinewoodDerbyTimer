"""
PWDTimer Desktop Launcher

Starts the FastAPI backend in a background thread and opens a native
chromeless window via pywebview. Closing the window stops the server.

Usage:
    python run.py              # GUI mode (default)
    python run.py --headless   # Server-only, no window (useful for debugging)
"""

import argparse
import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn


_ZOOM_JS = """
(function () {
    if (window.__pwdZoomInstalled) return;
    window.__pwdZoomInstalled = true;

    var ZOOM_KEY = 'pwdtimer_zoom';
    var MIN_ZOOM = 0.5;
    var MAX_ZOOM = 3.0;
    var STEP = 0.1;

    function applyZoom(z) {
        z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));
        document.documentElement.style.zoom = z;
        try { localStorage.setItem(ZOOM_KEY, z); } catch(e) {}
        return z;
    }

    // Restore saved zoom level across sessions
    try {
        var saved = parseFloat(localStorage.getItem(ZOOM_KEY));
        if (!isNaN(saved)) applyZoom(saved);
    } catch(e) {}

    document.addEventListener('keydown', function (e) {
        if (!e.metaKey && !e.ctrlKey) return;
        var current = parseFloat(document.documentElement.style.zoom || '1');
        if (isNaN(current)) current = 1;
        if (e.key === '=' || e.key === '+') {
            e.preventDefault();
            applyZoom(current + STEP);
        } else if (e.key === '-') {
            e.preventDefault();
            applyZoom(current - STEP);
        } else if (e.key === '0') {
            e.preventDefault();
            applyZoom(1);
        }
    }, true);
})();
"""


class _WebViewApi:
    """Exposed to JavaScript as window.pywebview.api."""

    def __init__(self, window_ref: list):
        self._window_ref = window_ref

    def pick_file(self, title: str = "Choose a file", file_types: str = "CSV files (*.csv);;All files (*.*)") -> dict | None:
        """Open a native file dialog and return the file contents + name."""
        import webview

        win = self._window_ref[0]
        if win is None:
            return None
        result = win.create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=False,
            file_types=(file_types,) if file_types else (),
        )
        if not result:
            return None
        filepath = result[0] if isinstance(result, (list, tuple)) else result
        filepath = str(filepath)
        try:
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                contents = f.read()
        except OSError:
            return None
        return {
            "name": os.path.basename(filepath),
            "contents": contents,
        }


def _resource_path() -> Path:
    """Base path for bundled resources (PyInstaller) or dev layout."""
    if getattr(sys, "frozen", False):
        # PyInstaller extracts data files into a temp directory
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent


def _find_free_port() -> int:
    """Bind to port 0 and let the OS pick an available port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait_for_server(host: str, port: int, timeout: float = 15.0) -> bool:
    """Block until the server is accepting connections."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.15)
    return False


def _resolve_static_dir(base: Path) -> Path | None:
    """Locate the built frontend static files."""
    # PyInstaller bundle: frontend_dist is embedded alongside the app
    bundled = base / "frontend_dist"
    if bundled.is_dir() and (bundled / "index.html").is_file():
        return bundled

    # Dev layout: frontend/dist is a sibling of the backend directory
    dev = base.parent / "frontend" / "dist"
    if dev.is_dir() and (dev / "index.html").is_file():
        return dev

    return None


def _start_server(host: str, port: int) -> uvicorn.Server:
    """Create and start a uvicorn server in a daemon thread."""
    config = uvicorn.Config(
        "app.main:app",
        host=host,
        port=port,
        log_level="info",
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True, name="uvicorn")
    thread.start()
    return server


def main() -> None:
    parser = argparse.ArgumentParser(description="PWDTimer Desktop Launcher")
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Start the server without opening a GUI window",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=0,
        help="Port to run on (0 = auto-detect a free port)",
    )
    args = parser.parse_args()

    base = _resource_path()

    # Point FastAPI at the built frontend
    static_dir = _resolve_static_dir(base)
    if static_dir:
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)
    else:
        print(
            "WARNING: Built frontend not found. API-only mode. "
            "Run 'npm run build' in the frontend/ directory first.",
            file=sys.stderr,
        )

    host = "127.0.0.1"
    port = args.port if args.port else _find_free_port()
    url = f"http://{host}:{port}"

    print(f"Starting PWDTimer server on {url} ...")
    server = _start_server(host, port)

    if not _wait_for_server(host, port):
        print("ERROR: Server failed to start within timeout.", file=sys.stderr)
        sys.exit(1)

    print(f"Server ready at {url}")

    if args.headless:
        # Headless: open in default browser and block until Ctrl-C
        webbrowser.open(url)
        print("Running in headless mode. Press Ctrl-C to stop.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
    else:
        # GUI mode: open a native chromeless window via pywebview
        try:
            import webview
        except ImportError:
            print(
                "pywebview is not installed. Install it with:\n"
                "  pip install pywebview\n\n"
                "Falling back to default browser...",
                file=sys.stderr,
            )
            webbrowser.open(url)
            print("Running in browser mode. Press Ctrl-C to stop.")
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                pass
        else:
            window_ref: list = [None]
            api = _WebViewApi(window_ref)
            window = webview.create_window(
                "Sunnyside PWD Timer",
                url,
                js_api=api,
                width=1280,
                height=860,
                min_size=(900, 600),
            )
            window_ref[0] = window
            window.events.loaded += lambda: window.evaluate_js(_ZOOM_JS)
            webview.start()  # blocks until window is closed

    # Graceful shutdown
    print("Shutting down server...")
    server.should_exit = True
    time.sleep(1)


if __name__ == "__main__":
    main()
