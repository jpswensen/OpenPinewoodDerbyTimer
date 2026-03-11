from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict


class GroupBase(BaseModel):
    name: str
    description: Optional[str] = None


class GroupCreate(GroupBase):
    pass


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class GroupRead(GroupBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class RacerBase(BaseModel):
    name: str
    car_name: Optional[str] = None
    car_number: Optional[str] = None
    group_id: Optional[int] = None


class RacerCreate(RacerBase):
    pass


class RacerUpdate(BaseModel):
    name: Optional[str] = None
    car_name: Optional[str] = None
    car_number: Optional[str] = None
    group_id: Optional[int] = None


class RacerRead(RacerBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


class RaceBase(BaseModel):
    name: str
    num_lanes: int
    status: Literal["setup", "in_progress", "completed"] = "setup"


class RaceCreate(RaceBase):
    pass


class RaceUpdate(BaseModel):
    name: Optional[str] = None
    num_lanes: Optional[int] = None
    status: Optional[Literal["setup", "in_progress", "completed"]] = None


class RaceRead(RaceBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class HeatBase(BaseModel):
    race_id: int
    heat_number: int
    status: Literal["pending", "in_progress", "completed"] = "pending"
    scheduled_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class HeatCreate(HeatBase):
    pass


class HeatUpdate(BaseModel):
    status: Optional[Literal["pending", "in_progress", "completed"]] = None
    scheduled_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class HeatRead(HeatBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class HeatWithLanesRead(HeatRead):
    lanes: list[HeatLaneRead]


class HeatLaneBase(BaseModel):
    heat_id: int
    lane_number: int
    racer_id: Optional[int] = None
    time_microseconds: Optional[int] = None
    place: Optional[int] = None


class HeatLaneCreate(HeatLaneBase):
    pass


class HeatLaneUpdate(BaseModel):
    racer_id: Optional[int] = None
    time_microseconds: Optional[int] = None
    place: Optional[int] = None


class HeatLaneRead(HeatLaneBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class RaceResultBase(BaseModel):
    race_id: int
    racer_id: int
    average_time: Optional[int] = None
    best_time: Optional[int] = None
    total_points: Optional[int] = None
    overall_place: Optional[int] = None


class RaceResultCreate(RaceResultBase):
    pass


class RaceResultUpdate(BaseModel):
    average_time: Optional[int] = None
    best_time: Optional[int] = None
    total_points: Optional[int] = None
    overall_place: Optional[int] = None


class RaceResultRead(RaceResultBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
