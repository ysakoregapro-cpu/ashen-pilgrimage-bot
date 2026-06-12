import { getDb } from '../db/database';
import { createBattle, getActiveBattle } from './battleSystem';
import { REMATCH_MATERIAL_BOSSES } from '../db/seedData/forgeMaster';
import { STORY_BOSS_MONSTERS } from '../db/seedData/storyData';

export type BossRematchCategory = 'story' | 'material';

export function hasDefeatedMonster(userId: string, monsterId: string): boolean {
  const row = getDb().prepare(`
    SELECT COUNT(*) AS c FROM battle_sessions WHERE user_id = ? AND monster_id = ? AND status = 'victory'
  `).get(userId, monsterId) as { c: number };
  return row.c > 0;
}

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
  return { ok: true, battleId, message: `**${name}** との再戦が始まった。\n初回報酬はなく、素材ドロップが主目的だ。` };
}

export function formatRematchBossList(userId: string): string {
  const bosses = getRematchableBosses(userId);
  if (!bosses.length) {
    return '再戦できるボスはまだない。\n強敵を一度倒すと、ここから再挑戦できる。';
  }
  const lines = bosses.map((b) => {
    const tag = b.category === 'material' ? '素材' : '章';
    const hint = b.hint ? `（${b.hint}）` : '';
    return `・[${tag}] **${b.name}**${hint}`;
  });
  return ['**ボス再戦** — 初回報酬なし・素材周回向け', '', ...lines].join('\n');
}
