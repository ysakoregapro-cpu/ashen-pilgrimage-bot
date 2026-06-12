# 上級クラス / 現身の試練 設計ノート（Phase1 監査）

> **未確定**: GPT Phase2 案の整理。本実装は Phase2。

## 現状

- JobLv70 到達は `jobLevelSystem.addJobExp()` で検知可能（level 更新後）
- 上級クラス「使用可能」フラグや試練専用テーブルは **未存在**
- boss / rematch / story boss 戦闘は `battleSystem` + seed monsters で実装済み
- `battle_sessions` に trial 専用カラムは現状なし（JSON state で拡張可能か要確認）
- プレイヤーステータスを敵にコピーする API は **未実装**（scaleMonsterForBattle は seed 敵用）

## 問題

- 旧 advanced tier 16職は「サブとして Lv20 解放」に使われており、新「上級メイン9職」と役割が衝突
- 終盤到達フラグ（ヴァルハラ等）と JobLv70 の組み合わせで試練解放する導線がない
- 試練敗北時のペナルティ・再挑戦 UI 未設計

## Phase2候補（GPT案）

- 条件: 基本メイン JobLv70 + ヴァルハラ解放 → 現身の試練挑戦可
- 勝利: 対応上級メイン9職を解放（例: 剣士 → 黄昏剣聖）
- 現身: 試練開始時の最終ステータスをコピー（HP 1.10倍等）、動的生成第一候補
- DB案: `player_advanced_job_unlocks (user_id, advanced_job_id, unlocked_at, trial_cleared_at, unlock_source)`
- `/job` UI から試練誘導

## 未確定

- 終盤到達の正式フラグ（観測所 / 深層炉 / ヴァルハラ のどれか）
- 現身の行動 AI（代表スキルのみ vs フルコピー）
- 敗北ペナルティ（なし / 軽減 / HP1 帰還）
- 旧16上級職のスキル・名称との共存方針

## 関連

- `reports/advanced-class-trial-audit.md`
- `docs/design/job-subjob-system.md`
