import type Database from 'better-sqlite3';
import { getMonsterElementDef, getMonsterExpTierMult } from './monsterElementMaster';
import { getEquipmentElementDef, ACQUISITION_OVERRIDES, formatAcquisitionHint, type AcquisitionSource, type AcquisitionJson } from './equipmentMaster';
import { EXCLUDED_EQUIPMENT, KAI_FORGE_WEAPON_IDS } from './equipmentClassification';
import { SKILL_ELEMENT_DEFAULTS } from './skillEffectMaster';
import { normalizeElement } from './elementMaster';
import { AREAS } from './areas';

function addColumn(db: Database.Database, table: string, column: string, def: string): void {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  } catch { /* exists */ }
}

/** Build acquisition map from area rewards + monster drops */
function buildAcquisitionMap(db: Database.Database): Map<string, AcquisitionSource[]> {
  const map = new Map<string, AcquisitionSource[]>();

  const add = (itemId: string, src: AcquisitionSource) => {
    const list = map.get(itemId) ?? [];
    if (!list.some((s) => s.type === src.type && s.detail === src.detail)) list.push(src);
    map.set(itemId, list);
  };

  for (const [id, sources] of Object.entries(ACQUISITION_OVERRIDES) as Array<[string, AcquisitionSource[]]>) {
    map.set(id, [...sources]);
  }

  for (const area of AREAS) {
    for (const reward of area.rewards) {
      add(reward, { type: 'drop_area', detail: `${area.name}（${area.town}）` });
    }
  }

  const monsters = db.prepare('SELECT id, name, area_tag, drop_pool_json FROM monsters').all() as Array<{
    id: string; name: string; area_tag: string; drop_pool_json: string;
  }>;
  for (const m of monsters) {
    const drops = JSON.parse(m.drop_pool_json || '[]') as Array<{ item_id: string }>;
    for (const d of drops) {
      add(d.item_id, { type: 'drop_monster', detail: `${m.name}（${m.area_tag}）` });
    }
  }

  const srcRows = db.prepare('SELECT base_item_id, src_item_id, name FROM src_weapons').all() as Array<{
    base_item_id: string; src_item_id: string; name: string;
  }>;
  for (const s of srcRows) {
    add(s.base_item_id, { type: 'kai_forge', detail: `Uni基礎 → ${s.name}` });
    add(s.src_item_id, { type: 'src_forge', detail: `Src変質：${s.name}` });
  }

  for (const id of KAI_FORGE_WEAPON_IDS) {
    add(id, { type: 'kai_forge', detail: 'カイ伝承（Uni昇華）' });
  }

  return map;
}

export function ensureMasterDataSeed(db: Database.Database): void {
  addColumn(db, 'equipment', 'element', "TEXT DEFAULT 'neutral'");
  addColumn(db, 'equipment', 'resistances_json', 'TEXT');
  addColumn(db, 'monsters', 'weaknesses_json', 'TEXT');
  addColumn(db, 'monsters', 'resistances_json', 'TEXT');
  addColumn(db, 'players', 'explore_actions_since_town', 'INTEGER DEFAULT 0');
  addColumn(db, 'items', 'acquisition_json', 'TEXT');

  // Monster elements, weaknesses, EXP tuning (idempotent absolute values)
  const updMon = db.prepare(`
    UPDATE monsters SET element = ?, weaknesses_json = ?, resistances_json = ?, exp_reward = ?
    WHERE id = ?
  `);
  const monsters = db.prepare('SELECT id, area_tag, level, exp_reward, is_boss FROM monsters').all() as Array<{
    id: string; area_tag: string; level: number; exp_reward: number; is_boss: number;
  }>;
  for (const m of monsters) {
    const def = getMonsterElementDef(m.id, m.area_tag);
    const mult = getMonsterExpTierMult(m.area_tag);
    const baseExp = Math.floor((8 + m.level * 3.8) * mult);
    const scaledExp = m.is_boss ? Math.floor(baseExp * 2.5) : baseExp;
    updMon.run(
      def.element,
      JSON.stringify(def.weaknesses),
      JSON.stringify(def.resistances),
      scaledExp,
      m.id,
    );
  }

  // Equipment elements
  const updEq = db.prepare(`UPDATE equipment SET element = ?, resistances_json = ? WHERE item_id = ?`);
  const equip = db.prepare(`
    SELECT e.item_id, e.series_id, e.weapon_type, e.slot FROM equipment e
  `).all() as Array<{ item_id: string; series_id: string | null; weapon_type: string | null; slot: string }>;
  for (const e of equip) {
    const def = getEquipmentElementDef(e.item_id, e.series_id, e.weapon_type, e.slot);
    updEq.run(def.element, JSON.stringify(def.resistances), e.item_id);
  }

  // Skill element normalization
  const updSkill = db.prepare(`UPDATE skills SET element = ? WHERE id = ?`);
  for (const [skillId, el] of Object.entries(SKILL_ELEMENT_DEFAULTS)) {
    updSkill.run(el, skillId);
  }
  const skills = db.prepare(`SELECT id, element FROM skills WHERE element IS NOT NULL`).all() as Array<{ id: string; element: string }>;
  for (const s of skills) {
    updSkill.run(normalizeElement(s.element), s.id);
  }
  db.prepare(`UPDATE skills SET element = 'neutral' WHERE element IS NULL`).run();

  // Acquisition hints on items
  const acqMap = buildAcquisitionMap(db);
  const updItem = db.prepare(`UPDATE items SET acquisition_json = ?, source_text = COALESCE(source_text, ?) WHERE id = ?`);
  for (const [itemId, sources] of acqMap) {
    const ex = EXCLUDED_EQUIPMENT[itemId];
    let payload: AcquisitionJson;
    if (ex) {
      payload = { sources: [], status: ex.classification === 'legacy' ? 'legacy' : 'excluded', reason: ex.reason };
    } else {
      payload = { sources };
    }
    const hint = ex ? '現在通常入手不可' : formatAcquisitionHint(sources);
    updItem.run(JSON.stringify(payload), hint.split(' / ')[0]?.replace(/^[^:]+:/, '') ?? '探索', itemId);
  }
  // Ensure all equipment has at least generic source
  db.prepare(`
    UPDATE items SET acquisition_json = '{"sources":[{"type":"drop_area","detail":"探索・ボス・店"}]}',
      source_text = COALESCE(source_text, '探索・店')
    WHERE category = 'equipment' AND (acquisition_json IS NULL OR acquisition_json = '')
  `).run();
  db.prepare(`
    UPDATE items SET acquisition_json = '[{"type":"drop_area","detail":"探索"}]',
      source_text = COALESCE(source_text, '探索')
    WHERE category IN ('material','common_material','area_material','upgrade_stone','boss_material')
      AND (acquisition_json IS NULL OR acquisition_json = '')
  `).run();
}
