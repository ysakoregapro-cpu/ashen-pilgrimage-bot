/**
 * 強化/変質ルート — Uni/Src の派生元・素材・素材入手先（/weapon /armor 図鑑・監査共通）
 */
import { getDb } from '../db/database';
import { KAI_FORGE_WEAPON_IDS } from '../db/seedData/equipmentClassification';
import { JOB_STARTER_WEAPONS, STARTER_UNIQUE_TARGETS } from '../db/seedData/jobStarterWeapons';
import {
  FURNACE_KEEPER_BOSS_ID,
  UNI_JOB_MATERIALS,
  UNI_SRC_DROP_TRIGGER_RATE,
  UNI_SRC_MATERIAL_IDS,
} from '../db/seedData/jobProgressionMaster';
import { awakeningLabel, MAX_AWAKENING_LEVEL } from '../db/seedData/awakeningMaster';
import {
  SRC_FORGE_ECHO_QTY,
  SRC_FORGE_GOLD_COST,
  SRC_FORGE_MATERIAL_DROP_RATE,
  SRC_FORGE_MATERIAL_ID,
  SRC_FARM_MONSTER_IDS,
} from '../db/seedData/forgeMaster';

const UNIQUE_TO_STARTER = Object.fromEntries(
  Object.entries(STARTER_UNIQUE_TARGETS).map(([starter, uni]) => [uni, starter]),
);
const STARTER_TO_JOB = Object.fromEntries(
  Object.entries(JOB_STARTER_WEAPONS).map(([job, starter]) => [starter, job]),
);

const WEAPON_TYPE_JOB: Record<string, string> = {
  sword: '剣士',
  hammer: '重騎士',
  bow: '狩人',
  staff: '魔術師',
  rod: '祈祷師',
  dagger: '斥候',
  cannon: '機工師',
  fist: '格闘士',
  spear: '剣士',
  shield: '重騎士',
  bind: '巡礼者',
  tuner: '魔術師',
};

const FURNACE_KEEPER_NAME = '炉熱の番人';

export type MaterialSourceLine = {
  materialId: string;
  materialName: string;
  summary: string;
  rateText?: string;
};

export type ForgeRouteDisplay = {
  routeType: 'kai_uni' | 'kai_src' | null;
  baseEquipmentId: string | null;
  baseEquipmentName: string | null;
  requirementText: string | null;
  requiredMaterials: Array<{ id: string; name: string; qty: number }>;
  materialSources: MaterialSourceLine[];
  selfReferenceBug: boolean;
  hasForgeRoute: boolean;
};

function itemName(itemId: string): string {
  const row = getDb().prepare('SELECT name FROM items WHERE id = ?').get(itemId) as { name: string } | undefined;
  return row?.name ?? itemId;
}

function monsterName(monsterId: string): string {
  const row = getDb().prepare('SELECT name FROM monsters WHERE id = ?').get(monsterId) as { name: string } | undefined;
  return row?.name ?? monsterId;
}

function inferJobForUniWeapon(uniId: string, weaponType: string | null): string | null {
  const starter = UNIQUE_TO_STARTER[uniId];
  if (starter) return STARTER_TO_JOB[starter] ?? null;

  const srcRow = getDb().prepare(`
    SELECT jobs_json FROM src_weapons WHERE base_item_id = ?
  `).get(uniId) as { jobs_json: string } | undefined;
  if (srcRow) {
    try {
      const jobs = JSON.parse(srcRow.jobs_json) as string[];
      for (const job of jobs) {
        if (UNI_JOB_MATERIALS[job]) return job;
      }
    } catch { /* ignore */ }
  }

  if (weaponType && WEAPON_TYPE_JOB[weaponType]) {
    const job = WEAPON_TYPE_JOB[weaponType]!;
    if (UNI_JOB_MATERIALS[job]) return job;
  }
  return null;
}

function genericUniMaterialPoolSource(): MaterialSourceLine {
  return {
    materialId: 'uni_material_pool',
    materialName: '職別伝承素材',
    summary: `${FURNACE_KEEPER_NAME} 再戦（16種プール）`,
    rateText: `初回撃破: 1個確定 / 再戦: ${(UNI_SRC_DROP_TRIGGER_RATE * 100).toFixed(0)}%で16種から1個`,
  };
}

