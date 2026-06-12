import type Database from 'better-sqlite3';
import { AREAS } from '../db/seedData/areas';
import { STARTER_WEAPON_IDS } from '../db/seedData/jobStarterWeapons';
import {
  EXCLUDED_EQUIPMENT,
  EXCLUDED_SERIES,
  KAI_FORGE_WEAPON_IDS,
  RAID_ONLY_ITEMS,
  inferClassification,
  shouldBeObtainable,
  type EquipmentClassification,
} from '../db/seedData/equipmentClassification';
import { getShopCatalogItemIds } from '../systems/shopSystem';

export type RouteKind =
  | 'shop'
  | 'area_pool'
  | 'monster_drop'
  | 'boss_drop'
  | 'rematch_drop'
  | 'kai_forge'
  | 'src_forge'
  | 'valhalla'
  | 'raid'
  | 'legacy'
  | 'excluded'
  | 'start';

export type EquipmentAuditRow = {
  item_id: string;
  name: string;
  category: string;
  slot: string;
  rarity: string;
  set_id: string;
  series_skill_id: string;
  series_skill_name: string;
  set_bonus_steps: string;
  required_piece_count: number;
  available_piece_count: number;
  missing_piece_ids: string;
  series_obtainable: string;
  series_classification: string;
  series_excluded_reason: string;
  current_obtainable: 'YES' | 'NO';
  current_sources: string;
  classification: EquipmentClassification;
  should_be_obtainable: 'YES' | 'NO';
  excluded_reason: string;
  recommended_route: string;
  implemented_route: string;
  notes: string;
};

type RouteHit = { kind: RouteKind; label: string };

function buildRouteIndex(db: Database.Database): Map<string, RouteHit[]> {
  const routes = new Map<string, RouteHit[]>();
  const add = (id: string, hit: RouteHit) => {
    const list = routes.get(id) ?? [];
    if (!list.some((h) => h.kind === hit.kind && h.label === hit.label)) list.push(hit);
    routes.set(id, list);
  };

  for (const area of AREAS) {
    for (const reward of area.rewards) {
      add(reward, { kind: 'area_pool', label: `探索：${area.name}` });
    }
  }

  for (const [townId, ids] of Object.entries(getShopCatalogItemIds())) {
    for (const id of ids) {
      add(id, { kind: 'shop', label: `ショップ：${townId}` });
    }
  }

  for (const id of STARTER_WEAPON_IDS) {
    add(id, { kind: 'start', label: 'ジョブ開始武器（序盤探索プール注入）' });
  }
  add('wpn_traveler_sword', { kind: 'start', label: '冒険開始時' });

  for (const id of KAI_FORGE_WEAPON_IDS) {
    add(id, { kind: 'kai_forge', label: 'カイ伝承（Uni昇華）' });
  }

  const srcRows = db.prepare('SELECT base_item_id, src_item_id, name FROM src_weapons').all() as Array<{
    base_item_id: string; src_item_id: string; name: string;
  }>;
  for (const s of srcRows) {
    add(s.base_item_id, { kind: 'kai_forge', label: `Uni基礎 → ${s.name}` });
    add(s.src_item_id, { kind: 'src_forge', label: `Src変質：${s.name}` });
  }

  for (const id of RAID_ONLY_ITEMS) {
    add(id, { kind: 'raid', label: 'レイド報酬' });
  }

  for (const [id, ex] of Object.entries(EXCLUDED_EQUIPMENT)) {
    add(id, { kind: ex.classification === 'legacy' ? 'legacy' : 'excluded', label: ex.reason });
  }

  const monsters = db.prepare('SELECT name, drop_pool_json FROM monsters').all() as Array<{ name: string; drop_pool_json: string }>;
  for (const m of monsters) {
    const drops = JSON.parse(m.drop_pool_json || '[]') as Array<{ item_id: string }>;
    for (const d of drops) {
      if (d.item_id.startsWith('wpn_') || d.item_id.startsWith('arm_') || d.item_id.startsWith('acc_')) {
        add(d.item_id, { kind: 'monster_drop', label: `魔物：${m.name}` });
      }
    }
  }

  for (const a of AREAS) {
    for (const r of a.rewards) {
      if (r.startsWith('boss_')) {
        add(r, { kind: 'boss_drop', label: `探索ボス報酬：${a.name}` });
      }
    }
  }

  const valhallaAreas = AREAS.filter((a) => a.town === 'valhalla_fortress');
  for (const a of valhallaAreas) {
    for (const r of a.rewards) {
      if (r.startsWith('wpn_') || r.startsWith('arm_')) {
        add(r, { kind: 'valhalla', label: `ヴァルハラ：${a.name}` });
      }
    }
  }

  return routes;
}

