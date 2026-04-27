from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RaceStatus(str, Enum):
    SETUP = "setup"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class HeatStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    racers: Mapped[list["Racer"]] = relationship(
        back_populates="group",
        lazy="selectin",
    )


class Racer(Base):
    __tablename__ = "racers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    car_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    car_number: Mapped[str | None] = mapped_column(String(50), nullable=True)

    group_id: Mapped[int | None] = mapped_column(
        ForeignKey("groups.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    disabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)

    group: Mapped[Group | None] = relationship(back_populates="racers", lazy="selectin")
    heat_lanes: Mapped[list["HeatLane"]] = relationship(back_populates="racer", lazy="selectin")
    race_results: Mapped[list["RaceResult"]] = relationship(
        back_populates="racer",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )


class Race(Base):
    __tablename__ = "races"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    num_lanes: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default=RaceStatus.SETUP.value)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    heats: Mapped[list["Heat"]] = relationship(
        back_populates="race",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )
    results: Mapped[list["RaceResult"]] = relationship(
        back_populates="race",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )


class Heat(Base):
    __tablename__ = "heats"
    __table_args__ = (UniqueConstraint("race_id", "heat_number", name="uq_race_heat_number"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    race_id: Mapped[int] = mapped_column(ForeignKey("races.id", ondelete="CASCADE"), nullable=False)

    heat_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default=HeatStatus.PENDING.value)

    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    race: Mapped[Race] = relationship(back_populates="heats", lazy="selectin")
    lanes: Mapped[list["HeatLane"]] = relationship(
        back_populates="heat",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
        order_by="HeatLane.lane_number",
    )


class HeatLane(Base):
    __tablename__ = "heat_lanes"
    __table_args__ = (
        UniqueConstraint("heat_id", "lane_number", name="uq_heat_lane_number"),
        Index("ix_heat_lanes_heat_id", "heat_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    heat_id: Mapped[int] = mapped_column(ForeignKey("heats.id", ondelete="CASCADE"), nullable=False)

    lane_number: Mapped[int] = mapped_column(Integer, nullable=False)
    racer_id: Mapped[int | None] = mapped_column(
        ForeignKey("racers.id", ondelete="SET NULL"), nullable=True
    )

    time_microseconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    place: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dnf: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)

    heat: Mapped[Heat] = relationship(back_populates="lanes", lazy="selectin")
    racer: Mapped[Racer | None] = relationship(back_populates="heat_lanes", lazy="selectin")


class RaceResult(Base):
    __tablename__ = "race_results"
    __table_args__ = (
        UniqueConstraint("race_id", "racer_id", name="uq_race_results_race_racer"),
        Index("ix_race_results_race_id", "race_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    race_id: Mapped[int] = mapped_column(ForeignKey("races.id", ondelete="CASCADE"), nullable=False)
    racer_id: Mapped[int] = mapped_column(ForeignKey("racers.id", ondelete="CASCADE"), nullable=False)

    average_time: Mapped[int | None] = mapped_column(Integer, nullable=True)
    best_time: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    overall_place: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dnf_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    race: Mapped[Race] = relationship(back_populates="results", lazy="selectin")
    racer: Mapped[Racer] = relationship(back_populates="race_results", lazy="selectin")
