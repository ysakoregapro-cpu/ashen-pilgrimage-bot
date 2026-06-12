# Job System Audit

Generated: 2026-06-12T20:06:47.783Z

## Summary
- Total jobs: 32
- Tier counts: {"advanced":16,"basic":8,"hidden":8}
- player_job_levels rows: 1

## Basic Jobs (8)
剣士, 斥候, 格闘士, 機工師, 狩人, 祈祷師, 重騎士, 魔術師

## Advanced Jobs (16)
剣豪, 司祭, 城塞騎士, 弓聖, 拳闘王, 探索者, 星術師, 暗部, 灰術師, 癒し手, 砲術師, 破戒僧, 聖盾士, 追跡者, 錬機師, 魔剣士

## Hidden Jobs (8)
アーク技師, 創造砲士, 執行者, 星剣士, 繋ぎ手, 解析者, 調律師, 黄昏騎士

## player_job_levels columns
user_id, job_name, job_level, job_exp, is_main, is_sub, unlocked_at, updated_at

## Current sub job unlock
- `selectSubJob()` requires player.level >= 20
- Allows any `advanced` tier job from jobs table
- No per-main-job pairing; no `player_sub_job_unlocks` table
- `initSubJobLevel()` creates row on first sub EXP

## Main job change
- `selectMainJob()` only when main_job === 未選択 (one-time)

## Player job distribution (top 10)
| main_job | sub_job | count |
| --- | --- | --- |
| 魔術師 | — | 1 |

## Phase2 migration candidates (proposal only)
- `player_sub_job_unlocks(user_id, sub_job_id, unlocked_at)` — Lv20 per-main unlock
- `player_advanced_job_unlocks(user_id, advanced_job_id, unlocked_at, trial_cleared_at)` — Lv70 + trial
- `jobs` columns: stat_mult_hp/mp/attack/magic/defense/speed OR external mult table
- `paired_sub_job_id`, `paired_advanced_job_id`, `base_job_id` on jobs
- 巡礼者 seed + tier `pilgrim` or basic

## Existing advanced/hidden conflict notes
- Advanced 16 jobs overlap with Phase2「上級メイン9職」names (e.g. 剣豪 vs 黄昏剣聖)
- Hidden includes 繋ぎ手 — Phase2 sub job same name
- Safest Phase2 path: new job rows OR remap advanced tier to legacy + hide from /job sub menu

## Phase2 proposals (not implemented)
- player_sub_job_unlocks: **recommended**
- player_advanced_job_unlocks: **recommended**
- jobs multiplier columns: **recommended** (alternative: code-only mult table in seed)
- Keep legacy 16 advanced as hidden/deprecated until migration mapping defined