function parseAcquisitionStatus(acquisitionJson: string | null): { status?: string; reason?: string } {
  if (!acquisitionJson) return {};
  try {
    const parsed = JSON.parse(acquisitionJson) as { status?: string; reason?: string; sources?: unknown[] };
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { status: parsed.status, reason: parsed.reason };
    }
  } catch { /* ignore */ }
  return {};
}

function seriesInfo(db: Database.Database, seriesId: string | null): {
  skillId: string;
  skillName: string;
  bonusSteps: string;
  requiredPieceCount: number;
  totalPieces: number;
  pieceIds: string[];
} {
  if (!seriesId) {
    return { skillId: '', skillName: '', bonusSteps: '', requiredPieceCount: 0, totalPieces: 0, pieceIds: [] };
  }
  const bonuses = db.prepare(`
    SELECT piece_count, effect_description FROM equipment_set_bonuses WHERE set_id = ? ORDER BY piece_count
  `).all(seriesId) as Array<{ piece_count: number; effect_description: string }>;
  const pieces = db.prepare(`
    SELECT item_id FROM equipment WHERE series_id = ? ORDER BY slot
  `).all(seriesId) as Array<{ item_id: string }>;
  const setRow = db.prepare('SELECT name FROM equipment_sets WHERE id = ?').get(seriesId) as { name: string } | undefined;
  const minStep = bonuses[0]?.piece_count ?? 2;
  return {
    skillId: seriesId,
    skillName: setRow?.name ?? seriesId,
    bonusSteps: bonuses.map((b) => `${b.piece_count}:${b.effect_description}`).join(' | '),
    requiredPieceCount: minStep,
    totalPieces: pieces.length,
    pieceIds: pieces.map((p) => p.item_id),
  };
}

