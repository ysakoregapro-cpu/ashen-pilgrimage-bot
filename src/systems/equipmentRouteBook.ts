import { getDb } from '../db/database';
import { JOB_STARTER_WEAPONS } from '../db/seedData/jobStarterWeapons';
import { EXCLUDED_EQUIPMENT } from '../db/seedData/equipmentClassification';
import { runEquipmentAcquisitionAudit } from './equipmentAcquisitionAudit';
import {
  formatEquipmentRouteLines,
  clearEquipmentRouteDetailCache,
} from './equipmentRouteDetailSystem';
import { SLOT_LABELS } from '../types';

export type RouteBookEntry = {
  item_id: string;
  name: string;
  rarity: string;
  slot: string;
  weapon_type: string | null;
  required_job: string | null;
  series_id: string | null;
  series_name: string | null;
  obtainable: boolean;
  legacy: boolean;
  attack: number;
  magic: number;
  defense: number;
  hp: number;
  mp: number;
  speed: number;
};

export type BookCategory = { id: string; label: string };

const WEAPON_TYPE_LABELS: Record<string, string> = {
  sword: '剣', dagger: '短剣', axe: '斧', bow: '弓', staff: '杖', rod: '短杖',
  fist: '拳', spear: '槍', cannon: '機工砲', shield: '盾', spell_staff: '魔導杖', hammer: '槌',
};

const WEAPON_CATEGORIES: Array<{ id: string; label: string; jobs: string[]; types: string[] }> = [
  { id: 'sword', label: '剣士 / 剣', jobs: ['剣士'], types: ['sword'] },
  { id: 'heavy', label: '重騎士 / 盾・重武器', jobs: ['重騎士'], types: ['axe', 'hammer', 'spear', 'shield'] },
  { id: 'hunter', label: '狩人 / 弓', jobs: ['狩人'], types: ['bow'] },
  { id: 'mage', label: '魔術師 / 杖', jobs: ['魔術師'], types: ['staff', 'spell_staff'] },
  { id: 'priest', label: '祈祷師 / 短杖', jobs: ['祈祷師'], types: ['rod'] },
  { id: 'scout', label: '斥候 / 短剣', jobs: ['斥候'], types: ['dagger'] },
  { id: 'engineer', label: '機工師 / 砲', jobs: ['機工師'], types: ['cannon'] },
  { id: 'fighter', label: '格闘士 / 拳', jobs: ['格闘士'], types: ['fist'] },
  { id: 'other', label: 'その他 / 特殊', jobs: [], types: [] },
];

const SPECIAL_ARMOR_SERIES = new Set(['set_valhalla', 'set_old_king']);
const NOSERIES_RARITIES = ['N', 'R', 'SR', 'SSR', 'UR'] as const;

let cachedAudit: ReturnType<typeof runEquipmentAcquisitionAudit> | null = null;

function loadAudit(db: ReturnType<typeof getDb>) {
  if (!cachedAudit) cachedAudit = runEquipmentAcquisitionAudit(db);
  return cachedAudit;
}

function queryWeapons(db: ReturnType<typeof getDb>): RouteBookEntry[] {
  const rows = db.prepare(`
    SELECT i.id, i.name, i.rarity, e.slot, e.weapon_type, e.required_job, e.series_id,
      es.name AS series_name,
      e.attack_bonus, e.magic_bonus, e.defense_bonus, e.hp_bonus, e.mp_bonus, e.speed_bonus
    FROM items i
    JOIN equipment e ON i.id = e.item_id
    LEFT JOIN equipment_sets es ON e.series_id = es.id
    WHERE e.slot = 'weapon' AND i.category = 'equipment'
    ORDER BY i.rarity DESC, i.name
  `).all() as Array<Record<string, unknown>>;

  const audit = loadAudit(db);
  return rows.map((w) => {
    const id = w.id as string;
    const ex = EXCLUDED_EQUIPMENT[id];
    const auditRow = audit.rows.find((r) => r.item_id === id);
    return {
      item_id: id,
      name: w.name as string,
      rarity: w.rarity as string,
      slot: 'weapon',
      weapon_type: (w.weapon_type as string | null) ?? null,
      required_job: (w.required_job as string | null) ?? null,
      series_id: (w.series_id as string | null) ?? null,
      series_name: (w.series_name as string | null) ?? null,
      obtainable: auditRow?.current_obtainable === 'YES',
      legacy: ex?.classification === 'legacy' || auditRow?.classification === 'legacy',
      attack: (w.attack_bonus as number) ?? 0,
      magic: (w.magic_bonus as number) ?? 0,
      defense: (w.defense_bonus as number) ?? 0,
      hp: (w.hp_bonus as number) ?? 0,
      mp: (w.mp_bonus as number) ?? 0,
      speed: (w.speed_bonus as number) ?? 0,
    };
  });
}

