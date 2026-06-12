# Advanced Class / Trial Audit

Generated: 2026-06-12T21:30:30.711Z

## Phase2 implementation status
- **`player_advanced_job_unlocks` 実装済み** — migration + `jobProgressionSystem.ts`
- Columns: user_id, advanced_job, base_job, unlocked_at, trial_cleared_at, unlock_source (rows: 1)
- **`battle_sessions.trial_type / trial_job` 実装済み** — 試練戦闘セッション識別
- trial_type=true, trial_job=true

## Trial access conditions
- Base job JobLv70+ required
- Story flag: `valhalla_unlocked` OR `chapter_completed:ch7_furnace`
- Already unlocked advanced jobs cannot retry

## UI flow (implemented)
- `/job show` → `[現身の試練に挑む]` → trial list → condition/confirm → `[挑戦する]`
- `/job show` → `[上級職を確認]` — unlock status
- Handler: `jobUiSystem.ts` + `index.ts` (`job:*` buttons)
- Uses `startTrialBattle()` → `createBattle(..., { isTrial: true })`

## Condition display
- JobLv70 達成/未達成
- ヴァルハラ解放 達成/未達成
- 上級職 解放済/未解放
- Blocked during active battle / coop / recruit

## Victory / defeat
- Victory: `recordAdvancedJobTrialVictory()` → `player_advanced_job_unlocks.trial_cleared_at`
- JobLv inheritance from base job to advanced job
- Defeat: `applyTrialDefeat()` — HP=1, light penalty (no gold loss)

## Mirror enemy spec (active)
- HP: player.max_hp × 1.10
- ATK/MAG/DEF/SPD: equal to player at battle start
- Monster seed: `mon_trial_avatar_{baseJob}` updated per attempt

## Job trio map (9 trials)
- 剣士 → sub:刃走り / advanced:黄昏剣聖
- 重騎士 → sub:城壁番 / advanced:白銀城塞騎士
- 狩人 → sub:矢痕読み / advanced:残響弓王
- 魔術師 → sub:灰術士 / advanced:星灰大魔導
- 祈祷師 → sub:灯守 / advanced:巡礼聖祈師
- 斥候 → sub:影足 / advanced:影渡りの夜王
- 機工師 → sub:歯車工 / advanced:深層機工卿
- 格闘士 → sub:勁打者 / advanced:灰拳闘王
- 巡礼者 → sub:繋ぎ手 / advanced:星巡の導き手

## JobLv system
- JOB_LEVEL_CAP = 70
- Sub unlock at JobLv20 via `player_sub_job_unlocks`
- Advanced trial at JobLv70

## Verification script
- `scripts/advanced-trial-flow-check.ts` — automated flow PASS/FAIL