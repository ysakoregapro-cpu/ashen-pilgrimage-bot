/**
 * 探索ボス初回遭遇 / 撃破後除外 / 再戦表示 — 単一ソース
 */
import { getDb } from '../db/database';
import { STORY_BOSS_MONSTERS } from '../db/seedData/storyData';
import { REMATCH_MATERIAL_BOSSES } from '../db/seedData/forgeMaster';
import { VALHALLA_BOSS_MONSTER_IDS } from '../db/seedData/valhallaRewardMaster';
import { FURNACE_KEEPER_BOSS_ID, UNI_SRC_DROP_TRIGGER_RATE } from '../db/seedData/jobProgressionMaster';
import { BOSS_VICTORY_MATERIAL_DROPS } from '../db/seedData/dropBalanceMaster';
import type { UiPayload } from '../utils/townUi';
import { baseEmbed } from '../utils/embeds';

export function hasDefeatedMonster(userId: string, monsterId: string): boolean {
  const row = getDb().prepare(`
    SELECT COUNT(*) AS c FROM battle_sessions WHERE user_id = ? AND monster_id = ? AND status = 'victory'
  `).get(userId, monsterId) as { c: number };
  return row.c > 0;
}

/** 初回のみ探索に出現し、撃破後は再戦メニュー専用 */
export const EXPLORE_ONCE_BOSS_IDS = new Set<string>([
  ...Object.values(STORY_BOSS_MONSTERS),
  ...VALHALLA_BOSS_MONSTER_IDS,
  ...Object.values(REMATCH_MATERIAL_BOSSES).map((c) => c.monsterId),
]);

export type BossEncounterKind = 'mob' | 'area_boss_first' | 'rematch_boss';

export function isExploreOnceBoss(monsterId: string): boolean {
  return EXPLORE_ONCE_BOSS_IDS.has(monsterId);
}

export function isStoryBossMonster(monsterId: string): boolean {
  return Object.values(STORY_BOSS_MONSTERS).includes(monsterId);
}

export function filterExplorationMonsterPool(
  userId: string,
  pool: Array<{ monster_id: string; weight: number }>,
): Array<{ monster_id: string; weight: number }> {
  const filtered = pool.filter((p) => !isExploreOnceBoss(p.monster_id) || !hasDefeatedMonster(userId, p.monster_id));
  if (filtered.length) return filtered;
  return pool.filter((p) => !isExploreOnceBoss(p.monster_id));
}

export function shouldStartExploreAsBossBattle(userId: string, monsterId: string): boolean {
  if (!isExploreOnceBoss(monsterId)) return false;
  return !hasDefeatedMonster(userId, monsterId);
}

export function formatBossExploreIntro(areaName: string, bossName: string, flavorLine?: string): string {
  const flavor = flavorLine ?? `${areaName}の奥で、${bossName}が立ちはだかった。`;
  return [
    '🔥 **ボス出現**',
    `**${bossName}**`,
    '',
    flavor,
    '',
    'これは通常戦闘ではありません。',
    '撃破すると再戦メニューに登録されます。',
  ].join('\n');
}

export function buildBossEncounterExplorePost(message: string): UiPayload {
  return {
    embeds: [baseEmbed('BOSS ENCOUNTER', message).setColor(0xcc4422)],
    components: [],
  };
}

export function formatBossBattleEmbedTitle(isBoss: boolean, isRematch: boolean): string {
  if (!isBoss) return '戦闘';
  return isRematch ? 'ボス再戦' : 'ボス戦';
}

export function formatBossEnemyFieldName(name: string, isBoss: boolean): string {
  return isBoss ? `BOSS: ${name}` : name;
}

export function formatBossFirstVictoryHeader(bossName: string, kaiMaterialNames: string[] = []): string[] {
  const lines = [
    '🔥 **ボス撃破！**',
    `**${bossName}**を倒した。`,
    '',
    '以後、このボスは「再戦」から挑戦できます。',
    '探索中には通常出現しません。',
  ];
  if (kaiMaterialNames.length) {
    lines.push('', '**Kai伝承素材を手に入れた。**', ...kaiMaterialNames.map((n) => `・${n}`));
  }
  return lines;
}

