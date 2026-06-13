# battle-damage-system-audit

Generated: 2026-06-13T11:30:41.425Z

## 既存ダメージ計算システム

式の参照値監査（ファイル実装ベース）。

| damage_type | source_file | uses_player_attack | uses_player_magic | uses_player_defense | uses_enemy_attack | uses_enemy_defense | uses_resistance | uses_min_damage | uses_variance | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| player_physical_attack | combatMath.ts:calcPhysicalDamage | yes | no | no | no | yes | via elementSystem in battleSystem | yes | yes | DEFENSE_MITIGATION_COEFF mitigation |
| player_skill_damage | skillBattleCore.ts:calcSkillHitDamage | via scaling_stat | via scaling_stat when magic skill | no | no | yes | battleSystem applyElementToDamage | yes | via calcPhysicalDamage | getScalingStat picks attack/magic/spirit etc |
| enemy_to_player | combatMath.ts:calcEnemyDamageToPlayer | no | no | yes | yes | no | yes | yes | HP% roll + physical variance | HP% component + stat component; level gap mitigates HP% when overleveled |
| enemy_balance_weights | enemyBalanceV2.ts | no | no | no | no | no | no | no | no | HP weight 0.32 / stat weight 0.68 |