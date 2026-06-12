# Town Implementation Audit

Generated: 2026-06-12T21:30:58.890Z

| Lv | 街 | 移動 | 探索 | 敵 | loot | shop | facility | 状態 | 必要性 | コメント |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | はじまりの星原 | YES | YES | YES | YES | YES | A | 中 |  |
| 3 | 古道の宿場村 | YES | YES | YES | YES | YES | A | 中 |  |
| 5 | 薄明の港町 | YES | YES | YES | YES | YES | A | 中 |  |
| 8 | 雨音の廃村 | YES | YES | YES | YES | MIN | A | 中 |  |
| 10 | 白銀鉱山街 | YES | YES | YES | YES | YES | A | 高 |  |
| 12 | 祈りの丘 | NO | NO | NO | YES | MIN | D | 低 | placeholder — list非表示候補 |
| 15 | 霧深き森の集落 | YES | YES | YES | YES | YES | A | 中 |  |
| 18 | 空鐘の町 | NO | NO | NO | YES | MIN | D | 低 | placeholder — list非表示候補 |
| 20 | 月下図書館 | YES | YES | YES | YES | MIN | A | 中 |  |
| 22 | 埋没水路 | NO | NO | NO | YES | MIN | D | 低 | placeholder — list非表示候補 |
| 25 | 忘却の地下市 | YES | YES | YES | YES | YES | A | 中 |  |
| 30 | 砂時計の都 | YES | YES | YES | YES | MIN | A | 中 |  |
| 35 | 灰冠の王都跡 | YES | YES | YES | YES | MIN | A | 中 |  |
| 38 | 硝子沼の集落 | YES | YES | YES | YES | MIN | A | 中 |  |
| 40 | 竜骨の峡谷 | YES | YES | YES | YES | MIN | A | 中 |  |
| 42 | 赤灰の砦 | YES | YES | YES | YES | MIN | A | 中 |  |
| 45 | 沈黙の修道院 | YES | YES | YES | YES | MIN | A | 中 |  |
| 48 | 鉄雪の関所 | NO | NO | NO | YES | MIN | D | 低 | placeholder — list非表示候補 |
| 50 | 深層炉前哨基地 | YES | YES | YES | YES | YES | A | 中 |  |
| 52 | 黒灯りの路地 | YES | YES | YES | YES | MIN | B | 高 | エリア2件 |
| 55 | 星落ちの観測所 | YES | YES | YES | YES | MIN | A | 高 |  |
| 80 | 空中要塞ヴァルハラ | YES | YES | YES | YES | YES | A | 高 |  |

## 問題街
- 祈りの丘 / 空鐘 / 埋没水路 / 鉄雪 — 探索なし
- 黒灯り — Uni素材導線上だがエリア2のみ