export type RematchBossDisplay = {
  categoryLabel: string;
  rewardSummary: string;
  detail?: string;
};

export const REMATCH_BOSS_DISPLAY: Record<string, RematchBossDisplay> = {
  [FURNACE_KEEPER_BOSS_ID]: {
    categoryLabel: 'ボス再戦',
    rewardSummary: 'Kai伝承素材 / Uni→Src変質素材',
    detail: `素材抽選: 再戦時${Math.round(UNI_SRC_DROP_TRIGGER_RATE * 100)}%・16種ランダム`,
  },
  mon_silent_guardian: {
    categoryLabel: 'ボス再戦',
    rewardSummary: '無答の守護者の頁（初回確定 / 再戦4%）',
  },
  mon_moon_observer: {
    categoryLabel: '素材ボス再戦',
    rewardSummary: '星落ち黒曜石（旧Uni素材）',
  },
  mon_black_lantern_wraith: {
    categoryLabel: '素材ボス再戦',
    rewardSummary: '黒灯灰（旧Uni素材）',
  },
  mon_machina_echo: {
    categoryLabel: 'ヴァルハラボス再戦',
    rewardSummary: 'ヴァルハラ徽章 / 装備 / 無答の守護者の頁 / 特殊素材',
  },
  mon_old_king_shadow: {
    categoryLabel: 'ヴァルハラボス再戦',
    rewardSummary: '旧王装備 / 徽章 / 無答の守護者の頁',
  },
  mon_deep_core_boss: {
    categoryLabel: 'ヴァルハラボス再戦',
    rewardSummary: '深層炉心素材 / 徽章 / 装備',
  },
};

export function getRematchBossDisplay(monsterId: string): RematchBossDisplay {
  return REMATCH_BOSS_DISPLAY[monsterId] ?? {
    categoryLabel: 'ボス再戦',
    rewardSummary: '周回素材 / 装備',
  };
}

export function formatRematchSelectDescription(monsterId: string): string {
  const d = getRematchBossDisplay(monsterId);
  const parts = [`区分: ${d.categoryLabel}`, `主な報酬: ${d.rewardSummary}`];
  if (d.detail) parts.push(d.detail);
  return parts.join(' · ').slice(0, 100);
}

export function formatRematchBossListEntry(monsterId: string, name: string): string {
  const d = getRematchBossDisplay(monsterId);
  const lines = [`**${name}**`, `区分: ${d.categoryLabel}`, `主な報酬: ${d.rewardSummary}`];
  if (d.detail) lines.push(d.detail);
  return lines.join('\n');
}

export function getBossEncounterAuditRows(): string[][] {
  const db = getDb();
  const areas = db.prepare(`
    SELECT id, name, monster_pool_json FROM exploration_areas ORDER BY recommended_min_level
  `).all() as Array<{ id: string; name: string; monster_pool_json: string }>;

  const rows: string[][] = [];
  for (const bossId of [...EXPLORE_ONCE_BOSS_IDS].sort()) {
    const mon = db.prepare('SELECT name, is_boss FROM monsters WHERE id = ?').get(bossId) as { name: string; is_boss: number } | undefined;
    if (!mon) continue;
    const areaHits = areas.filter((a) => {
      const pool = JSON.parse(a.monster_pool_json) as Array<{ monster_id: string }>;
      return pool.some((p) => p.monster_id === bossId);
    });
    const areaId = areaHits[0]?.id ?? 'rematch_only';
    const display = getRematchBossDisplay(bossId);
    const silentDrop = BOSS_VICTORY_MATERIAL_DROPS.find((d) => d.monsterId === bossId);
    rows.push([
      bossId,
      mon.name,
      areaId,
      'explore_pool_or_rematch_menu',
      'yes',
      'no',
      'yes',
      'boss_defeated:* or battle_sessions victory',
      silentDrop ? 'boss_material' : bossId === FURNACE_KEEPER_BOSS_ID ? 'kai_uni_material' : 'rematch_loot',
      display.categoryLabel,
      mon.is_boss === 1 ? 'OK' : 'WARN — is_boss flag off',
    ]);
  }
  return rows;
}
