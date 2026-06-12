import type Database from 'better-sqlite3';
import { nowIso } from '../../types';
import { ALL_JOB_SKILLS, JOB_SKILL_UNLOCKS, resolveSkillTargetType, type BattleSkillDef } from './jobSkillData';

export type { BattleSkillDef } from './jobSkillData';

export const BATTLE_CONSUMABLES: Array<{ id: string; effect: object }> = [
  { id: 'cons_heal_potion', effect: { type: 'heal_hp', value: 80 } },
  { id: 'cons_lamp_bottle', effect: { type: 'revive', value: 0.3 } },
  { id: 'cons_antidote', effect: { type: 'cure_poison' } },
  { id: 'cons_grind_powder', effect: { type: 'break_boost', value: 15 } },
  { id: 'cons_smoke_bomb', effect: { type: 'flee_boost', value: 0.25 } },
];

export function seedBattleSkills(db: Database.Database): void {
  const ins = db.prepare(`
    INSERT INTO skills (
      id, name, job_id, description, mp_cost, power, skill_type, element, break_power, effect_json,
      scaling_stat, secondary_scaling_stat, hit_bonus, crit_bonus, priority, effect_type, status_effect, hits, target_type, usable_in_battle
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, description=excluded.description, mp_cost=excluded.mp_cost, power=excluded.power,
      skill_type=excluded.skill_type, scaling_stat=excluded.scaling_stat, secondary_scaling_stat=excluded.secondary_scaling_stat,
      hit_bonus=excluded.hit_bonus, crit_bonus=excluded.crit_bonus, break_power=excluded.break_power,
      effect_type=excluded.effect_type, status_effect=excluded.status_effect, hits=excluded.hits, target_type=excluded.target_type
  `);

  for (const s of ALL_JOB_SKILLS) {
    ins.run(
      s.id, s.name, `job_${s.job}`, s.desc, s.mp, s.power, s.skill_type, s.element ?? null,
      s.break_power ?? 0, JSON.stringify({ effect_type: s.effect_type ?? null }),
      s.scaling_stat, s.secondary_scaling_stat ?? null, s.hit_bonus ?? 0, s.crit_bonus ?? 0,
      s.priority ?? 0, s.effect_type ?? null, s.status_effect ?? null, s.hits ?? 1,
      resolveSkillTargetType(s),
    );
  }

  const insUnlock = db.prepare(`
    INSERT INTO job_skill_unlocks (job_name, job_level, skill_id, unlock_text)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(job_name, job_level, skill_id) DO UPDATE SET unlock_text=excluded.unlock_text
  `);
  for (const [jobName, unlocks] of Object.entries(JOB_SKILL_UNLOCKS)) {
    for (const u of unlocks) {
      const skill = ALL_JOB_SKILLS.find((s) => s.id === u.skillId);
      insUnlock.run(jobName, u.level, u.skillId, u.unlockText ?? (skill ? `${skill.name}を覚えた。` : null));
    }
  }

  const insItem = db.prepare(`
    INSERT INTO items (id, name, category, rarity, description, source_text, usage_text, sell_price, tradeable, battle_usable, battle_effect_json, created_at)
    VALUES (?, ?, 'consumable', ?, ?, ?, ?, ?, 1, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET battle_usable=1, battle_effect_json=excluded.battle_effect_json
  `);
  const ts = nowIso();
  const extras = [
    { id: 'cons_heal_potion', name: '回復薬', rarity: 'N', desc: 'HPを80回復。', source: '各町の店', usage: '戦闘回復', price: 30, effect: { type: 'heal_hp', value: 80 } },
    { id: 'cons_antidote', name: '解毒薬', rarity: 'N', desc: '毒を治す。', source: '各町の店', usage: '戦闘解毒', price: 25, effect: { type: 'cure_poison' } },
    { id: 'cons_grind_powder', name: '研磨粉', rarity: 'R', desc: '体勢を崩しやすくする。', source: '鍛冶屋', usage: '戦闘補助', price: 40, effect: { type: 'break_boost', value: 15 } },
    { id: 'cons_smoke_bomb', name: '煙玉', rarity: 'R', desc: '煙で距離を取る。', source: '港の店', usage: '戦闘逃走', price: 50, effect: { type: 'flee_boost', value: 0.25 } },
  ];
  for (const e of extras) {
    insItem.run(e.id, e.name, e.rarity, e.desc, e.source, e.usage, e.price, JSON.stringify(e.effect), ts);
  }
  for (const c of BATTLE_CONSUMABLES) {
    db.prepare('UPDATE items SET battle_usable = 1, battle_effect_json = ? WHERE id = ?').run(JSON.stringify(c.effect), c.id);
  }
}

export function ensurePlayerSkillTables(db: Database.Database): void {
  /* tables created in migrations */
}
