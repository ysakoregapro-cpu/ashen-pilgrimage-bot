import { getDb } from '../db/database';

export type ActiveSetBonusTier = {
  piece_count: number;
  effect_description: string;
};

export type EquippedSetSummary = {
  set_id: string;
  set_name: string;
  equipped_count: number;
  total_pieces: number;
  active_bonuses: ActiveSetBonusTier[];
  /** true when equipment_set_bonuses rows exist for this set */
  has_bonus_definition: boolean;
};

const MAX_DISPLAY_SETS = 5;

/** Count equipped pieces per series_id (player_equipment only). */
export function getEquippedSetCounts(userId: string): Record<string, number> {
  const rows = getDb().prepare(`
    SELECT e.series_id FROM player_equipment pe
    JOIN player_inventory pi ON pe.inventory_id = pi.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pe.user_id = ? AND e.series_id IS NOT NULL
  `).all(userId) as Array<{ series_id: string }>;
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.series_id] = (counts[row.series_id] ?? 0) + 1;
  return counts;
}

function loadSetMeta(setId: string) {
  const db = getDb();
  const set = db.prepare('SELECT name FROM equipment_sets WHERE id = ?').get(setId) as { name: string } | undefined;
  const totalRow = db.prepare('SELECT COUNT(*) AS c FROM equipment WHERE series_id = ?').get(setId) as { c: number };
  const defCount = db.prepare('SELECT COUNT(*) AS c FROM equipment_set_bonuses WHERE set_id = ?').get(setId) as { c: number };
  return {
    set_name: set?.name ?? setId,
    total_pieces: totalRow.c,
    has_bonus_definition: defCount.c > 0,
  };
}

/** Active tiers use the same threshold as stat calculation: piece_count <= equipped_count. */
function loadActiveBonuses(setId: string, equippedCount: number): ActiveSetBonusTier[] {
  return getDb().prepare(`
    SELECT piece_count, effect_description FROM equipment_set_bonuses
    WHERE set_id = ? AND piece_count <= ?
    ORDER BY piece_count
  `).all(setId, equippedCount) as ActiveSetBonusTier[];
}

export function getEquippedSetSummary(userId: string, opts?: { maxSets?: number }): EquippedSetSummary[] {
  const maxSets = opts?.maxSets ?? MAX_DISPLAY_SETS;
  const counts = getEquippedSetCounts(userId);
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, maxSets);

  const summaries: EquippedSetSummary[] = [];
  for (const [setId, equippedCount] of sorted) {
    const meta = loadSetMeta(setId);
    const activeBonuses = loadActiveBonuses(setId, equippedCount);
    if (!activeBonuses.length && meta.has_bonus_definition) continue;
    if (!activeBonuses.length && !meta.has_bonus_definition && equippedCount > 0) {
      summaries.push({
        set_id: setId,
        set_name: meta.set_name,
        equipped_count: equippedCount,
        total_pieces: meta.total_pieces,
        active_bonuses: [],
        has_bonus_definition: false,
      });
      continue;
    }
    if (activeBonuses.length) {
      summaries.push({
        set_id: setId,
        set_name: meta.set_name,
        equipped_count: equippedCount,
        total_pieces: meta.total_pieces,
        active_bonuses: activeBonuses,
        has_bonus_definition: meta.has_bonus_definition,
      });
    }
  }
  return summaries;
}

function formatSetBlock(summary: EquippedSetSummary): string {
  const total = summary.total_pieces > 0 ? summary.total_pieces : '?';
  const header = `${summary.set_name} ${summary.equipped_count}/${total}`;
  if (!summary.has_bonus_definition) {
    return `${header}\n・シリーズ装備中`;
  }
  const tiers = summary.active_bonuses.map((b) => `・${b.piece_count}部位：${b.effect_description}`);
  return [header, ...tiers].join('\n');
}

/** Flat lines (legacy). */
export function formatActiveSetBonusLines(userId: string): string[] {
  return getEquippedSetSummary(userId).flatMap((s) => {
    const block = formatSetBlock(s).split('\n');
    return block;
  });
}

/** Body text for embed fields (なし when empty). */
export function formatActiveSetBonusBody(userId: string): string {
  const summaries = getEquippedSetSummary(userId);
  if (!summaries.length) return 'なし';
  return summaries.map(formatSetBlock).join('\n\n').slice(0, 1024);
}

/** Full section for plain-text blocks (equipment/prep views). */
export function buildActiveSetBonusSection(userId: string): string {
  return ['発動中のセット効果', '', formatActiveSetBonusBody(userId)].join('\n');
}

/** @deprecated use formatActiveSetBonusBody — kept for existing imports */
export function getActiveSetEffectLinesCompat(userId: string): string[] {
  const lines: string[] = [];
  for (const s of getEquippedSetSummary(userId)) {
    lines.push(`**${s.set_name}** (${s.equipped_count}/${s.total_pieces || '?'})`);
    if (!s.has_bonus_definition) {
      lines.push('  シリーズ装備中');
      continue;
    }
    for (const b of s.active_bonuses) lines.push(`  ${b.piece_count}部位: ${b.effect_description}`);
  }
  return lines;
}
