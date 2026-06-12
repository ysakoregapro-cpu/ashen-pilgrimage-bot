import type Database from 'better-sqlite3';

const BASIC_JOBS = ['剣士', '重騎士', '狩人', '魔術師', '祈祷師', '斥候', '機工師', '格闘士'];
const ADVANCED_JOBS = [
  '剣豪', '魔剣士', '城塞騎士', '聖盾士', '追跡者', '弓聖', '灰術師', '星術師',
  '司祭', '癒し手', '暗部', '探索者', '錬機師', '砲術師', '拳闘王', '破戒僧',
];
const HIDDEN_JOBS = ['星剣士', '繋ぎ手', '黄昏騎士', '創造砲士', '解析者', '執行者', 'アーク技師', '調律師'];

const JOB_MODS: Record<string, { hp: number; mp: number; atk: number; mag: number; def: number; spi: number; spd: number }> = {
  剣士: { hp: 10, mp: 5, atk: 8, mag: 0, def: 4, spi: 0, spd: 2 },
  重騎士: { hp: 20, mp: -8, atk: 4, mag: 0, def: 12, spi: 4, spd: -4 },
  狩人: { hp: 5, mp: 8, atk: 6, mag: 2, def: 2, spi: 2, spd: 6 },
  魔術師: { hp: -5, mp: 22, atk: 0, mag: 12, def: 0, spi: 6, spd: 2 },
  祈祷師: { hp: 5, mp: 18, atk: 0, mag: 8, def: 4, spi: 10, spd: 0 },
  斥候: { hp: 0, mp: 3, atk: 5, mag: 0, def: 2, spi: 2, spd: 10 },
  機工師: { hp: 5, mp: 8, atk: 4, mag: 6, def: 4, spi: 4, spd: 0 },
  格闘士: { hp: 8, mp: -5, atk: 10, mag: 0, def: 6, spi: 0, spd: 4 },
  剣豪: { hp: 12, mp: 0, atk: 14, mag: 2, def: 6, spi: 2, spd: 4 },
  魔剣士: { hp: 8, mp: 8, atk: 10, mag: 8, def: 4, spi: 4, spd: 4 },
  城塞騎士: { hp: 25, mp: -5, atk: 6, mag: 0, def: 16, spi: 6, spd: -6 },
  聖盾士: { hp: 22, mp: 5, atk: 4, mag: 4, def: 14, spi: 12, spd: -4 },
  追跡者: { hp: 8, mp: 8, atk: 8, mag: 4, def: 4, spi: 4, spd: 8 },
  弓聖: { hp: 6, mp: 10, atk: 12, mag: 4, def: 2, spi: 4, spd: 8 },
  灰術師: { hp: 0, mp: 18, atk: 2, mag: 14, def: 2, spi: 8, spd: 2 },
  星術師: { hp: -2, mp: 22, atk: 0, mag: 16, def: 0, spi: 10, spd: 4 },
  司祭: { hp: 8, mp: 18, atk: 2, mag: 10, def: 6, spi: 14, spd: 0 },
  癒し手: { hp: 10, mp: 20, atk: 0, mag: 10, def: 4, spi: 16, spd: 0 },
  暗部: { hp: 4, mp: 8, atk: 8, mag: 2, def: 4, spi: 4, spd: 12 },
  探索者: { hp: 6, mp: 8, atk: 6, mag: 4, def: 4, spi: 6, spd: 8 },
  錬機師: { hp: 8, mp: 12, atk: 6, mag: 8, def: 6, spi: 6, spd: 2 },
  砲術師: { hp: 6, mp: 14, atk: 8, mag: 10, def: 4, spi: 4, spd: 0 },
  拳闘王: { hp: 12, mp: 0, atk: 14, mag: 0, def: 8, spi: 2, spd: 6 },
  破戒僧: { hp: 10, mp: 8, atk: 12, mag: 4, def: 6, spi: 6, spd: 6 },
};

