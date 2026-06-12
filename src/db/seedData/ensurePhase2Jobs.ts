import type Database from 'better-sqlite3';
import {
  BASIC_JOB_DESCRIPTIONS, SUB_JOB_DESCRIPTIONS, ADVANCED_JOB_DESCRIPTIONS,
  JOB_TRIO_MAP,
} from './jobProgressionMaster';

const SUB_JOB_MODS: Record<string, { hp: number; mp: number; atk: number; mag: number; def: number; spi: number; spd: number }> = {
  '刃走り': { hp: 4, mp: 2, atk: 6, mag: 0, def: 2, spi: 0, spd: 8 },
  '城壁番': { hp: 10, mp: 0, atk: 2, mag: 0, def: 10, spi: 4, spd: -2 },
  '矢痕読み': { hp: 4, mp: 4, atk: 5, mag: 2, def: 2, spi: 2, spd: 6 },
  '灰術士': { hp: -2, mp: 14, atk: 0, mag: 10, def: 0, spi: 6, spd: 2 },
  '灯守': { hp: 4, mp: 12, atk: 0, mag: 6, def: 4, spi: 8, spd: 0 },
  '影足': { hp: 0, mp: 2, atk: 4, mag: 0, def: 0, spi: 2, spd: 12 },
  '歯車工': { hp: 4, mp: 6, atk: 5, mag: 6, def: 4, spi: 4, spd: 0 },
  '勁打者': { hp: 6, mp: -4, atk: 10, mag: 0, def: 4, spi: 0, spd: 4 },
  '繋ぎ手': { hp: 0, mp: 0, atk: 0, mag: 0, def: 0, spi: 0, spd: 0 },
};

const ADVANCED_MAIN_MODS: Record<string, { hp: number; mp: number; atk: number; mag: number; def: number; spi: number; spd: number }> = {
  '黄昏剣聖': { hp: 14, mp: 6, atk: 18, mag: 2, def: 10, spi: 4, spd: 8 },
  '白銀城塞騎士': { hp: 30, mp: 0, atk: 8, mag: 0, def: 22, spi: 8, spd: -6 },
  '残響弓王': { hp: 8, mp: 6, atk: 16, mag: 2, def: 6, spi: 4, spd: 14 },
  '星灰大魔導': { hp: -2, mp: 28, atk: 0, mag: 20, def: 0, spi: 12, spd: 4 },
  '巡礼聖祈師': { hp: 6, mp: 22, atk: 0, mag: 14, def: 8, spi: 14, spd: 0 },
  '影渡りの夜王': { hp: 2, mp: 4, atk: 12, mag: 0, def: 4, spi: 4, spd: 18 },
  '深層機工卿': { hp: 10, mp: 12, atk: 12, mag: 12, def: 8, spi: 6, spd: 4 },
  '灰拳闘王': { hp: 16, mp: -4, atk: 20, mag: 0, def: 8, spi: 2, spd: 8 },
  '星巡の導き手': { hp: 12, mp: 12, atk: 12, mag: 12, def: 12, spi: 12, spd: 12 },
};

function upsertJob(
  db: Database.Database,
  id: string,
  name: string,
  tier: string,
  desc: string,
  mods: { hp: number; mp: number; atk: number; mag: number; def: number; spi: number; spd: number },
): void {
  const exists = db.prepare('SELECT 1 FROM jobs WHERE name = ?').get(name);
  if (exists) {
    db.prepare(`
      UPDATE jobs SET tier=?, description=?, hp_mod=?, mp_mod=?, attack_mod=?, magic_mod=?, defense_mod=?, spirit_mod=?, speed_mod=?
      WHERE name=?
    `).run(tier, desc, mods.hp, mods.mp, mods.atk, mods.mag, mods.def, mods.spi, mods.spd, name);
    return;
  }
  db.prepare(`
    INSERT INTO jobs (id, name, tier, description, hp_mod, mp_mod, attack_mod, magic_mod, defense_mod, spirit_mod, speed_mod, unlock_condition)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(id, name, tier, desc, mods.hp, mods.mp, mods.atk, mods.mag, mods.def, mods.spi, mods.spd);
}

export function ensurePhase2Jobs(db: Database.Database): void {
  upsertJob(db, 'job_pilgrim', '巡礼者', 'basic', BASIC_JOB_DESCRIPTIONS['巡礼者'] ?? '巡礼者', {
    hp: 0, mp: 0, atk: 0, mag: 0, def: 0, spi: 0, spd: 0,
  });

  for (const [base, trio] of Object.entries(JOB_TRIO_MAP)) {
    const subTier = trio.sub === '繋ぎ手' ? 'sub' : 'sub';
    upsertJob(
      db, `job_sub_${trio.sub}`, trio.sub, subTier,
      SUB_JOB_DESCRIPTIONS[trio.sub] ?? trio.sub,
      SUB_JOB_MODS[trio.sub] ?? { hp: 0, mp: 0, atk: 0, mag: 0, def: 0, spi: 0, spd: 0 },
    );

    upsertJob(
      db, `job_adv_main_${trio.advanced}`, trio.advanced, 'advanced_main',
      ADVANCED_JOB_DESCRIPTIONS[trio.advanced] ?? trio.advanced,
      ADVANCED_MAIN_MODS[trio.advanced] ?? { hp: 0, mp: 0, atk: 0, mag: 0, def: 0, spi: 0, spd: 0 },
    );

    const baseDesc = BASIC_JOB_DESCRIPTIONS[base];
    if (baseDesc) {
      db.prepare('UPDATE jobs SET description = ? WHERE name = ?').run(baseDesc, base);
    }
  }

  db.prepare(`
    UPDATE jobs SET description = description || '（旧職・再設定推奨）'
    WHERE tier IN ('advanced', 'hidden') AND description NOT LIKE '%旧職%'
  `).run();
}