function queryArmor(db: ReturnType<typeof getDb>): RouteBookEntry[] {
  const rows = db.prepare(`
    SELECT i.id, i.name, i.rarity, e.slot, e.weapon_type, e.required_job, e.series_id,
      es.name AS series_name,
      e.attack_bonus, e.magic_bonus, e.defense_bonus, e.hp_bonus, e.mp_bonus, e.speed_bonus
    FROM items i
    JOIN equipment e ON i.id = e.item_id
    LEFT JOIN equipment_sets es ON e.series_id = es.id
    WHERE i.category = 'equipment' AND e.slot IN ('head','body','arms','legs','feet','accessory1','accessory2','shield')
    ORDER BY i.rarity DESC, i.name
  `).all() as Array<Record<string, unknown>>;

  const audit = loadAudit(db);
  return rows.map((a) => {
    const id = a.id as string;
    const ex = EXCLUDED_EQUIPMENT[id];
    const auditRow = audit.rows.find((r) => r.item_id === id);
    return {
      item_id: id,
      name: a.name as string,
      rarity: a.rarity as string,
      slot: a.slot as string,
      weapon_type: null,
      required_job: (a.required_job as string | null) ?? null,
      series_id: (a.series_id as string | null) ?? null,
      series_name: (a.series_name as string | null) ?? null,
      obtainable: auditRow?.current_obtainable === 'YES',
      legacy: ex?.classification === 'legacy' || auditRow?.classification === 'legacy',
      attack: (a.attack_bonus as number) ?? 0,
      magic: (a.magic_bonus as number) ?? 0,
      defense: (a.defense_bonus as number) ?? 0,
      hp: (a.hp_bonus as number) ?? 0,
      mp: (a.mp_bonus as number) ?? 0,
      speed: (a.speed_bonus as number) ?? 0,
    };
  });
}

function starterJobForWeapon(itemId: string): string | undefined {
  for (const [job, id] of Object.entries(JOB_STARTER_WEAPONS)) {
    if (id === itemId) return job;
  }
  return undefined;
}

function weaponCategoryId(entry: RouteBookEntry): string {
  const starterJob = starterJobForWeapon(entry.item_id);
  const job = entry.required_job ?? starterJob ?? '';
  for (const cat of WEAPON_CATEGORIES) {
    if (cat.id === 'other') continue;
    if (cat.jobs.some((j) => job.includes(j))) return cat.id;
    if (entry.weapon_type && cat.types.includes(entry.weapon_type)) return cat.id;
  }
  return 'other';
}

function armorCategoryId(entry: RouteBookEntry): string {
  if (entry.series_id === 'set_valhalla' || entry.item_id.includes('valhalla')) return 'set_valhalla';
  if (entry.series_id === 'set_old_king' || entry.item_id.includes('old_king')) return 'set_old_king';
  if (entry.series_id) return entry.series_id;
  if (NOSERIES_RARITIES.includes(entry.rarity as typeof NOSERIES_RARITIES[number])) {
    return `noseries_${entry.rarity}`;
  }
  return 'other_armor';
}

export function getWeaponRouteBook(): RouteBookEntry[] {
  return queryWeapons(getDb());
}

