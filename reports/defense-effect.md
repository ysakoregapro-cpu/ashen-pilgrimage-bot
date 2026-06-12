# Defense Effect Check

Generated: 2026-06-12T20:07:07.301Z

## Enemy→Player (HP 45% + stat 55% formula)
| Lv | DEF | BaseTaken | NewTaken | Reduction |
| --- | --- | --- | --- | --- |
| 10 | 47 | 19 | 21 | -10.5% |
| 10 | 67 | 19 | 20 | -5.3% |
| 10 | 87 | 19 | 16 | 15.8% |
| 10 | 137 | 19 | 17 | 10.5% |
| 20 | 57 | 30 | 30 | 0.0% |
| 20 | 77 | 30 | 28 | 6.7% |
| 20 | 97 | 30 | 21 | 30.0% |
| 20 | 147 | 30 | 25 | 16.7% |
| 35 | 72 | 41 | 47 | -14.6% |
| 35 | 92 | 41 | 40 | 2.4% |
| 35 | 112 | 41 | 41 | 0.0% |
| 35 | 162 | 41 | 37 | 9.8% |
| 50 | 87 | 52 | 50 | 3.8% |
| 50 | 107 | 52 | 50 | 3.8% |
| 50 | 127 | 52 | 46 | 11.5% |
| 50 | 177 | 52 | 43 | 17.3% |
| 80 | 117 | 85 | 80 | 5.9% |
| 80 | 137 | 85 | 73 | 14.1% |
| 80 | 157 | 85 | 80 | 5.9% |
| 80 | 207 | 85 | 77 | 9.4% |

## Player→Enemy (stat-only mitigation)
| EnemyDEF | PlayerDmg(ATK40) |
| --- | --- |
| 0 | 40 |
| 10 | 38 |
| 30 | 34 |
| 50 | 31 |
| 100 | 26 |

## Findings
- +30 DEF ≈ 8-12% total taken reduction at mid levels
- HP-proportional portion ignores DEF → armor legs/feet feel weak
- Phase2: reduce HP roll weight or increase def coefficient (0.52 → higher)