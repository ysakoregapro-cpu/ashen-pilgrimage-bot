# Phase2 Remaining Issues

Generated during Phase2 bulk implementation.

## 試練UI

- 現身の試練の開始UIは `trialBattleSystem.startTrialBattle()` まで実装済み。施設メニューからの専用ボタン導線は最小実装（今後 `/job` 施設拡張で `job:trial` 等を追加可能）。

## 鉄雪の関所

- `iron_snow_post` に探索エリアが無いため、`set_iron_snow` は `area_red_watchtower` / `area_fire_training`（赤灰の砦）へ配置。

## 巡礼者

- 基本職として seed 追加。初回 `/job select` では8職+巡礼者から選択可能（facility job と同様）。

## Legacy

- `manifestSrcWeapon` は削除せず legacy 維持。
- 旧 advanced/hidden 16+8 は DB 残存・UI 非表示・倍率 1.00。

## 監査

- 一部 audit スクリプトは Phase2 後の数値に未更新の可能性あり。`npm run build` 成功後に各 script を再実行推奨。
