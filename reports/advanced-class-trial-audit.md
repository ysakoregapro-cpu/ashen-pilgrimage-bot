# Advanced Class / Trial Audit

Generated: 2026-06-12T20:06:50.371Z

## JobLv70 detection
- JOB_LEVEL_CAP = 70 in jobLevelSystem.ts
- `addJobExp()` loop checks jobExpRequired; on level up calls checkJobQuests
- Hook point for trial unlock: end of `addJobExp()` when newLevel === 70
- `getJobLevel(userId, jobName)` reads player_job_levels

## Endgame gate flags (candidates for trial access)
- `valhalla_unlocked` story flag (set on kaiSrcTransform)
- `chapter_completed:ch7_furnace`
- `hasSrcWeapon()` check in progressionGates
- Town unlock: starfall_observatory, deep_furnace_outpost, valhalla_fortress

## Existing boss/rematch/trial patterns
- `bossRematchSystem.ts` — rematch battles with isRematch flag
- `createBattle(..., { isRematch: true })`
- `battle_sessions.is_boss`, `is_event_battle`, `can_flee` columns exist
- No `trial_type` / `trial_job` column yet — **Phase2 migration candidate**

## Dynamic mirror enemy feasibility
- `scaleMonsterForBattle()` scales from monster seed — can inject custom stats
- `buildEnemyStateFromMonsters()` builds EnemyStateJson — could accept override stats
- Player stats via `requirePlayer()` — copy hp/mp/attack/magic/defense/speed feasible
- Skills need not copy — use simplified AI pattern JSON
- Recommendation: **dynamic generation** over new monster seed rows

## battle_sessions extension candidates
- Current columns include: id, user_id, area_id, monster_id, player_hp, player_mp, enemy_hp, enemy_break, turn_count, status_json, is_boss, is_raid...
- is_event_battle=true, can_flee=true
- Proposed: trial_type TEXT, trial_job TEXT, trial_attempt INTEGER

## Defeat handling for trials
- `applyDefeat()` — gold loss, healPlayer(35-40%), return town
- Phase2: trial-only flag to skip gold loss / use lighter penalty
- `resolveDefeat` now syncs HP/MP before applyDefeat

## Retry flow
- New battle session per attempt — no blocker found
- Rematch pattern reusable

## Recommended DB (Phase2 proposal)
```sql
player_advanced_job_unlocks (
  user_id TEXT NOT NULL,
  advanced_job_id TEXT NOT NULL,
  unlocked_at TEXT,
  trial_cleared_at TEXT,
  unlock_source TEXT,
  PRIMARY KEY (user_id, advanced_job_id)
)
```

## /job UI trial hook
- Current: `/job show|select|sub` only
- Phase2: button/select when JobLv70 + endgame flag → start trial
- `jobSystem.ts` / `townActionSystem.ts` extension points

## Mirror stat spec (Phase2 draft)
- HP: player.max_hp * 1.10
- ATK/MAG/DEF/SPD: equal to player
- MP: optional / not needed for enemy AI
- On win: insert player_advanced_job_unlocks