/**
 * export-guide-data.ts — 攻略/管理用 CSV 出力
 * npx tsx scripts/export-guide-data.ts
 */
import fs from 'fs';
import path from 'path';
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { buildItemPurposeCatalog } from '../src/db/seedData/itemPurposeMaster';
import { EXCLUDED_EQUIPMENT } from '../src/db/seedData/equipmentClassification';
import { runEquipmentAcquisitionAudit } from '../src/systems/equipmentAcquisitionAudit';
import {
  JOB_TRIO_MAP,
  TRIAL_ENEMY_NAMES,
  SUB_JOB_UNLOCK_LEVEL,
  ADVANCED_JOB_UNLOCK_LEVEL,
} from '../src/db/seedData/jobProgressionMaster';
import { BASIC_MAIN_JOBS, PHASE2_SUB_JOBS, PHASE2_ADVANCED_MAIN_JOBS } from '../src/db/seedData/jobMultiplierMaster';
import { AREAS } from '../src/db/seedData/areas';
import { buildDropEconomyRows, getNamedHighRarityAudits } from './audit/dropEconomyIndex';
import { writeCsv } from './audit/reportWriter';

const GUIDE_DIR = path.join(process.cwd(), 'reports', 'guide');

function ensureGuideDir() {
  fs.mkdirSync(GUIDE_DIR, { recursive: true });
}

