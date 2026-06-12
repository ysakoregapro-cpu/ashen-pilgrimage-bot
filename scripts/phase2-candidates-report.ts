/** Aggregates Phase2 candidate list — run after other audits */
import fs from 'fs';
import path from 'path';
import { writeReport } from './audit/reportWriter';

function main() {
  const content = `# Phase2 Candidates

Generated: ${new Date().toISOString()}

> Cursor audit output. Final prioritization by GPT.

## A: 不具合修正

- MP/HP永続化（Phase1で resolveVictory/Defeat/flee 修正済み — 本番反映確認）
- レベルアップ全回復ログ（Phase1で勝利メッセージに追加）

## B: 装備導線

- arms を EQUIP_SLOT_WEIGHTS に追加 / pool フォールバック
- legs/feet を各町 area rewards に段階配置
- 鉄雪/ヴァルハラ/黒灯/旧王 防具セットの drop 配置
- 8職 Uni 職別素材（16種）設計・追加
- Src Kai vs manifest 二重経路の整理

## C: ジョブ/サブジョブ

- ステータス倍率制（基礎×メイン×サブ+装備）
- 巡礼者/繋ぎ手 seed
- メインジョブ変更可能化
- メイン JobLv20 → 対応サブ解放（player_sub_job_unlocks）
- ジョブ選択 UI 説明文

## D: 上級クラス/現身の試練

- メイン JobLv70 + ヴァルハラ解放 → 試練解放
- 現身の試練（動的ステータスコピー敵）
- player_advanced_job_unlocks テーブル
- battle_sessions trial フラグ
- 上級9職をメインジョブとして設定

## E: 街/進行

- 探索なし4街の list 非表示 or placeholder
- 黒灯りエリア拡充
- townlist 必要性ラベル

## F: 戦闘バランス

- 被ダメ HP 比例ウェイト調整
- 中盤敵 ATK 底上げ
- 防御係数見直し
- 上級クラス前提 Valhalla/raid 火力検証

## G: 保留/将来用

- 旧 advanced 16職の扱い（統合/非表示）
- 旧 hidden 8職との名称衝突解消
- manifest Src  per-weapon 素材ルート（レガシー）

## Related reports

- reports/job-system-audit.md
- reports/stat-formula-check.md
- reports/advanced-class-trial-audit.md
- reports/weapon-route-audit.md
- reports/armor-drop-audit.md
- reports/town-implementation-audit.md
- reports/item-use-audit.md
- reports/battle-damage-curve.md
- reports/defense-effect.md
- reports/mp-consumption-order-check.md
`;

  writeReport('phase2-candidates.md', content);
  console.log('✅ phase2-candidates → reports/phase2-candidates.md');
}

main();