export function getArmorRouteBook(): RouteBookEntry[] {
  return queryArmor(getDb());
}

export function getWeaponBookCategories(): BookCategory[] {
  return WEAPON_CATEGORIES.map((c) => ({ id: c.id, label: c.label }));
}

export function getArmorBookCategories(): BookCategory[] {
  const db = getDb();
  const sets = db.prepare(`
    SELECT id, name FROM equipment_sets
    WHERE id NOT IN ('set_valhalla', 'set_old_king')
    ORDER BY name
  `).all() as Array<{ id: string; name: string }>;

  const cats: BookCategory[] = sets.map((s) => ({ id: s.id, label: `${s.name}シリーズ` }));
  cats.push({ id: 'set_valhalla', label: 'ヴァルハラ系' });
  cats.push({ id: 'set_old_king', label: '旧王系' });
  for (const r of NOSERIES_RARITIES) {
    cats.push({ id: `noseries_${r}`, label: `シリーズなし ${r}` });
  }
  cats.push({ id: 'other_armor', label: 'その他' });
  return cats;
}

export function weaponsInCategory(categoryId: string): RouteBookEntry[] {
  return getWeaponRouteBook().filter((w) => weaponCategoryId(w) === categoryId);
}

export function armorsInCategory(categoryId: string): RouteBookEntry[] {
  return getArmorRouteBook().filter((a) => armorCategoryId(a) === categoryId);
}

export function formatRouteProbability(rate: string): string {
  if (!rate || rate === '—') return '';
  if (rate.includes('%')) return rate;
  if (/^pool weight \d+/i.test(rate) || /^w\d+/.test(rate)) return '低確率';
  if (rate === 'weighted pool' || rate === 'weighted') return '低確率';
  return rate;
}

export function buildEquipmentRouteLines(itemId: string): string[] {
  return formatEquipmentRouteLines(itemId);
}

export { getEquipmentRouteDetails, formatEquipmentRouteLines } from './equipmentRouteDetailSystem';

export function formatWeaponFamilyLabel(entry: RouteBookEntry): string {
  const cat = WEAPON_CATEGORIES.find((c) => c.id === weaponCategoryId(entry));
  const typeLabel = entry.weapon_type ? (WEAPON_TYPE_LABELS[entry.weapon_type] ?? entry.weapon_type) : '';
  const job = entry.required_job ?? starterJobForWeapon(entry.item_id) ?? '';
  if (job && typeLabel) return `${job} / ${typeLabel}`;
  return cat?.label ?? typeLabel ?? 'その他';
}

export function formatArmorSeriesLabel(entry: RouteBookEntry): string {
  if (entry.series_id === 'set_valhalla') return 'ヴァルハラ';
  if (entry.series_id === 'set_old_king') return '旧王';
  if (entry.series_name) return entry.series_name;
  return '—';
}

export function formatEquipmentStatSummary(entry: RouteBookEntry): string {
  const parts: string[] = [];
  if (entry.attack) parts.push(`攻+${entry.attack}`);
  if (entry.magic) parts.push(`魔+${entry.magic}`);
  if (entry.defense) parts.push(`防+${entry.defense}`);
  if (entry.hp) parts.push(`HP+${entry.hp}`);
  if (entry.mp) parts.push(`MP+${entry.mp}`);
  if (entry.speed) parts.push(`速+${entry.speed}`);
  return parts.length ? parts.join(' / ') : '—';
}

export function formatSlotLabel(slot: string): string {
  return SLOT_LABELS[slot as keyof typeof SLOT_LABELS] ?? slot;
}

/** 監査・コマンド共通 — 全武器ID */
export function listAllWeaponIds(): string[] {
  return getWeaponRouteBook().map((w) => w.item_id);
}

/** 監査・コマンド共通 — 全防具ID */
export function listAllArmorIds(): string[] {
  return getArmorRouteBook().map((a) => a.item_id);
}

export function clearRouteBookCache(): void {
  cachedAudit = null;
  clearEquipmentRouteDetailCache();
}
