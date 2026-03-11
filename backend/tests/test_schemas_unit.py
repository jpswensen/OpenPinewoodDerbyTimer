"""Unit tests for Pydantic schemas — validation, defaults, and serialization."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.models.schemas import (
    GroupCreate,
    GroupRead,
    GroupUpdate,
    HeatLaneRead,
    HeatUpdate,
    HeatWithLanesRead,
    RaceCreate,
    RaceRead,
    RaceResultRead,
    RaceUpdate,
    RacerCreate,
    RacerRead,
    RacerUpdate,
)


class TestGroupSchemas:
    def test_group_create_minimal(self):
        g = GroupCreate(name="Tigers")
        assert g.name == "Tigers"
        assert g.description is None

    def test_group_create_with_description(self):
        g = GroupCreate(name="Bears", description="Cub Scouts")
        assert g.description == "Cub Scouts"

    def test_group_update_partial(self):
        u = GroupUpdate(name="Updated")
        assert u.name == "Updated"
        assert u.description is None

    def test_group_read_from_attributes(self):
        now = datetime.now(timezone.utc)
        g = GroupRead(id=1, name="X", description=None, created_at=now, updated_at=now)
        assert g.id == 1
        assert g.name == "X"


class TestRacerSchemas:
    def test_racer_create_minimal(self):
        r = RacerCreate(name="Alice")
        assert r.name == "Alice"
        assert r.car_name is None
        assert r.car_number is None
        assert r.group_id is None

    def test_racer_create_full(self):
        r = RacerCreate(name="Bob", car_name="Speedy", car_number="42", group_id=1)
        assert r.car_name == "Speedy"
        assert r.car_number == "42"
        assert r.group_id == 1

    def test_racer_update_partial(self):
        u = RacerUpdate(car_name="New Car")
        assert u.car_name == "New Car"
        assert u.name is None

    def test_racer_read_serialization(self):
        now = datetime.now(timezone.utc)
        r = RacerRead(id=1, name="A", car_name=None, car_number=None, group_id=None, created_at=now, updated_at=now)
        data = r.model_dump()
        assert "id" in data
        assert "created_at" in data


class TestRaceSchemas:
    def test_race_create_defaults(self):
        r = RaceCreate(name="Annual Race", num_lanes=4)
        assert r.status == "setup"

    def test_race_create_valid_statuses(self):
        for s in ("setup", "in_progress", "completed"):
            r = RaceCreate(name="R", num_lanes=4, status=s)
            assert r.status == s

    def test_race_create_invalid_status(self):
        with pytest.raises(Exception):
            RaceCreate(name="R", num_lanes=4, status="invalid")

    def test_race_update_partial(self):
        u = RaceUpdate(status="completed")
        assert u.status == "completed"
        assert u.name is None
        assert u.num_lanes is None

    def test_race_update_invalid_status(self):
        with pytest.raises(Exception):
            RaceUpdate(status="bad_status")


class TestHeatSchemas:
    def test_heat_update_valid_statuses(self):
        for s in ("pending", "in_progress", "completed"):
            u = HeatUpdate(status=s)
            assert u.status == s

    def test_heat_update_invalid_status(self):
        with pytest.raises(Exception):
            HeatUpdate(status="running")

    def test_heat_with_lanes_read(self):
        now = datetime.now(timezone.utc)
        lane = HeatLaneRead(
            id=1, heat_id=1, lane_number=1, racer_id=1,
            time_microseconds=None, place=None,
        )
        h = HeatWithLanesRead(
            id=1, race_id=1, heat_number=1, status="pending",
            scheduled_at=None, completed_at=None, lanes=[lane],
        )
        assert len(h.lanes) == 1
        assert h.lanes[0].lane_number == 1


class TestRaceResultSchemas:
    def test_race_result_read(self):
        rr = RaceResultRead(
            id=1, race_id=1, racer_id=1,
            average_time=3500000, best_time=3400000,
            total_points=5, overall_place=1,
        )
        assert rr.average_time == 3500000
        assert rr.overall_place == 1

    def test_race_result_read_null_fields(self):
        rr = RaceResultRead(
            id=2, race_id=1, racer_id=2,
            average_time=None, best_time=None,
            total_points=None, overall_place=None,
        )
        assert rr.average_time is None
