/** town-implementation-audit — npx tsx scripts/town-implementation-audit.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { AREAS } from '../src/db/seedData/areas';
import { getShopCatalog } from '../src/systems/shopSystem';
import { getFacilitiesForTown } from '../src/systems/facilitySystem';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';

function main() {
  ensureMaterialsSeed(getDb());
  ensurePhase2Seed(getDb());
  const db = getDb();

  const towns = db.prepare('SELECT id, name, required_level FROM towns ORDER BY required_level').all() as Array<{
    id: string; name: string; required_level: number;
  }>;

  const areasByTown = new Map<string, typeof AREAS>();
  for (const a of AREAS) {
    if (!areasByTown.has(a.town)) areasByTown.set(a.town, []);
    areasByTown.get(a.town)!.push(a);
  }

  const headers = ['lv', 'name', 'move', 'explore', 'enemies', 'loot', 'shop', 'facility', 'boss', 'status', 'priority', 'comment'];
  const rows: string[][] = [];

  for (const t of towns) {
    const areas = areasByTown.get(t.id) ?? [];
    const explore = areas.length > 0 ? 'YES' : 'NO';
    const enemies = areas.some((a) => a.monsters.length) ? 'YES' : 'NO';
    const loot = areas.some((a) => a.rewards.length) ? 'YES' : 'NO';
    const shop = getShopCatalog(t.id).length > 0 ? 'YES' : 'NO';
    const fac = getFacilitiesForTown(t.id);
    const facility = fac.length > 2 ? 'YES' : fac.length ? 'MIN' : 'NO';

    let status = 'A';
    let priority = '中';
    let comment = '';

    if (!areas.length) {
      status = 'D';
      priority = '保留';
      comment = '探索エリアなし';
    } else if (areas.length <= 2) {
      status = 'B';
      priority = t.id === 'black_lantern_lane' ? '高' : '中';
      comment = `エリア${areas.length}件`;
    } else if (shop === 'NO' && facility === 'MIN') {
      status = 'B';
      comment = '探索のみ厚み薄';
    }

    if (t.id === 'valhalla_fortress' || t.id === 'starfall_observatory' || t.id === 'silver_mine') {
      status = 'A';
      priority = '高';
    }
    if (['prayer_hill', 'hollow_bell_town', 'buried_aqueduct', 'iron_snow_post'].includes(t.id)) {
      status = 'D';
      priority = '低';
      comment = 'placeholder — list非表示候補';
    }

    rows.push([
      String(t.required_level), t.name, 'YES', explore, enemies, loot, shop, facility, 'story',
      status, priority, comment,
    ]);
  }

  const md = [
    '# Town Implementation Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    mdTable(['Lv', '街', '移動', '探索', '敵', 'loot', 'shop', 'facility', '状態', '必要性', 'コメント'],
      rows.map((r) => [r[0]!, r[1]!, r[3]!, r[4]!, r[5]!, r[6]!, r[7]!, r[9]!, r[10]!, r[11]!])),
    '',
    '## 問題街',
    '- 祈りの丘 / 空鐘 / 埋没水路 / 鉄雪 — 探索なし',
    '- 黒灯り — Uni素材導線上だがエリア2のみ',
  ].join('\n');

  writeReport('town-implementation-audit.md', md);
  writeCsv('town-implementation-audit.csv', headers, rows);
  console.log('✅ town-implementation-audit → reports/town-implementation-audit.{md,csv}');
}

main();
