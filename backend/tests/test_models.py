from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from sqlalchemy import select

from app.models.database import init_db, make_engine, make_sessionmaker
from app.models.models import Group, Heat, HeatLane, Race, Racer


class TestModels(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        db_path = Path(self._tmpdir.name) / "test.db"
        self.engine = make_engine(f"sqlite+aiosqlite:///{db_path}")
        await init_db(self.engine)
        self.Session = make_sessionmaker(self.engine)

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()
        self._tmpdir.cleanup()

    async def test_create_group_and_racer(self) -> None:
        async with self.Session() as session:
            g = Group(name="Tigers", description="Pack")
            r = Racer(name="Alice", car_name="Lightning", car_number="7", group=g)
            session.add_all([g, r])
            await session.commit()

        async with self.Session() as session:
            res = await session.execute(select(Group).where(Group.name == "Tigers"))
            g2 = res.scalar_one()
            self.assertEqual(g2.name, "Tigers")

            res = await session.execute(select(Racer).where(Racer.group_id == g2.id))
            racers = res.scalars().all()
            self.assertEqual(len(racers), 1)
            self.assertEqual(racers[0].name, "Alice")

    async def test_create_race_heat_and_lanes(self) -> None:
        async with self.Session() as session:
            g = Group(name="Wolves")
            r1 = Racer(name="Bob", group=g)
            r2 = Racer(name="Cara", group=g)
            race = Race(name="Pack Finals", num_lanes=2)
            heat1 = Heat(race=race, heat_number=1)
            heat1.lanes = [
                HeatLane(lane_number=1, racer=r1, time_microseconds=123456, place=1),
                HeatLane(lane_number=2, racer=r2, time_microseconds=130000, place=2),
            ]
            session.add_all([g, r1, r2, race, heat1])
            await session.commit()

        async with self.Session() as session:
            res = await session.execute(select(Race).where(Race.name == "Pack Finals"))
            race2 = res.scalar_one()
            self.assertEqual(race2.num_lanes, 2)

            res = await session.execute(select(Heat).where(Heat.race_id == race2.id))
            heat2 = res.scalar_one()
            self.assertEqual(heat2.heat_number, 1)

            res = await session.execute(select(HeatLane).where(HeatLane.heat_id == heat2.id))
            lanes = sorted(res.scalars().all(), key=lambda x: x.lane_number)
            self.assertEqual([l.lane_number for l in lanes], [1, 2])
            self.assertEqual([l.place for l in lanes], [1, 2])


if __name__ == "__main__":
    unittest.main()
