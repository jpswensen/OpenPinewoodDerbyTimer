from __future__ import annotations

import asyncio

from .database import init_db


def main() -> None:
    asyncio.run(init_db())


if __name__ == "__main__":
    main()
