"""Comprehensive tests for the heat scheduling algorithm."""

from __future__ import annotations

from collections import defaultdict

import pytest

from app.services.heat_scheduler import generate_round_robin_heats


class TestRoundRobinBasic:
    """Basic happy-path tests."""

    def test_empty_racer_list(self):
        assert generate_round_robin_heats([], 4) == []

    def test_single_racer_single_lane(self):
        heats = generate_round_robin_heats([1], 1)
        assert len(heats) == 1
        assert heats[0] == [1]

    def test_single_racer_multiple_lanes(self):
        heats = generate_round_robin_heats([1], 4)
        # n < l: should produce l heats
        assert len(heats) == 4
        for heat in heats:
            assert len(heat) == 4
            non_none = [x for x in heat if x is not None]
            assert non_none == [1]

    def test_racers_equal_lanes(self):
        """4 racers, 4 lanes — each racer in every lane exactly once."""
        racer_ids = [10, 20, 30, 40]
        heats = generate_round_robin_heats(racer_ids, 4)
        assert len(heats) == 4
        self._assert_lane_rotation(heats, racer_ids, 4)

    def test_more_racers_than_lanes(self):
        """5 racers, 4 lanes — 5 heats."""
        racer_ids = [1, 2, 3, 4, 5]
        heats = generate_round_robin_heats(racer_ids, 4)
        assert len(heats) == 5
        for heat in heats:
            assert len(heat) == 4
            assert len(set(heat)) == 4  # no duplicates within a heat

    def test_fewer_racers_than_lanes(self):
        """3 racers, 4 lanes — should produce 4 heats with byes."""
        racer_ids = [1, 2, 3]
        heats = generate_round_robin_heats(racer_ids, 4)
        assert len(heats) == 4
        for heat in heats:
            assert len(heat) == 4
            non_none = [x for x in heat if x is not None]
            assert len(non_none) == 3

    def _assert_lane_rotation(self, heats, racer_ids, num_lanes):
        """Verify each racer appears exactly once in each lane across all heats."""
        lane_counts = defaultdict(lambda: defaultdict(int))
        for heat in heats:
            for lane_idx, racer_id in enumerate(heat):
                if racer_id is not None:
                    lane_counts[racer_id][lane_idx] += 1

        for rid in racer_ids:
            for lane_idx in range(num_lanes):
                assert lane_counts[rid][lane_idx] == 1, (
                    f"Racer {rid} in lane {lane_idx}: {lane_counts[rid][lane_idx]} times"
                )


class TestLaneRotation:
    """Verify lane fairness properties."""

    def test_each_racer_runs_once_per_lane_n_ge_l(self):
        """With n >= l, each racer should appear exactly once in each lane."""
        for n in [4, 5, 6, 8, 10]:
            racer_ids = list(range(1, n + 1))
            heats = generate_round_robin_heats(racer_ids, 4)
            lane_assignment_counts = defaultdict(lambda: defaultdict(int))
            for heat in heats:
                for lane_idx, rid in enumerate(heat):
                    if rid is not None:
                        lane_assignment_counts[rid][lane_idx] += 1

            for rid in racer_ids:
                for lane_idx in range(4):
                    assert lane_assignment_counts[rid][lane_idx] == 1

    def test_each_racer_runs_once_per_lane_n_lt_l(self):
        """With n < l, each racer appears exactly once per lane across l heats."""
        racer_ids = [1, 2]
        heats = generate_round_robin_heats(racer_ids, 4)
        assert len(heats) == 4
        lane_map = defaultdict(lambda: defaultdict(int))
        for heat in heats:
            for lane_idx, rid in enumerate(heat):
                if rid is not None:
                    lane_map[rid][lane_idx] += 1

        for rid in racer_ids:
            for lane_idx in range(4):
                assert lane_map[rid][lane_idx] == 1

    def test_no_racer_repeats_within_heat(self):
        """No racer should appear in more than one lane per heat."""
        for n in [3, 4, 5, 6, 7, 8]:
            racer_ids = list(range(1, n + 1))
            heats = generate_round_robin_heats(racer_ids, 4)
            for heat_idx, heat in enumerate(heats):
                racers_in_heat = [r for r in heat if r is not None]
                assert len(racers_in_heat) == len(set(racers_in_heat)), (
                    f"Duplicate racer in heat {heat_idx} with {n} racers"
                )


class TestEdgeCases:
    """Edge cases and error conditions."""

    def test_zero_lanes_raises(self):
        with pytest.raises(ValueError, match="num_lanes must be > 0"):
            generate_round_robin_heats([1], 0)

    def test_negative_lanes_raises(self):
        with pytest.raises(ValueError, match="num_lanes must be > 0"):
            generate_round_robin_heats([1], -1)

    def test_duplicate_racer_ids_raises(self):
        with pytest.raises(ValueError, match="duplicates"):
            generate_round_robin_heats([1, 1, 2], 4)

    def test_single_lane(self):
        racer_ids = [1, 2, 3]
        heats = generate_round_robin_heats(racer_ids, 1)
        assert len(heats) == 3
        for heat in heats:
            assert len(heat) == 1

    def test_large_racer_count(self):
        """Stress test: 50 racers, 8 lanes."""
        racer_ids = list(range(1, 51))
        heats = generate_round_robin_heats(racer_ids, 8)
        assert len(heats) == 50
        for heat in heats:
            assert len(heat) == 8
            racers_in_heat = [r for r in heat if r is not None]
            assert len(racers_in_heat) == len(set(racers_in_heat))

    def test_various_lane_counts(self):
        """Test all supported lane counts: 4, 6, 8."""
        racer_ids = list(range(1, 7))  # 6 racers
        for num_lanes in [4, 6, 8]:
            heats = generate_round_robin_heats(racer_ids, num_lanes)
            if len(racer_ids) >= num_lanes:
                assert len(heats) == len(racer_ids)
            else:
                assert len(heats) == num_lanes

    def test_deterministic_output(self):
        """Same input always produces the same schedule."""
        racer_ids = [1, 2, 3, 4, 5]
        result1 = generate_round_robin_heats(racer_ids, 4)
        result2 = generate_round_robin_heats(racer_ids, 4)
        assert result1 == result2

    def test_bye_lanes_are_none(self):
        """With fewer racers than lanes, bye slots are None."""
        heats = generate_round_robin_heats([1, 2], 4)
        for heat in heats:
            nones = [x for x in heat if x is None]
            assert len(nones) == 2  # 4 lanes - 2 racers = 2 byes