const SKILLS: { id: string; name: string; job: string; desc: string; mp: number; power: number; type: string; element?: string; breakP?: number }[] = [
  { id: 'skill_slash', name: '斬り払い', job: '剣士', desc: '基本的な斬撃。', mp: 0, power: 1.0, type: 'physical' },
  { id: 'skill_double_slash', name: '二連斬', job: '剣士', desc: '2回の斬撃。', mp: 5, power: 0.7, type: 'physical' },
  { id: 'skill_parry', name: '受け流し', job: '剣士', desc: '次の被ダメージ軽減。', mp: 3, power: 0, type: 'buff' },
  { id: 'skill_ash_thrust', name: '灰燼突き', job: '剣士', desc: '灰属性の突き。', mp: 8, power: 1.2, type: 'physical', element: 'ash' },
  { id: 'skill_twilight_combo', name: '黄昏連斬', job: '剣士', desc: '連続斬撃。', mp: 12, power: 0.9, type: 'physical', breakP: 15 },
  { id: 'skill_break_slash', name: '崩し斬り', job: '剣士', desc: 'ブレイク値を削る。', mp: 10, power: 0.8, type: 'physical', breakP: 25 },
  { id: 'skill_sword_wave', name: '剣気解放', job: '剣士', desc: '剣気で遠距離攻撃。', mp: 15, power: 1.4, type: 'physical' },
  { id: 'skill_taunt', name: '挑発', job: '重騎士', desc: '敵のヘイトを引く。', mp: 3, power: 0, type: 'buff' },
  { id: 'skill_shield_stance', name: '盾構え', job: '重騎士', desc: '防御力上昇。', mp: 5, power: 0, type: 'buff' },
  { id: 'skill_fortress', name: '城塞防御', job: '重騎士', desc: '大幅に防御。', mp: 10, power: 0, type: 'buff' },
  { id: 'skill_silver_stance', name: '白銀の構え', job: '重騎士', desc: '白銀の守り。', mp: 8, power: 0, type: 'buff' },
  { id: 'skill_cover', name: 'かばう', job: '重騎士', desc: '味方をかばう。', mp: 6, power: 0, type: 'special' },
  { id: 'skill_counter_shield', name: '反撃の盾', job: '重騎士', desc: '防御時反撃。', mp: 8, power: 0.6, type: 'physical' },
  { id: 'skill_immovable', name: '不動の誓い', job: '重騎士', desc: '状態異常耐性。', mp: 12, power: 0, type: 'buff' },
  { id: 'skill_aim_shot', name: '狙い撃ち', job: '狩人', desc: '精密射撃。', mp: 0, power: 1.1, type: 'physical' },
  { id: 'skill_bind_arrow', name: '足止め矢', job: '狩人', desc: '敵の速度低下。', mp: 5, power: 0.7, type: 'physical' },
  { id: 'skill_trap', name: '罠設置', job: '狩人', desc: '罠を設置。', mp: 6, power: 0, type: 'special' },
  { id: 'skill_weak_shot', name: '弱点射撃', job: '狩人', desc: '弱点に高ダメージ。', mp: 10, power: 1.3, type: 'physical', breakP: 10 },
  { id: 'skill_mist_clear', name: '霧払い', job: '狩人', desc: '霧属性の矢。', mp: 8, power: 1.0, type: 'physical', element: 'mist' },
  { id: 'skill_part_shot', name: '部位狙い', job: '狩人', desc: '部位破壊狙い。', mp: 12, power: 1.0, type: 'physical', breakP: 20 },
  { id: 'skill_dragon_shot', name: '竜骨射ち', job: '狩人', desc: '大型敵に有効。', mp: 15, power: 1.5, type: 'physical' },
  { id: 'skill_ash_fire', name: '灰火', job: '魔術師', desc: '灰属性の魔法。', mp: 5, power: 1.0, type: 'magical', element: 'ash' },
  { id: 'skill_ice_needle', name: '氷針', job: '魔術師', desc: '氷属性の魔法。', mp: 6, power: 1.0, type: 'magical', element: 'ice' },
  { id: 'skill_star_bullet', name: '星弾', job: '魔術師', desc: '星属性の魔法。', mp: 8, power: 1.1, type: 'magical', element: 'star' },
  { id: 'skill_deep_thunder', name: '深層雷', job: '魔術師', desc: '雷属性の強魔法。', mp: 12, power: 1.4, type: 'magical', element: 'thunder' },
  { id: 'skill_echo_blast', name: '残響爆破', job: '魔術師', desc: '残響の爆破。', mp: 10, power: 1.2, type: 'magical', element: 'neutral', breakP: 12 },
  { id: 'skill_ash_circle', name: '灰術陣', job: '魔術師', desc: '継続ダメージ。', mp: 10, power: 0.5, type: 'magical', element: 'ash' },
  { id: 'skill_starfall', name: '星落とし', job: '魔術師', desc: '大威力星魔法。', mp: 20, power: 1.8, type: 'magical', element: 'star' },
  { id: 'skill_minor_heal', name: '小癒', job: '祈祷師', desc: 'HPを回復。', mp: 5, power: 0.3, type: 'heal' },
  { id: 'skill_lamp_prayer', name: '灯火の祈り', job: '祈祷師', desc: 'HP/MP回復。', mp: 8, power: 0.4, type: 'heal' },
  { id: 'skill_guard_prayer', name: '守りの祈祷', job: '祈祷師', desc: '防御力上昇。', mp: 6, power: 0, type: 'buff' },
  { id: 'skill_purify', name: '浄化', job: '祈祷師', desc: '状態異常解除。', mp: 8, power: 0, type: 'special' },
  { id: 'skill_revive', name: '蘇生', job: '祈祷師', desc: 'HP30%で蘇生。', mp: 20, power: 0.3, type: 'heal' },
  { id: 'skill_silence_hymn', name: '静寂の祝詞', job: '祈祷師', desc: '精神防御上昇。', mp: 10, power: 0, type: 'buff' },
  { id: 'skill_bind_light', name: '繋ぎの光', job: '祈祷師', desc: '味方全体回復。', mp: 15, power: 0.25, type: 'heal' },
  { id: 'skill_shadow_strike', name: '影打ち', job: '斥候', desc: '急所を突く。', mp: 0, power: 1.0, type: 'physical' },
  { id: 'skill_poison_blade', name: '毒刃', job: '斥候', desc: '毒を付与。', mp: 5, power: 0.8, type: 'physical' },
  { id: 'skill_disarm_trap', name: '罠解除', job: '斥候', desc: '罠を解除。', mp: 4, power: 0, type: 'special' },
  { id: 'skill_backstab', name: '背面刺し', job: '斥候', desc: '高会心攻撃。', mp: 8, power: 1.3, type: 'physical' },
  { id: 'skill_weak_spot', name: '弱点看破', job: '斥候', desc: '敵の弱点を看破。', mp: 6, power: 0, type: 'debuff' },
  { id: 'skill_steal', name: '奪取', job: '斥候', desc: 'アイテム奪取。', mp: 8, power: 0, type: 'special' },
  { id: 'skill_dark_walk', name: '闇歩き', job: '斥候', desc: '回避上昇。', mp: 10, power: 0, type: 'buff' },
  { id: 'skill_mini_cannon', name: '小型砲撃', job: '機工師', desc: '砲撃攻撃。', mp: 0, power: 1.0, type: 'physical' },
  { id: 'skill_repair', name: '修理', job: '機工師', desc: '装備状態回復。', mp: 5, power: 0, type: 'special' },
  { id: 'skill_weak_scan', name: '弱点スキャン', job: '機工師', desc: '敵情報開示。', mp: 4, power: 0, type: 'debuff' },
  { id: 'skill_deep_pierce', name: '深層穿ち', job: '機工師', desc: '防御無視攻撃。', mp: 10, power: 1.2, type: 'physical', breakP: 20 },
  { id: 'skill_turret', name: '砲台設置', job: '機工師', desc: '砲台を設置。', mp: 12, power: 0, type: 'special' },
  { id: 'skill_core_bullet', name: '炉心弾', job: '機工師', desc: '高威力砲撃。', mp: 15, power: 1.5, type: 'physical', breakP: 15 },
  { id: 'skill_arc_interfere', name: 'アーク干渉', job: '機工師', desc: '機械系に特効。', mp: 18, power: 1.4, type: 'magical', element: 'arc' },
  { id: 'skill_straight_punch', name: '正拳', job: '格闘士', desc: '正拳突き。', mp: 0, power: 1.0, type: 'physical' },
  { id: 'skill_combo', name: '連打', job: '格闘士', desc: '連続攻撃。', mp: 5, power: 0.6, type: 'physical' },
  { id: 'skill_ukemi', name: '受け身', job: '格闘士', desc: '被ダメージ軽減。', mp: 3, power: 0, type: 'buff' },
  { id: 'skill_armor_break', name: '破甲拳', job: '格闘士', desc: '防御力低下。', mp: 8, power: 1.0, type: 'physical', breakP: 15 },
  { id: 'skill_dragon_break', name: '竜骨砕き', job: '格闘士', desc: '大型敵に特効。', mp: 12, power: 1.4, type: 'physical' },
  { id: 'skill_spirit', name: '気合', job: '格闘士', desc: '攻撃力上昇。', mp: 6, power: 0, type: 'buff' },
  { id: 'skill_ash_fist', name: '灰拳乱舞', job: '格闘士', desc: '乱舞攻撃。', mp: 15, power: 0.8, type: 'physical' },
  { id: 'skill_echo_shot', name: '残響射ち', job: '追跡者', desc: '残響属性の矢。', mp: 10, power: 1.2, type: 'physical', element: 'echo' },
  { id: 'skill_mirror_slash', name: '写し身斬り', job: '暗部', desc: '回避後の追撃。', mp: 12, power: 1.3, type: 'physical' },
  { id: 'skill_silver_break', name: '白銀崩し', job: '城塞騎士', desc: '防御崩し。', mp: 10, power: 1.0, type: 'physical', breakP: 20 },
  { id: 'skill_silence_tune', name: '静寂の調律', job: '調律師', desc: '状態異常調律。', mp: 10, power: 0, type: 'special' },
  { id: 'skill_old_king_stance', name: '古王の構え', job: '聖盾士', desc: '古王の守り。', mp: 12, power: 0, type: 'buff' },
  { id: 'skill_star_scar', name: '星痕穿ち', job: '星剣士', desc: '星属性の突き。', mp: 12, power: 1.3, type: 'physical', element: 'star', breakP: 15 },
  { id: 'skill_black_fox', name: '黒狐絶影', job: '暗部', desc: '高会心攻撃。', mp: 14, power: 1.4, type: 'physical' },
];

