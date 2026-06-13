import { getDb } from '../db/database';
import { createBattle, getActiveBattle } from './battleSystem';
import { formatRematchBossListEntry, hasDefeatedMonster } from './bossEncounterSystem';
import { REMATCH_MATERIAL_BOSSES } from '../db/seedData/forgeMaster';
import { STORY_BOSS_MONSTERS } from '../db/seedData/storyData';
import { VALHALLA_BOSS_MONSTER_IDS, VALHALLA_BOSS_REMATCH_META } from '../db/seedData/valhallaRewardMaster';

export { hasDefeatedMonster };

export type BossRematchCategory = 'story' | 'material';

export function getRematchableBosses(userId: string): Array<{ monsterId: string; name: string; category: BossRematchCategory; hint?: string }> {
  const out: Array<{ monsterId: string; name: string; category: BossRematchCategory; hint?: string }> = [];
  const seen = new Set<string>();

  for (const cfg of Object.values(REMATCH_MATERIAL_BOSSES)) {
    if (!hasDefeatedMonster(userId, cfg.monsterId)) continue;
    seen.add(cfg.monsterId);
    out.push({
      monsterId: cfg.monsterId,
      name: cfg.label,
      category: 'material',
      hint: cfg.areaHint,
    });
  }

  for (const monsterId of VALHALLA_BOSS_MONSTER_IDS) {
    if (seen.has(monsterId) || !hasDefeatedMonster(userId, monsterId)) continue;
    seen.add(monsterId);
    const meta = VALHALLA_BOSS_REMATCH_META[monsterId];
    out.push({
      monsterId,
      name: meta.label,
      category: 'material',
      hint: meta.areaHint,
    });
  }

  for (const monsterId of Object.values(STORY_BOSS_MONSTERS)) {
    if (seen.has(monsterId) || !hasDefeatedMonster(userId, monsterId)) continue;
    const m = getDb().prepare('SELECT name FROM monsters WHERE id = ?').get(monsterId) as { name: string } | undefined;
    if (!m) continue;
    out.push({ monsterId, name: m.name, category: 'story' });
  }

  return out;
}

export function canStartBossRematch(userId: string, monsterId: string): { ok: boolean; reason?: string } {
  if (getActiveBattle(userId)) return { ok: false, reason: '既に戦闘中です。' };
  if (!hasDefeatedMonster(userId, monsterId)) {
    return { ok: false, reason: '一度討伐してから再戦できます。' };
  }
  const monster = getDb().prepare('SELECT id FROM monsters WHERE id = ?').get(monsterId);
  if (!monster) return { ok: false, reason: '敵が見つかりません。' };
  return { ok: true };
}

export function startBossRematch(userId: string, monsterId: string): { ok: boolean; battleId?: string; message: string } {
  const check = canStartBossRematch(userId, monsterId);
  if (!check.ok) return { ok: false, message: check.reason ?? '再戦できません。' };
  const battleId = createBattle(userId, monsterId, null, { isBoss: true, isRematch: true });
  const name = (getDb().prepare('SELECT name FROM monsters WHERE id = ?').get(monsterId) as { name: string }).name;
  return { ok: true, battleId, message: `**${name}** との再戦が始まった。\n初回報酬はなく、徽章・素材・装備厳選が主目的だ。` };
}

export function formatRematchBossList(userId: string): string {
  const bosses = getRematchableBosses(userId);
  if (!bosses.length) {
    return '再戦できるボスはまだない。\n強敵を一度倒すと、ここから再挑戦できる。';
  }
  const lines = bosses.map((b) => {
    const block = formatRematchBossListEntry(b.monsterId, b.name);
    const hint = b.hint ? `\n（${b.hint}）` : '';
    return `・${block}${hint}`;
  });
  return ['**ボス再戦** — 初回報酬なし・素材周回向け', '', ...lines].join('\n\n');
}