export function runEquipmentAcquisitionAudit(db: Database.Database): {
  rows: EquipmentAuditRow[];
  seriesSummary: Array<{
    set_id: string;
    name: string;
    total_pieces: number;
    obtainable_pieces: number;
    missing_ids: string[];
    classification: string;
    excluded_reason: string;
  }>;
  stats: Record<string, number>;
} {
  const routeIndex = buildRouteIndex(db);
  const equipRows = db.prepare(`
    SELECT i.id, i.name, i.category, i.rarity, i.acquisition_json,
      e.slot, e.series_id, e.is_unique, e.skill_id
    FROM items i JOIN equipment e ON i.id = e.item_id
    WHERE e.slot IN ('weapon','head','body','arms','legs','feet','accessory1','accessory2','shield')
    ORDER BY i.category, e.slot, i.rarity, i.id
  `).all() as Array<{
    id: string; name: string; category: string; rarity: string; acquisition_json: string | null;
    slot: string; series_id: string | null; is_unique: number; skill_id: string | null;
  }>;

  const auditRows: EquipmentAuditRow[] = [];
  const setObtainableCount = new Map<string, { total: number; ok: number; missing: string[]; name: string }>();

  for (const row of equipRows) {
    const routes = routeIndex.get(row.id) ?? [];
    const playableRoutes = routes.filter((r) => r.kind !== 'legacy' && r.kind !== 'excluded');
    const obtainable = playableRoutes.length > 0;
    const ex = EXCLUDED_EQUIPMENT[row.id] ?? (row.series_id ? EXCLUDED_SERIES[row.series_id] : undefined);
    const shouldOb = shouldBeObtainable(row.id, row.series_id);
    const classification = inferClassification({
      itemId: row.id,
      rarity: row.rarity,
      seriesId: row.series_id,
      slot: row.slot,
      isUnique: row.is_unique,
      obtainable,
    });

    const si = seriesInfo(db, row.series_id);
    if (row.series_id) {
      const cur = setObtainableCount.get(row.series_id) ?? {
        total: si.totalPieces, ok: 0, missing: [] as string[], name: si.skillName,
      };
      if (shouldOb && obtainable) cur.ok++;
      else if (shouldOb) cur.missing.push(row.id);
      setObtainableCount.set(row.series_id, cur);
    }

    const acqStatus = parseAcquisitionStatus(row.acquisition_json);
    auditRows.push({
      item_id: row.id,
      name: row.name,
      category: row.category,
      slot: row.slot,
      rarity: row.rarity,
      set_id: row.series_id ?? '',
      series_skill_id: si.skillId,
      series_skill_name: si.skillName,
      set_bonus_steps: si.bonusSteps,
      required_piece_count: si.requiredPieceCount,
      available_piece_count: row.series_id
        ? (setObtainableCount.get(row.series_id)?.ok ?? (obtainable ? 1 : 0))
        : 0,
      missing_piece_ids: '',
      series_obtainable: '',
      series_classification: row.series_id ? (EXCLUDED_SERIES[row.series_id]?.classification ?? 'playable') : '',
      series_excluded_reason: EXCLUDED_SERIES[row.series_id ?? '']?.reason ?? '',
      current_obtainable: obtainable ? 'YES' : 'NO',
      current_sources: routes.map((r) => `${r.kind}:${r.label}`).join(' / '),
      classification: ex?.classification ?? classification,
      should_be_obtainable: shouldOb ? 'YES' : 'NO',
      excluded_reason: ex?.reason ?? acqStatus.reason ?? '',
      recommended_route: ex ? 'legacy/excluded' : guessRecommendedRoute(row.rarity, row.slot, row.series_id),
      implemented_route: playableRoutes.map((r) => r.kind).join('+') || 'none',
      notes: acqStatus.status === 'legacy' ? 'acquisition_json=legacy' : '',
    });
  }

  // Fill series-level fields on each row
  const seriesSummary = [...setObtainableCount.entries()].map(([setId, v]) => ({
    set_id: setId,
    name: v.name,
    total_pieces: v.total,
    obtainable_pieces: v.ok,
    missing_ids: v.missing,
    classification: EXCLUDED_SERIES[setId]?.classification ?? 'playable',
    excluded_reason: EXCLUDED_SERIES[setId]?.reason ?? '',
  }));

  for (const row of auditRows) {
    if (!row.set_id) continue;
    const ss = seriesSummary.find((s) => s.set_id === row.set_id);
    if (!ss) continue;
    row.available_piece_count = ss.obtainable_pieces;
    row.missing_piece_ids = ss.missing_ids.join(';');
    row.series_obtainable = ss.missing_ids.length === 0 && ss.obtainable_pieces >= ss.total_pieces ? 'YES' : 'NO';
  }

  const weapons = auditRows.filter((r) => r.slot === 'weapon');
  const armor = auditRows.filter((r) => ['head', 'body', 'arms', 'legs', 'feet'].includes(r.slot));
  const playableWeapons = weapons.filter((r) => r.should_be_obtainable === 'YES');
  const playableArmor = armor.filter((r) => r.should_be_obtainable === 'YES');

  const stats: Record<string, number> = {
    total_weapons: weapons.length,
    playable_target_weapons: playableWeapons.length,
    obtainable_weapons: playableWeapons.filter((r) => r.current_obtainable === 'YES').length,
    legacy_excluded_weapons: weapons.filter((r) => r.should_be_obtainable === 'NO').length,
    unknown_weapons: weapons.filter((r) => r.classification === 'unknown').length,
    total_armor: armor.length,
    playable_target_armor: playableArmor.length,
    obtainable_armor: playableArmor.filter((r) => r.current_obtainable === 'YES').length,
    legacy_excluded_armor: armor.filter((r) => r.should_be_obtainable === 'NO').length,
    unknown_armor: armor.filter((r) => r.classification === 'unknown').length,
    total_series: seriesSummary.length,
    playable_series: seriesSummary.filter((s) => !EXCLUDED_SERIES[s.set_id]).length,
    full_series_obtainable: seriesSummary.filter((s) => s.missing_ids.length === 0).length,
    partial_series: seriesSummary.filter((s) => s.missing_ids.length > 0 && !EXCLUDED_SERIES[s.set_id]).length,
    unobtainable_playable: auditRows.filter((r) => r.should_be_obtainable === 'YES' && r.current_obtainable === 'NO').length,
    unknown_total: auditRows.filter((r) => r.classification === 'unknown').length,
  };

  return { rows: auditRows, seriesSummary, stats };
}

function guessRecommendedRoute(rarity: string, slot: string, seriesId: string | null): string {
  if (rarity === 'Uni') return 'kai_forge';
  if (rarity === 'Src') return 'src_forge';
  if (seriesId) return 'area_pool+shop';
  if (rarity === 'UR') return 'valhalla+boss_drop';
  if (rarity === 'SSR') return 'area_pool+boss_drop';
  if (slot === 'weapon' && rarity === 'N') return 'shop+area_pool+start';
  return 'area_pool+shop';
}

export function auditRowsToCsv(rows: EquipmentAuditRow[]): string {
  const headers = [
    'item_id', 'name', 'category', 'slot', 'rarity', 'set_id',
    'series_skill_id', 'series_skill_name', 'set_bonus_steps',
    'required_piece_count', 'available_piece_count', 'missing_piece_ids',
    'series_obtainable', 'series_classification', 'series_excluded_reason',
    'current_obtainable', 'current_sources', 'classification',
    'should_be_obtainable', 'excluded_reason', 'recommended_route',
    'implemented_route', 'notes',
  ];
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h as keyof EquipmentAuditRow] as string | number)).join(','))].join('\n');
}

