# Code Citations

## License: MIT
https://github.com/cybrnode/zkt-sdk-rest-api/blob/79aca088965cf2e29845bbd1f16d56a03b76cf6d/main.spec

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/marcusbfs/msanalyzer/blob/5a633716807a8ffe44c7651cf70de8fea10a1532/scripts/make_server_dist.py

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/cybrnode/zkt-sdk-rest-api/blob/79aca088965cf2e29845bbd1f16d56a03b76cf6d/main.spec

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/marcusbfs/msanalyzer/blob/5a633716807a8ffe44c7651cf70de8fea10a1532/scripts/make_server_dist.py

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/cybrnode/zkt-sdk-rest-api/blob/79aca088965cf2e29845bbd1f16d56a03b76cf6d/main.spec

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/marcusbfs/msanalyzer/blob/5a633716807a8ffe44c7651cf70de8fea10a1532/scripts/make_server_dist.py

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/cybrnode/zkt-sdk-rest-api/blob/79aca088965cf2e29845bbd1f16d56a03b76cf6d/main.spec

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/marcusbfs/msanalyzer/blob/5a633716807a8ffe44c7651cf70de8fea10a1532/scripts/make_server_dist.py

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/cybrnode/zkt-sdk-rest-api/blob/79aca088965cf2e29845bbd1f16d56a03b76cf6d/main.spec

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/marcusbfs/msanalyzer/blob/5a633716807a8ffe44c7651cf70de8fea10a1532/scripts/make_server_dist.py

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/cybrnode/zkt-sdk-rest-api/blob/79aca088965cf2e29845bbd1f16d56a03b76cf6d/main.spec

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/marcusbfs/msanalyzer/blob/5a633716807a8ffe44c7651cf70de8fea10a1532/scripts/make_server_dist.py

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/cybrnode/zkt-sdk-rest-api/blob/79aca088965cf2e29845bbd1f16d56a03b76cf6d/main.spec

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/marcusbfs/msanalyzer/blob/5a633716807a8ffe44c7651cf70de8fea10a1532/scripts/make_server_dist.py

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/cybrnode/zkt-sdk-rest-api/blob/79aca088965cf2e29845bbd1f16d56a03b76cf6d/main.spec

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/marcusbfs/msanalyzer/blob/5a633716807a8ffe44c7651cf70de8fea10a1532/scripts/make_server_dist.py

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/cybrnode/zkt-sdk-rest-api/blob/79aca088965cf2e29845bbd1f16d56a03b76cf6d/main.spec

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/marcusbfs/msanalyzer/blob/5a633716807a8ffe44c7651cf70de8fea10a1532/scripts/make_server_dist.py

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/cybrnode/zkt-sdk-rest-api/blob/79aca088965cf2e29845bbd1f16d56a03b76cf6d/main.spec

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/marcusbfs/msanalyzer/blob/5a633716807a8ffe44c7651cf70de8fea10a1532/scripts/make_server_dist.py

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/cybrnode/zkt-sdk-rest-api/blob/79aca088965cf2e29845bbd1f16d56a03b76cf6d/main.spec

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/marcusbfs/msanalyzer/blob/5a633716807a8ffe44c7651cf70de8fea10a1532/scripts/make_server_dist.py

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/cybrnode/zkt-sdk-rest-api/blob/79aca088965cf2e29845bbd1f16d56a03b76cf6d/main.spec

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/marcusbfs/msanalyzer/blob/5a633716807a8ffe44c7651cf70de8fea10a1532/scripts/make_server_dist.py

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/cybrnode/zkt-sdk-rest-api/blob/79aca088965cf2e29845bbd1f16d56a03b76cf6d/main.spec

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/marcusbfs/msanalyzer/blob/5a633716807a8ffe44c7651cf70de8fea10a1532/scripts/make_server_dist.py

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/cybrnode/zkt-sdk-rest-api/blob/79aca088965cf2e29845bbd1f16d56a03b76cf6d/main.spec

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/marcusbfs/msanalyzer/blob/5a633716807a8ffe44c7651cf70de8fea10a1532/scripts/make_server_dist.py

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/marcusbfs/msanalyzer/blob/5a633716807a8ffe44c7651cf70de8fea10a1532/scripts/make_server_dist.py

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/cybrnode/zkt-sdk-rest-api/blob/79aca088965cf2e29845bbd1f16d56a03b76cf6d/main.spec

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.li
```


## License: MIT
https://github.com/marcusbfs/msanalyzer/blob/5a633716807a8ffe44c7651cf70de8fea10a1532/scripts/make_server_dist.py

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvic
```


## License: MIT
https://github.com/cybrnode/zkt-sdk-rest-api/blob/79aca088965cf2e29845bbd1f16d56a03b76cf6d/main.spec

```
Good, now I have the full picture. Here's the answer:

---

Yes, absolutely. **PyInstaller** is the standard tool for this and works well with FastAPI + SQLite. Your project is already set up for it — the backend already serves the built frontend when `PWD_TIMER_STATIC_DIR` is set.

### Strategy

1. `vite build` → static files in `frontend/dist/`
2. PyInstaller bundles the Python backend + all dependencies + the frontend dist into one executable
3. SQLite DB is created at runtime by `init_db()` — nothing to bundle

### What you'd need to change

**1. A small wrapper script** (e.g., `PWDTimer/backend/run.py`) that starts uvicorn and sets the static dir automatically:

```python
import os
import sys
from pathlib import Path

import uvicorn


def _resource_path() -> Path:
    """Resolve the base path for bundled resources (PyInstaller or dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # PyInstaller temp dir
    return Path(__file__).resolve().parent


def main() -> None:
    base = _resource_path()
    static_dir = base / "frontend_dist"
    if static_dir.is_dir():
        os.environ["PWD_TIMER_STATIC_DIR"] = str(static_dir)

    host = os.environ.get("PWD_TIMER_HOST", "0.0.0.0")
    port = int(os.environ.get("PWD_TIMER_PORT", "8000"))

    uvicorn.run("app.main:app", host=host, port=port, workers=1)


if __name__ == "__main__":
    main()
```

**2. A PyInstaller spec file** (e.g., `PWDTimer/pwdtimer.spec`):

```python
# pwdtimer.spec
import os

block_cipher = None
backend_dir = os.path.join(os.path.dirname(SPECPATH), "backend")
frontend_dist = os.path.join(os.path.dirname(SPECPATH), "frontend", "dist")

a = Analysis(
    [os.path.join(backend_dir, "run.py")],
    pathex=[backend_dir],
    datas=[
        (os.path.join(backend_dir, "app"), "app"),
        (frontend_dist, "frontend_dist"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvic
```