function cell(v: unknown): string {
  return v == null ? '' : String(v);
}

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);
  ensureGuideDir();

  const purposeCatalog = buildItemPurposeCatalog(db);
  const { rows: equipAudit, stats: equipStats } = runEquipmentAcquisitionAudit(db);
  const dropRows = buildDropEconomyRows();
  const namedDrops = getNamedHighRarityAudits();

  // --- items.csv ---
  const itemHeaders = [
    'item_id', 'name', 'rarity', 'purpose', 'category', 'effect_summary', 'value_sell_price',
    'is_consumable', 'is_material', 'is_legacy', 'is_reserved_future', 'normal_drop_allowed',
    'boss_drop_allowed', 'raid_drop_allowed', 'source_summary', 'progression_tier',
    'estimated_rate_per_100', 'risk', 'notes',
  ];
  const itemsDb = db.prepare(`
    SELECT id, name, rarity, category, description, sell_price, usage_text, battle_effect_json
    FROM items WHERE category NOT IN ('skill', 'quest') ORDER BY id
  `).all() as Array<Record<string, unknown>>;
  const dropById = new Map(dropRows.map((r) => [r.item_id, r]));
  const itemRows = itemsDb.map((item) => {
    const p = purposeCatalog.find((c) => c.id === item.id);
    const drop = dropById.get(String(item.id));
    const cat = String(item.category);
    return [
      item.id, item.name, item.rarity,
      p?.purpose ?? '', cat,
      cell(item.description || item.usage_text),
      item.sell_price,
      cat === 'consumable' ? 'YES' : 'NO',
      cat !== 'equipment' && cat !== 'consumable' ? 'YES' : 'NO',
      p?.purpose === 'legacy' ? 'YES' : 'NO',
      p?.purpose === 'reserved_future' ? 'YES' : 'NO',
      p?.shouldDropInNormalPool ? 'YES' : 'NO',
      p?.shouldDropInBossPool ? 'YES' : 'NO',
      p?.shouldDropInRaidPool ? 'YES' : 'NO',
      drop?.area_sources || drop?.boss_sources || drop?.shop_sources || p?.sinkDescription || '',
      p?.progressionTier ?? '',
      drop?.estimated_rate_band ?? '',
      p?.risk ?? '',
      p?.notes ?? '',
    ].map(cell);
  });
  writeCsv('guide/items.csv', itemHeaders, itemRows);

  // --- equipment.csv ---
  const equipHeaders = [
    'equipment_id', 'name', 'rarity', 'slot', 'weapon_type', 'series_id', 'set_id', 'set_name',
    'set_bonus_summary', 'hp', 'mp', 'attack', 'magic', 'defense', 'speed', 'crit',
    'max_upgrade_level', 'awakening_eligible', 'max_awakening_level', 'sell_price', 'purpose',
    'source_summary', 'progression_tier', 'estimated_rate_per_100', 'legacy_or_excluded',
    'obtainable', 'notes',
  ];
  const equipDb = db.prepare(`
    SELECT e.*, i.name, i.rarity, i.sell_price, i.description,
      es.name AS set_name
    FROM equipment e
    JOIN items i ON e.item_id = i.id
    LEFT JOIN equipment_sets es ON e.series_id = es.id
    ORDER BY e.item_id
  `).all() as Array<Record<string, unknown>>;
  const auditById = new Map(equipAudit.map((r) => [r.item_id, r]));
  const equipCsvRows = equipDb.map((e) => {
    const audit = auditById.get(String(e.item_id));
    const bonuses = db.prepare(`
      SELECT piece_count, effect_description FROM equipment_set_bonuses WHERE set_id = ? ORDER BY piece_count
    `).all(e.series_id) as Array<{ piece_count: number; effect_description: string }>;
    const bonusSummary = bonuses.map((b) => `${b.piece_count}:${b.effect_description}`).join(' | ');
    const ex = EXCLUDED_EQUIPMENT[String(e.item_id)];
    const drop = dropById.get(String(e.item_id));
    return [
      e.item_id, e.name, e.rarity, e.slot, e.weapon_type ?? '',
      e.series_id ?? '', e.series_id ?? '', e.set_name ?? '',
      bonusSummary,
      e.hp_bonus, e.mp_bonus, e.attack_bonus, e.magic_bonus, e.defense_bonus, e.speed_bonus, e.crit_rate_bonus,
      e.max_upgrade_level, ['SR', 'SSR', 'UR'].includes(String(e.rarity)) ? 'YES' : 'NO', 5,
      e.sell_price, audit?.classification ?? 'playable_gear',
      audit?.current_sources ?? drop?.area_sources ?? '',
      drop?.progression_tier ?? '',
      drop?.estimated_rate_band ?? '',
      ex ? `${ex.classification}:${ex.reason}` : 'NO',
      audit?.current_obtainable ?? '',
      audit?.notes ?? cell(e.description),
    ].map(cell);
  });
  writeCsv('guide/equipment.csv', equipHeaders, equipCsvRows);

  // --- equipment_sets.csv ---
  const setHeaders = [
    'set_id', 'set_name', 'pieces', 'required_slots', 'piece_equipment_ids', 'piece_names',
    'bonus_2', 'bonus_3', 'bonus_4', 'bonus_5', 'source_summary', 'notes',
  ];
  const sets = db.prepare('SELECT id, name, description FROM equipment_sets ORDER BY id').all() as Array<{ id: string; name: string; description: string }>;
  const setRows = sets.map((s) => {
    const pieces = db.prepare(`
      SELECT e.item_id, i.name, e.slot FROM equipment e JOIN items i ON e.item_id = i.id
      WHERE e.series_id = ? ORDER BY e.slot, e.item_id
    `).all(s.id) as Array<{ item_id: string; name: string; slot: string }>;
    const bonuses = db.prepare(`
      SELECT piece_count, effect_description FROM equipment_set_bonuses WHERE set_id = ? ORDER BY piece_count
    `).all(s.id) as Array<{ piece_count: number; effect_description: string }>;
    const bMap = Object.fromEntries(bonuses.map((b) => [b.piece_count, b.effect_description]));
    const audit = equipAudit.find((r) => r.set_id === s.id);
    return [
      s.id, s.name, pieces.length,
      [...new Set(pieces.map((p) => p.slot))].join(';'),
      pieces.map((p) => p.item_id).join(';'),
      pieces.map((p) => p.name).join(';'),
      bMap[2] ?? '', bMap[3] ?? '', bMap[4] ?? '', bMap[5] ?? '',
      audit?.current_sources ?? '',
      s.description ?? '',
    ].map(cell);
  });
  writeCsv('guide/equipment_sets.csv', setHeaders, setRows);

  // --- drop_routes.csv ---
  const dropHeaders = [
    'target_id', 'target_name', 'target_type', 'rarity', 'purpose', 'route_type', 'area_id',
    'area_name', 'town', 'rank', 'min_level', 'enemy_id', 'enemy_name', 'pool', 'weight',
    'drop_rate', 'estimated_rate_per_100', 'first_clear_guaranteed', 'repeatable', 'notes',
  ];
  const dropRouteRows: string[][] = [];
  for (const n of namedDrops) {
    dropRouteRows.push([
      n.item_id, n.name, 'item', n.rarity, '',
      n.sources.includes('boss') ? 'boss' : 'area',
      '', '', '', '', '', '', '',
      n.sources, n.weight, '', n.estimated_rate_per_100, '', 'YES', n.recommendation,
    ].map(cell));
  }
  for (const area of AREAS) {
    const townRow = db.prepare('SELECT name FROM towns WHERE id = ?').get(area.town) as { name: string } | undefined;
    const townName = townRow?.name ?? area.town;
    for (const reward of area.rewards) {
      const item = db.prepare('SELECT name, rarity, category FROM items WHERE id = ?').get(reward) as { name: string; rarity: string; category: string } | undefined;
      if (!item) continue;
      const drop = dropById.get(reward);
      dropRouteRows.push([
        reward, item.name, item.category, item.rarity,
        drop?.current_purpose ?? '', 'explore_pool', area.id, area.name, townName,
        String(area.min), String(area.min), '', '',
        `area:${area.id}`, drop?.estimated_weight ?? '', '', drop?.estimated_rate_band ?? '',
        '', 'YES', '',
      ].map(cell));
    }
  }
  writeCsv('guide/drop_routes.csv', dropHeaders, dropRouteRows);

  // --- job_unlocks.csv ---
  const jobHeaders = ['job_id', 'job_name', 'job_type', 'unlock_condition', 'required_job', 'required_level', 'trial_required', 'advanced_job', 'notes'];
  const jobRows: string[][] = [];
  for (const main of BASIC_MAIN_JOBS) {
    const trio = JOB_TRIO_MAP[main];
    jobRows.push([
      `job_${main}`, main, 'main', 'start / selectable', '', '1', 'NO', trio?.advanced ?? '', `sub: ${trio?.sub ?? ''}`,
    ].map(cell));
    if (trio) {
      jobRows.push([
        `job_${trio.sub}`, trio.sub, 'sub', `base JobLv${SUB_JOB_UNLOCK_LEVEL}`, main, String(SUB_JOB_UNLOCK_LEVEL), 'NO', '', '',
      ].map(cell));
      jobRows.push([
        `job_${trio.advanced}`, trio.advanced, 'advanced', `trial JobLv${ADVANCED_JOB_UNLOCK_LEVEL}+valhalla`, main, String(ADVANCED_JOB_UNLOCK_LEVEL), 'YES', trio.advanced, '',
      ].map(cell));
    }
  }
  for (const sub of PHASE2_SUB_JOBS) {
    if (!jobRows.some((r) => r[1] === sub)) {
      jobRows.push([`job_${sub}`, sub, 'sub', `base JobLv${SUB_JOB_UNLOCK_LEVEL}`, '', String(SUB_JOB_UNLOCK_LEVEL), 'NO', '', ''].map(cell));
    }
  }
  writeCsv('guide/job_unlocks.csv', jobHeaders, jobRows);

  // --- trials.csv ---
  const trialHeaders = [
    'trial_id', 'trial_name', 'base_job', 'advanced_job', 'unlock_condition', 'required_job_level',
    'enemy_id', 'enemy_name', 'difficulty_summary', 'reward_summary', 'clear_flag', 'notes',
  ];
  const trialRows = Object.entries(JOB_TRIO_MAP).map(([base, trio]) => [
    `trial_${base}`, TRIAL_ENEMY_NAMES[base] ?? `${base}の現身`, base, trio.advanced,
    `JobLv${ADVANCED_JOB_UNLOCK_LEVEL}+valhalla`, String(ADVANCED_JOB_UNLOCK_LEVEL),
    `trial_${base}`, TRIAL_ENEMY_NAMES[base] ?? '', 'solo trial battle', `unlock ${trio.advanced}`,
    `advanced_unlock:${trio.advanced}`, '',
  ].map(cell));
  writeCsv('guide/trials.csv', trialHeaders, trialRows);

  const readme = `# Guide Data Export

Generated: ${new Date().toISOString()}

## Files

| File | Contents |
|------|----------|
| items.csv | 全アイテム（装備以外含む）の用途・価値・入手・推定レート |
| equipment.csv | 全装備パラメータ・セット・入手・legacy/excluded |
| equipment_sets.csv | 18シリーズのセット効果一覧 |
| drop_routes.csv | 探索pool・名指し高レア・ボス経路 |
| job_unlocks.csv | 基本9 / サブ9 / 上級9 の解放条件 |
| trials.csv | 現身の試練9種 |

## 見方（攻略用）

- **estimated_rate_per_100**: 探索100回あたりの期待入手数（監査推定）。母数は \`drop-economy-audit\` の pool weight 合算。
- **legacy/excluded**: \`equipmentClassification\` / \`itemPurposeMaster\` 準拠。通常プレイ対象外。
- **obtainable**: equipment acquisition audit の current_obtainable。
- 実プレイドロップは章進行・難易度で微調整される — 本CSVは設計監査値。

## 注意

- drop rate / estimated_rate_per_100 は監査上の推定値であり、本番で完全一致しない場合があります。
- acc_raid_random 等 collection 用途装備も obtainable=YES なら equipment 付与対象に含まれます。
`;
  fs.writeFileSync(path.join(GUIDE_DIR, 'README.md'), readme, 'utf8');

  console.log('# export-guide-data');
  console.log(`items: ${itemRows.length}`);
  console.log(`equipment: ${equipCsvRows.length}`);
  console.log(`sets: ${setRows.length} (audit total_series=${equipStats.total_series})`);
  console.log(`drop_routes: ${dropRouteRows.length}`);
  console.log(`job_unlocks: ${jobRows.length}`);
  console.log(`trials: ${trialRows.length}`);
  console.log(`→ reports/guide/*.csv + README.md`);
}

main();