export function seedJobsAndSkills(db: Database.Database): void {
  const insJob = db.prepare(`
    INSERT INTO jobs (id, name, tier, description, hp_mod, mp_mod, attack_mod, magic_mod, defense_mod, spirit_mod, speed_mod, unlock_condition)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const addJob = (name: string, tier: string, unlock: string | null) => {
    const m = JOB_MODS[name] ?? { hp: 0, mp: 0, atk: 0, mag: 0, def: 0, spi: 0, spd: 0 };
    insJob.run(
      `job_${name}`, name, tier, `${name}のジョブ。`,
      m.hp, m.mp, m.atk, m.mag, m.def, m.spi, m.spd, unlock,
    );
  };
  for (const j of BASIC_JOBS) addJob(j, 'basic', null);
  for (const j of ADVANCED_JOBS) addJob(j, 'advanced', 'Lv30以上');
  for (const j of HIDDEN_JOBS) addJob(j, 'hidden', '特殊条件');

  const insSkill = db.prepare(`
    INSERT INTO skills (id, name, job_id, description, mp_cost, power, skill_type, element, break_power, effect_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of SKILLS) {
    insSkill.run(
      s.id, s.name, `job_${s.job}`, s.desc, s.mp, s.power, s.type,
      s.element ?? null, s.breakP ?? 0,
      s.type === 'physical' && s.id === 'skill_poison_blade' ? JSON.stringify({ poison: 0.3 }) : null,
    );
  }
}
