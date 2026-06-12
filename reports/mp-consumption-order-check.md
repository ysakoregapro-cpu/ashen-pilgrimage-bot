# MP Consumption Order Check

Generated: 2026-06-12T21:30:26.617Z

## OK

## Notes
- スキル撃破後MP: 145 → 141 (cost 4)
- syncBattleResourcesToPlayer MP=140
- レベルアップ時: addExp() が hp=max_hp, mp=max_mp を設定（全回復）
- MP消費は executePlayerAction 内で命中前に pMp -= skill.mp_cost