export function formatAuditMarkdown(
  stats: Record<string, number>,
  rows: EquipmentAuditRow[],
  seriesSummary: ReturnType<typeof runEquipmentAcquisitionAudit>['seriesSummary'],
): string {
  const unobtainable = rows.filter((r) => r.should_be_obtainable === 'YES' && r.current_obtainable === 'NO');
  const legacy = rows.filter((r) => r.should_be_obtainable === 'NO');
  const unknown = rows.filter((r) => r.classification === 'unknown');
  const duplicates = rows.filter((r) => r.classification === 'duplicate');
  const partialSeries = seriesSummary.filter((s) => s.missing_ids.length > 0);

  const lines = [
    '# equipment-completion-audit',
    '',
    '## サマリー',
    '',
    `| 指標 | 値 |`,
    `| --- | --- |`,
    `| 全武器数 | ${stats.total_weapons} |`,
    `| 通常プレイ対象武器数 | ${stats.playable_target_weapons} |`,
    `| 入手可能武器数 | ${stats.obtainable_weapons} |`,
    `| legacy/excluded武器数 | ${stats.legacy_excluded_weapons} |`,
    `| 未分類武器数 | ${stats.unknown_weapons} |`,
    `| 全防具数 | ${stats.total_armor} |`,
    `| 通常プレイ対象防具数 | ${stats.playable_target_armor} |`,
    `| 入手可能防具数 | ${stats.obtainable_armor} |`,
    `| legacy/excluded防具数 | ${stats.legacy_excluded_armor} |`,
    `| 未分類防具数 | ${stats.unknown_armor} |`,
    `| 全シリーズ数 | ${stats.total_series} |`,
    `| 通常プレイ対象シリーズ数 | ${stats.playable_series} |`,
    `| 全必要部位入手可能シリーズ数 | ${stats.full_series_obtainable} |`,
    `| 通常プレイ対象で入手不可 | ${stats.unobtainable_playable} |`,
    `| unknown分類合計 | ${stats.unknown_total} |`,
    '',
    '## 通常プレイ対象で入手不可',
    '',
    ...(unobtainable.length
      ? unobtainable.map((r) => `- \`${r.item_id}\` ${r.name} (${r.rarity}/${r.slot}) — 推奨:${r.recommended_route}`)
      : ['(なし)']),
    '',
    '## legacy/excluded',
    '',
    ...(legacy.length
      ? legacy.map((r) => `- \`${r.item_id}\` [${r.classification}] ${r.excluded_reason || r.name}`)
      : ['(なし)']),
    '',
    '## duplicate',
    '',
    ...(duplicates.length
      ? duplicates.map((r) => `- \`${r.item_id}\` ${r.excluded_reason}`)
      : ['(なし)']),
    '',
    '## unknown',
    '',
    ...(unknown.length ? unknown.map((r) => `- \`${r.item_id}\` ${r.name}`) : ['(なし)']),
    '',
    '## 一部部位欠けシリーズ',
    '',
    ...(partialSeries.length
      ? partialSeries.map((s) => `- \`${s.set_id}\` ${s.name}: 欠け ${s.missing_ids.join(', ')}`)
      : ['(なし)']),
    '',
    '## arms/legs/feet 配置',
    '',
  ];

  for (const slot of ['arms', 'legs', 'feet'] as const) {
    const slotRows = rows.filter((r) => r.slot === slot && r.should_be_obtainable === 'YES');
    const ok = slotRows.filter((r) => r.current_obtainable === 'YES').length;
    lines.push(`- ${slot}: ${ok}/${slotRows.length} 入手可能`);
  }

  return lines.join('\n');
}

export function collectAuditFailures(rows: EquipmentAuditRow[], seriesSummary: ReturnType<typeof runEquipmentAcquisitionAudit>['seriesSummary']): string[] {
  const issues: string[] = [];
  for (const r of rows) {
    if (r.should_be_obtainable === 'YES' && r.current_obtainable === 'NO') {
      issues.push(`入手不可: ${r.item_id} (${r.name})`);
    }
    if (r.classification === 'unknown') issues.push(`unknown: ${r.item_id}`);
    if (r.should_be_obtainable === 'NO' && !r.excluded_reason) {
      issues.push(`legacy/excluded理由なし: ${r.item_id}`);
    }
    if (r.classification === 'duplicate' && !r.excluded_reason) {
      issues.push(`duplicate理由なし: ${r.item_id}`);
    }
  }
  for (const s of seriesSummary) {
    if (EXCLUDED_SERIES[s.set_id]) continue;
    if (s.missing_ids.length > 0) {
      issues.push(`セット部位不足: ${s.set_id} → ${s.missing_ids.join(', ')}`);
    }
  }
  return issues;
}
