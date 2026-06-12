# Battle Damage Curve

Generated: 2026-06-12T21:30:15.009Z

Assumptions: avg gear playerProfile, nearest monster by level, Phase2 enemyBalanceV2 scaling

| Lv | PlayerHP | PlayerATK | EnemyATK | EnemyDEF | PhysDmg | SkillDmg(1.2mag) | Taken | Taken/HP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 130 | 25 | 7 | 3 | 22 | 23 | 8 | 6.2% |
| 10 | 265 | 43 | 25 | 7 | 37 | 42 | 26 | 9.8% |
| 20 | 415 | 63 | 76 | 39 | 45 | 52 | 79 | 19.0% |
| 35 | 640 | 93 | 105 | 35 | 69 | 81 | 77 | 12.0% |
| 50 | 865 | 123 | 178 | 69 | 77 | 91 | 119 | 13.8% |
| 70 | 1165 | 163 | 649 | 185 | 66 | 80 | 385 | 33.0% |
| 80 | 1315 | 183 | 476 | 139 | 86 | 104 | 256 | 19.5% |
| 100 | 1615 | 223 | 476 | 139 | 105 | 127 | 220 | 13.6% |

## Observations (Phase2 tuning candidates)
- Player skill damage scales faster than enemy taken % (HP-proportional enemy damage)
- Mid-band enemy ATK may feel low vs player ATK ~160 at Lv25 mage (see combat-balance-check REAL_LOG profile)
- Valhalla/raid: use elite/boss tiers + higher area mult for endgame check