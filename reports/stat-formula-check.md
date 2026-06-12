# Stat Formula Check

Generated: 2026-06-12T21:30:29.548Z

## Current formula (recalculatePlayerStats)
- Base: HP 100+(Lv-1)*15, ATK/MAG 10+(Lv-1)*2, DEF/SPI/SPD 8+(Lv-1)*1
- MP: baseMaxMpFromLevel + scaledJobMpMod(main) + floor(sub*0.4)
- Job: **multiplier** via jobMultiplierMaster (Phase2 implemented)
- Sub: multiplier stacked on base
- Equipment + set % applied after

### Current — 剣士 (main only)
| Lv | ATK | MAG | DEF | HP | MP |
| --- | --- | --- | --- | --- | --- |
| 1 | 18 | 10 | 12 | 110 | 31 |
| 20 | 56 | 48 | 31 | 395 | 94 |
| 50 | 116 | 108 | 61 | 845 | 207 |
| 70 | 156 | 148 | 81 | 1145 | 292 |
| 80 | 176 | 168 | 91 | 1295 | 337 |
| 100 | 216 | 208 | 111 | 1595 | 432 |

### Current — 魔術師 (main only)
| Lv | ATK | MAG | DEF | HP | MP |
| --- | --- | --- | --- | --- | --- |
| 1 | 10 | 22 | 8 | 95 | 42 |
| 20 | 48 | 60 | 27 | 380 | 106 |
| 50 | 108 | 120 | 57 | 830 | 223 |
| 70 | 148 | 160 | 77 | 1130 | 309 |
| 80 | 168 | 180 | 87 | 1280 | 354 |
| 100 | 208 | 220 | 107 | 1580 | 449 |

### Current — 重騎士 (main only)
| Lv | ATK | MAG | DEF | HP | MP |
| --- | --- | --- | --- | --- | --- |
| 1 | 14 | 10 | 20 | 120 | 23 |
| 20 | 52 | 48 | 39 | 405 | 84 |
| 50 | 112 | 108 | 69 | 855 | 196 |
| 70 | 152 | 148 | 89 | 1155 | 279 |
| 80 | 172 | 168 | 99 | 1305 | 324 |
| 100 | 212 | 208 | 119 | 1605 | 419 |

## Phase2 implemented (jobMultiplierMaster, equipment excluded)
Formula: floor(base × main × sub) — 巡礼者/繋ぎ手 example with 魔術師+灰術士
| Lv | ATK | MAG | DEF | HP | MP |
| --- | --- | --- | --- | --- | --- |
| 1 | 5 | 17 | 5 | 70 | 43 |
| 20 | 28 | 83 | 18 | 270 | 138 |
| 50 | 63 | 187 | 40 | 586 | 312 |
| 70 | 86 | 257 | 54 | 796 | 441 |
| 80 | 98 | 292 | 61 | 902 | 510 |
| 100 | 121 | 361 | 75 | 1112 | 657 |