from __future__ import annotations

from collections.abc import Sequence


def generate_round_robin_heats(
    racer_ids: Sequence[int], num_lanes: int
) -> list[list[int | None]]:
    """Generate a deterministic heat schedule with lane rotation.

    In the typical case (num_racers >= num_lanes), this produces num_racers heats.
    Each heat has num_lanes distinct racers, and each racer appears exactly once
    in each lane across the schedule.

    If num_racers < num_lanes, the schedule uses num_lanes heats and includes bye
    lanes (None assignments) so each racer still runs once per lane.
    """

    if num_lanes <= 0:
        raise ValueError("num_lanes must be > 0")

    racer_ids = list(racer_ids)
    n = len(racer_ids)
    if n == 0:
        return []

    l = num_lanes

    if n >= l:
        heats: list[list[int | None]] = []
        for heat_idx in range(n):
            lanes = [racer_ids[(heat_idx + lane_idx) % n] for lane_idx in range(l)]
            heats.append(lanes)
        return heats

    # n < l: include byes but still rotate each racer through every lane once.
    heats = []
    for heat_idx in range(l):
        lanes: list[int | None] = [None] * l
        for racer_idx, rid in enumerate(racer_ids):
            lane_idx = (racer_idx + heat_idx) % l
            lanes[lane_idx] = rid
        heats.append(lanes)
    return heats
