# ジョブ / サブジョブ設計ノート（Phase1 監査）

> **未確定**: 以下は GPT 側 Phase2 設計案を前提とした監査メモ。Cursor は仕様を確定していない。

## 現状

- `jobs` seed: basic 8 + advanced 16 + hidden 8 など tier 別に存在
- `players.main_job` / `players.sub_job` で現在職を保持
- `player_job_levels`: `(user_id, job_id, level, exp, is_main, is_sub)` — ジョブごとに JobLv/JobEXP
- ステータス: `recalculatePlayerStats()` が **加算補正**（メイン + サブ + 装備 + セット）
- サブジョブ解放: メイン JobLv20 到達時、**任意の advanced tier ジョブ**をサブに選べる（対応ペアなし）
- 巡礼者は seed に未存在

## 問題

- 加算補正のため Lv 帯が上がると職差が相対的に薄れる
- サブジョブが「対応サブ」ではなく旧上級16職から自由選択
- 上級メイン（JobLv70 + 試練）の概念が未実装
- `is_main` / `is_sub` フラグと実際の main/sub 列の整合は要 migration 設計

## Phase2候補（GPT案）

- 三層: Lv1〜 基本メイン / Lv20〜 対応サブ / Lv70〜 + 試練で上級メイン
- 倍率式: `floor(基礎 × メイン倍率 × サブ倍率) + 装備`（上級メイン時は上級倍率）
- 新サブ9職（刃走り〜繋ぎ手）、巡礼者 + 繋ぎ手追加
- `player_sub_job_unlocks` テーブル検討
- 旧 advanced 16 / hidden 8 の扱い（統合・非表示・レガシー）

## 未確定

- 倍率表の最終数値
- メインジョブ変更 UI/コスト
- 旧上級職スキルの引き継ぎ
- migration で既存 `player_job_levels` をどうマップするか

## 関連

- `reports/job-system-audit.md`
- `reports/stat-formula-check.md`
- `docs/design/advanced-class-system.md`
