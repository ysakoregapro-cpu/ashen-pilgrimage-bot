# Battle Damage Curve

Generated: 2026-06-12T20:07:06.547Z

Assumptions: avg gear playerProfile, nearest monster by level, normal threat, mid band difficulty

| Lv | PlayerHP | PlayerATK | EnemyATK | EnemyDEF | PhysDmg | SkillDmg(1.2mag) | Taken | Taken/HP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 130 | 25 | 6 | 3 | 22 | 23 | 6 | 4.6% |
| 10 | 265 | 43 | 21 | 6 | 38 | 42 | 23 | 8.7% |
| 20 | 415 | 63 | 44 | 22 | 52 | 60 | 43 | 10.4% |
| 35 | 640 | 93 | 58 | 24 | 76 | 88 | 42 | 6.6% |
| 50 | 865 | 123 | 79 | 40 | 93 | 109 | 63 | 7.3% |
| 70 | 1165 | 163 | 163 | 55 | 116 | 140 | 169 | 14.5% |
| 80 | 1315 | 183 | 132 | 58 | 129 | 152 | 90 | 6.8% |
| 100 | 1615 | 223 | 132 | 58 | 157 | 186 | 90 | 5.6% |

## Observations (Phase2 tuning candidates)
- Player skill damage scales faster than enemy taken % (HP-proportional enemy damage)
- Mid-band enemy ATK may feel low vs player ATK ~160 at Lv25 mage (see combat-balance-check REAL_LOG profile)
- Valhalla/raid: use elite/boss tiers + higher area mult for endgame check