function furnaceKeeperMaterialSource(materialId: string): MaterialSourceLine {
  const perPick = UNI_SRC_DROP_TRIGGER_RATE / UNI_SRC_MATERIAL_IDS.length;
  const pct = (perPick * 100).toFixed(2);
  return {
    materialId,
    materialName: itemName(materialId),
    summary: `${FURNACE_KEEPER_NAME} 再戦`,
    rateText: `初回撃破: 16種から1個確定 / 再戦: 28%発生後16種抽選（この素材 約${pct}%/再戦）`,
  };
}

function srcEchoMaterialSource(): MaterialSourceLine {
  const labels = SRC_FARM_MONSTER_IDS.map((id) => monsterName(id)).join(' / ');
  return {
    materialId: SRC_FORGE_MATERIAL_ID,
    materialName: itemName(SRC_FORGE_MATERIAL_ID),
    summary: `深層炉前哨・ヴァルハラ周回（${labels}）再戦`,
    rateText: `${(SRC_FORGE_MATERIAL_DROP_RATE * 100).toFixed(0)}%`,
  };
}

function monsterDropMaterialSource(materialId: string): MaterialSourceLine | null {
  const monsters = getDb().prepare(`
    SELECT id, name, drop_pool_json, is_boss FROM monsters
  `).all() as Array<{ id: string; name: string; drop_pool_json: string; is_boss: number }>;

  const hits: string[] = [];
  for (const m of monsters) {
    const drops = JSON.parse(m.drop_pool_json || '[]') as Array<{ item_id: string; weight: number }>;
    const poolTotal = drops.reduce((s, d) => s + d.weight, 0) || 1;
    const hit = drops.find((d) => d.item_id === materialId);
    if (hit) {
      const rate = ((hit.weight / poolTotal) * 100).toFixed(1);
      hits.push(`${m.name}${m.is_boss ? ' 再戦' : ''} ${rate}%`);
    }
  }
  if (!hits.length) return null;
  return {
    materialId,
    materialName: itemName(materialId),
    summary: hits.slice(0, 3).join(' / '),
    rateText: hits.length > 3 ? `ほか${hits.length - 3}件` : undefined,
  };
}

export function getMaterialSourceLines(materialIds: string[]): MaterialSourceLine[] {
  const out: MaterialSourceLine[] = [];
  const seen = new Set<string>();

  for (const matId of materialIds) {
    if (seen.has(matId)) continue;
    seen.add(matId);

    if (UNI_SRC_MATERIAL_IDS.includes(matId)) {
      out.push(furnaceKeeperMaterialSource(matId));
      continue;
    }
    if (matId === SRC_FORGE_MATERIAL_ID) {
      out.push(srcEchoMaterialSource());
      continue;
    }

    const drop = monsterDropMaterialSource(matId);
    if (drop) {
      out.push(drop);
      continue;
    }

    const meta = getDb().prepare('SELECT source_text FROM items WHERE id = ?').get(matId) as { source_text: string | null } | undefined;
    out.push({
      materialId: matId,
      materialName: itemName(matId),
      summary: meta?.source_text ?? '入手先データなし',
    });
  }
  return out;
}

export function getForgeRouteDisplay(equipmentId: string): ForgeRouteDisplay | null {
  const meta = getDb().prepare(`
    SELECT i.name, i.rarity, e.weapon_type, e.src_weapon_id
    FROM items i
    LEFT JOIN equipment e ON i.id = e.item_id
    WHERE i.id = ?
  `).get(equipmentId) as {
    name: string; rarity: string; weapon_type: string | null; src_weapon_id: string | null;
  } | undefined;
  if (!meta) return null;

  if (meta.rarity === 'Src' || equipmentId.startsWith('wpn_src_')) {
    const srcRow = getDb().prepare(`
      SELECT base_item_id, src_item_id, name FROM src_weapons WHERE src_item_id = ?
    `).get(equipmentId) as { base_item_id: string; src_item_id: string; name: string } | undefined;
    if (!srcRow) return null;

    const baseName = itemName(srcRow.base_item_id);
    const selfReferenceBug = srcRow.base_item_id === equipmentId;

    return {
      routeType: 'kai_src',
      baseEquipmentId: srcRow.base_item_id,
      baseEquipmentName: baseName,
      requirementText: `Uni武器 + ${SRC_FORGE_GOLD_COST}G`,
      requiredMaterials: [{
        id: SRC_FORGE_MATERIAL_ID,
        name: itemName(SRC_FORGE_MATERIAL_ID),
        qty: SRC_FORGE_ECHO_QTY,
      }],
      materialSources: getMaterialSourceLines([SRC_FORGE_MATERIAL_ID]),
      selfReferenceBug,
      hasForgeRoute: true,
    };
  }

  if (KAI_FORGE_WEAPON_IDS.has(equipmentId) || meta.rarity === 'Uni') {
    const starterId = UNIQUE_TO_STARTER[equipmentId];
    const job = inferJobForUniWeapon(equipmentId, meta.weapon_type);
    const matReq = job ? UNI_JOB_MATERIALS[job] : undefined;
    const materials = matReq
      ? [
        { id: matReq.mat1, name: itemName(matReq.mat1), qty: matReq.qty },
        { id: matReq.mat2, name: itemName(matReq.mat2), qty: matReq.qty },
      ]
      : [];

    return {
      routeType: 'kai_uni',
      baseEquipmentId: starterId ?? null,
      baseEquipmentName: starterId ? itemName(starterId) : (job ? `${job}系の職業武器` : null),
      requirementText: `${awakeningLabel(MAX_AWAKENING_LEVEL)} + 白銀の章クリア後（カイの炉）`,
      requiredMaterials: materials,
      materialSources: materials.length
        ? getMaterialSourceLines(materials.map((m) => m.id))
        : [genericUniMaterialPoolSource()],
      selfReferenceBug: false,
      hasForgeRoute: true,
    };
  }

  return null;
}

