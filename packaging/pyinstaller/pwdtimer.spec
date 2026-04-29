# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for PWDTimer standalone desktop application.

Usage:
    cd PWDTimer
    pyinstaller packaging/pyinstaller/pwdtimer.spec

This bundles the FastAPI backend, the built React frontend, and a native
pywebview chromeless window into a single executable.
"""

import platform
from pathlib import Path

block_cipher = None

# PyInstaller executes spec files without defining __file__; SPECPATH is the
# spec directory it provides at build time. Keep a fallback for direct execution
# by Python tooling.
if "SPECPATH" in globals():
    spec_dir = Path(SPECPATH).resolve()
else:
    spec_dir = Path(__file__).resolve().parent
project_root = spec_dir.parents[1]
backend_dir = project_root / "backend"
frontend_dist = project_root / "frontend" / "dist"
icon_dir = project_root / "packaging" / "icons"
app_icon = (
    icon_dir / "pwdtimer.icns"
    if platform.system() == "Darwin"
    else icon_dir / "pwdtimer.ico"
    if platform.system() == "Windows"
    else icon_dir / "pwdtimer.png"
)

# Collect the entire app package
app_tree = Tree(str(backend_dir / "app"), prefix="app")

# Collect the built frontend
frontend_tree = Tree(str(frontend_dist), prefix="frontend_dist")

# Hidden imports that PyInstaller cannot detect automatically
hidden_imports = [
    # Uvicorn internals
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    # SQLAlchemy dialects
    "sqlalchemy.dialects.sqlite",
    "aiosqlite",
    # App modules
    "app.main",
    "app.models",
    "app.models.database",
    "app.models.models",
    "app.models.schemas",
    "app.models.init_db",
    "app.routers",
    "app.routers.certificates",
    "app.routers.connection",
    "app.routers.groups",
    "app.routers.import_export",
    "app.routers.racers",
    "app.routers.races",
    "app.routers.websocket",
    "app.services",
    "app.services.certificate_generator",
    "app.services.connection_manager",
    "app.services.event_bus",
    "app.services.heat_scheduler",
    "app.services.mdns_discovery",
    "app.services.pdf_generator",
    "app.services.race_results",
    "app.services.serial_connection",
    "app.services.tcp_connection",
    "app.services.timer_protocol",
    # Pydantic
    "pydantic",
    "pydantic_core",
    # Async support
    "anyio",
    "anyio._backends",
    "anyio._backends._asyncio",
    # Serial
    "serial",
    "serial.tools",
    "serial.tools.list_ports",
    # ReportLab
    "reportlab",
    "reportlab.lib",
    "reportlab.platypus",
    # Multipart
    "multipart",
    # pywebview backends (include all; unused ones are harmless)
    "webview",
]

# Platform-specific pywebview backends
if platform.system() == "Darwin":
    hidden_imports += [
        "webview.platforms.cocoa",
        "objc",
        "Foundation",
        "WebKit",
        "AppKit",
    ]
elif platform.system() == "Windows":
    hidden_imports += [
        "webview.platforms.edgechromium",
        "webview.platforms.winforms",
        "clr",
        "pythonnet",
    ]
else:
    hidden_imports += [
        "webview.platforms.gtk",
        "gi",
        "gi.repository",
    ]

a = Analysis(
    [str(backend_dir / "run.py")],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=[],
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "weasyprint",    # system-lib heavy, not needed for packaged app
        "tkinter",
        "matplotlib",
        "scipy",
        "numpy",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    app_tree,
    frontend_tree,
    [],
    name="PWDTimer",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # No console window on Windows/macOS
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(app_icon) if app_icon.is_file() else None,
)

# macOS: wrap into a .app bundle
if platform.system() == "Darwin":
    app = BUNDLE(
        exe,
        name="PWDTimer.app",
        icon=str(app_icon) if app_icon.is_file() else None,
        bundle_identifier="org.openpinewoodderbytimer.pwdtimer",
        info_plist={
            "CFBundleDisplayName": "PWDTimer",
            "CFBundleShortVersionString": "1.0.0",
            "CFBundleName": "PWDTimer",
            "NSHighResolutionCapable": True,
            "LSMinimumSystemVersion": "10.15",
        },
    )
