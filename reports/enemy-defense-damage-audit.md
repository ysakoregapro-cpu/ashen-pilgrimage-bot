# enemy-defense-damage-audit

Generated: 2026-06-13T11:30:47.195Z

## 敵防御

物理/魔法ダメージとTTK目安。

| enemy_id | enemy_defense | sample_player_attack | sample_player_magic | physical_damage | magic_damage | turns_to_kill_physical | turns_to_kill_magic | balance_note | detail |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mon_bandit | 6 | 28 | 12 | 26 | 13 | 3 | 6 | OK | early scaledHP=78 |
| mon_star_slime | 3 | 28 | 12 | 27 | 14 | 2 | 4 | OK | early scaledHP=52 |
| mon_drift_undead | 7 | 55 | 48 | 52 | 54 | 3 | 3 | OK | mid scaledHP=151 |
| mon_ore_eater | 23 | 55 | 48 | 47 | 49 | 6 | 5 | OK | mid scaledHP=244 |
| mon_arc_residue | 84 | 95 | 88 | 60 | 67 | 38 | 34 | WARN | late scaledHP=2225 |
| mon_cave_in_bug | 39 | 95 | 88 | 75 | 83 | 5 | 5 | OK | late scaledHP=372 |
| mon_old_army | 89 | 165 | 140 | 102 | 104 | 17 | 16 | WARN | valhalla scaledHP=1640 |
| mon_throne_guard | 205 | 165 | 140 | 68 | 70 | 56 | 55 | WARN | valhalla scaledHP=3788 |