export function formatForgeRouteDisplayLines(equipmentId: string): string[] {
  const forge = getForgeRouteDisplay(equipmentId);
  if (!forge?.hasForgeRoute) return [];

  const lines: string[] = ['【強化/変質】'];

  if (forge.routeType === 'kai_src') {
    lines.push('Src変質（カイの炉）');
    if (forge.baseEquipmentName) lines.push(`・派生元: ${forge.baseEquipmentName}`);
    if (forge.requirementText) lines.push(`・必要条件: ${forge.requirementText}`);
    if (forge.requiredMaterials.length) {
      lines.push(`・必要素材: ${forge.requiredMaterials.map((m) => `${m.name} ×${m.qty}`).join(' / ')}`);
    }
  } else {
    lines.push('・カイ伝承（Uni昇華）');
    if (forge.baseEquipmentName) lines.push(`・派生元: ${forge.baseEquipmentName}`);
    if (forge.requirementText) lines.push(`・必要条件: ${forge.requirementText}`);
    if (forge.requiredMaterials.length) {
      lines.push(`・必要素材: ${forge.requiredMaterials.map((m) => `${m.name} ×${m.qty}`).join(' / ')}`);
    } else {
      lines.push('・必要素材: 職別素材（カイの炉で確認）');
    }
  }

  if (forge.materialSources.length) {
    lines.push('', '【素材入手先】');
    for (const src of forge.materialSources) {
      const rate = src.rateText ? `（${src.rateText}）` : '';
      lines.push(`・${src.materialName}: ${src.summary}${rate}`);
    }
  }

  return lines;
}

/** 監査用 — 武器の直接入手ルート件数 */
export function countWeaponDirectRoutes(equipmentId: string, routes: Array<{ kind: string }>): {
  explore: number;
  shop: number;
  enemyDrop: number;
  bossFirstClear: number;
  bossRematch: number;
  exchange: number;
  forge: number;
  unavailable: number;
} {
  const isDirectWeaponRoute = (kind: string) => {
    if (kind === 'forge' || kind === 'special' || kind === 'unavailable') return false;
    return true;
  };

  return {
    explore: routes.filter((r) => r.kind === 'explore').length,
    shop: routes.filter((r) => r.kind === 'shop').length,
    enemyDrop: routes.filter((r) => r.kind === 'enemy_drop').length,
    bossFirstClear: routes.filter((r) => r.kind === 'boss_first_clear').length,
    bossRematch: routes.filter((r) => r.kind === 'boss_rematch' || r.kind === 'valhalla_boss').length,
    exchange: routes.filter((r) => r.kind === 'exchange_random' || r.kind === 'exchange_select').length,
    forge: routes.filter((r) => r.kind === 'forge').length,
    unavailable: routes.filter((r) => r.kind === 'unavailable').length,
  };
}

export function weaponHasDirectEnemyOrBossDrop(routes: Array<{ kind: string }>): {
  enemy: boolean;
  bossRematch: boolean;
} {
  return {
    enemy: routes.some((r) => r.kind === 'enemy_drop'),
    bossRematch: routes.some((r) => r.kind === 'boss_rematch' || r.kind === 'valhalla_boss'),
  };
}
