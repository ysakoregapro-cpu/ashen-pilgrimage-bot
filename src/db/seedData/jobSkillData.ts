export type SkillTargetType =
  | 'self'
  | 'single_enemy'
  | 'all_enemies'
  | 'ally'
  | 'all_allies'
  | 'cover'
  | 'taunt';

export type BattleSkillDef = {
  id: string;
  name: string;
  job: string;
  desc: string;
  mp: number;
  power: number;
  skill_type: string;
  scaling_stat: string;
  secondary_scaling_stat?: string;
  element?: string;
  break_power?: number;
  hit_bonus?: number;
  crit_bonus?: number;
  priority?: number;
  effect_type?: string;
  status_effect?: string;
  hits?: number;
  target_type?: SkillTargetType;
};

/** Infer battle target when not explicitly set on the skill def */
export function resolveSkillTargetType(s: BattleSkillDef): SkillTargetType {
  if (s.target_type) return s.target_type;
  if (s.effect_type === 'taunt') return 'taunt';
  if (s.id === 'bs_cover') return 'cover';
  if (s.effect_type === 'cure_poison') return 'all_allies';
  if (s.skill_type === 'recovery' && s.power > 0) {
    if (s.id === 'bs_field_repair') return 'self';
    return 'ally';
  }
  if (['guard', 'support'].includes(s.skill_type) && s.power <= 0) return 'self';
  if (s.hits && s.hits >= 3 && ['magic', 'machine', 'physical'].includes(s.skill_type)) {
    if (['bs_stardust_storm', 'bs_control_volley', 'bs_ash_fist_rampage'].includes(s.id)) {
      return 'all_enemies';
    }
  }
  if (['physical', 'magic', 'technique', 'break', 'debuff', 'divine', 'machine', 'special'].includes(s.skill_type)) {
    return 'single_enemy';
  }
  return 'self';
}

export type JobUnlock = { level: number; skillId: string; unlockText?: string };

export const JOB_INITIAL_SKILL: Record<string, string> = {
  剣士: 'bs_slash',
  重騎士: 'bs_shield_bash',
  狩人: 'bs_aim_shot',
  魔術師: 'bs_ash_fire',
  祈祷師: 'bs_lamp_prayer',
  斥候: 'bs_shadow_strike',
  機工師: 'bs_mini_cannon',
  格闘士: 'bs_straight_punch',
};

export const JOB_SKILL_UNLOCKS: Record<string, JobUnlock[]> = {
  剣士: [
    { level: 1, skillId: 'bs_slash' },
    { level: 4, skillId: 'bs_parry' },
    { level: 8, skillId: 'bs_double_slash' },
    { level: 12, skillId: 'bs_break_slash' },
    { level: 18, skillId: 'bs_sword_focus' },
    { level: 25, skillId: 'bs_ash_thrust' },
    { level: 32, skillId: 'bs_counter_blade' },
    { level: 40, skillId: 'bs_twilight_combo' },
    { level: 50, skillId: 'bs_sword_pressure' },
    { level: 60, skillId: 'bs_star_sever' },
    { level: 70, skillId: 'bs_twilight_sword_ultimate' },
  ],
  重騎士: [
    { level: 1, skillId: 'bs_shield_bash' },
    { level: 4, skillId: 'bs_shield_guard' },
    { level: 8, skillId: 'bs_taunt' },
    { level: 12, skillId: 'bs_fortress' },
    { level: 18, skillId: 'bs_silver_break' },
    { level: 25, skillId: 'bs_cover' },
    { level: 32, skillId: 'bs_counter_shield' },
    { level: 40, skillId: 'bs_immovable_oath' },
    { level: 50, skillId: 'bs_ancient_guard' },
    { level: 60, skillId: 'bs_fortress_counter' },
    { level: 70, skillId: 'bs_silver_fortress_ultimate' },
  ],
  狩人: [
    { level: 1, skillId: 'bs_aim_shot' },
    { level: 4, skillId: 'bs_bind_arrow' },
    { level: 8, skillId: 'bs_trap' },
    { level: 12, skillId: 'bs_weak_shot' },
    { level: 18, skillId: 'bs_mist_clear' },
    { level: 25, skillId: 'bs_part_shot' },
    { level: 32, skillId: 'bs_tracker_eye' },
    { level: 40, skillId: 'bs_dragon_bone_shot' },
    { level: 50, skillId: 'bs_star_shadow_arrow' },
    { level: 60, skillId: 'bs_sure_aim' },
    { level: 70, skillId: 'bs_echo_bow_ultimate' },
  ],
  魔術師: [
    { level: 1, skillId: 'bs_ash_fire' },
    { level: 4, skillId: 'bs_ice_needle' },
    { level: 6, skillId: 'bs_star_bullet' },
    { level: 8, skillId: 'bs_magic_focus' },
    { level: 12, skillId: 'bs_deep_thunder' },
    { level: 15, skillId: 'bs_ash_circle' },
    { level: 18, skillId: 'bs_echo_blast' },
    { level: 25, skillId: 'bs_star_fall' },
    { level: 32, skillId: 'bs_magic_cycle' },
    { level: 40, skillId: 'bs_ash_crown_fire' },
    { level: 50, skillId: 'bs_deep_great_thunder' },
    { level: 60, skillId: 'bs_stardust_storm' },
    { level: 70, skillId: 'bs_star_ultimate' },
  ],
  祈祷師: [
    { level: 1, skillId: 'bs_lamp_prayer' },
    { level: 4, skillId: 'bs_minor_heal' },
    { level: 6, skillId: 'bs_guard_prayer' },
    { level: 8, skillId: 'bs_purify' },
    { level: 12, skillId: 'bs_quiet_ode' },
    { level: 15, skillId: 'bs_spirit_focus' },
    { level: 18, skillId: 'bs_lamp_wall' },
    { level: 25, skillId: 'bs_healing_lamp' },
    { level: 32, skillId: 'bs_revive_prayer' },
    { level: 40, skillId: 'bs_binding_light' },
    { level: 50, skillId: 'bs_silent_tune' },
    { level: 60, skillId: 'bs_great_lamp' },
    { level: 70, skillId: 'bs_pilgrim_prayer_ultimate' },
  ],
  斥候: [
    { level: 1, skillId: 'bs_shadow_strike' },
    { level: 4, skillId: 'bs_poison_blade' },
    { level: 8, skillId: 'bs_dark_walk' },
    { level: 12, skillId: 'bs_backstab' },
    { level: 18, skillId: 'bs_weakness_sight' },
    { level: 25, skillId: 'bs_plunder' },
    { level: 32, skillId: 'bs_shadow_stitch' },
    { level: 40, skillId: 'bs_black_fox_shadow' },
    { level: 50, skillId: 'bs_afterimage' },
    { level: 60, skillId: 'bs_blind_spot' },
    { level: 70, skillId: 'bs_shadow_pass_ultimate' },
  ],
  機工師: [
    { level: 1, skillId: 'bs_mini_cannon' },
    { level: 4, skillId: 'bs_weak_scan' },
    { level: 8, skillId: 'bs_field_repair' },
    { level: 12, skillId: 'bs_deep_pierce' },
    { level: 18, skillId: 'bs_turret_set' },
    { level: 25, skillId: 'bs_core_bullet' },
    { level: 32, skillId: 'bs_arc_jam' },
    { level: 40, skillId: 'bs_multi_aim' },
    { level: 50, skillId: 'bs_deep_analysis' },
    { level: 60, skillId: 'bs_control_volley' },
    { level: 70, skillId: 'bs_creation_cannon_ultimate' },
  ],
  格闘士: [
    { level: 1, skillId: 'bs_straight_punch' },
    { level: 4, skillId: 'bs_spirit_shout' },
    { level: 8, skillId: 'bs_combo' },
    { level: 12, skillId: 'bs_armor_break' },
    { level: 18, skillId: 'bs_ukemi' },
    { level: 25, skillId: 'bs_dragon_bone_crush' },
    { level: 32, skillId: 'bs_ash_fist_rampage' },
    { level: 40, skillId: 'bs_blood_stance' },
    { level: 50, skillId: 'bs_taboo_combo' },
    { level: 60, skillId: 'bs_iron_body' },
    { level: 70, skillId: 'bs_fist_king_ultimate' },
  ],
};

/** 既存32 + 新規60 = 全職スキル定義 */
export const ALL_JOB_SKILLS: BattleSkillDef[] = [
  // --- 剣士 ---
  { id: 'bs_slash', name: '斬り払い', job: '剣士', desc: '単体への斬撃。', mp: 3, power: 1.0, skill_type: 'physical', scaling_stat: 'attack' },
  { id: 'bs_parry', name: '受け流し', job: '剣士', desc: '被ダメージを軽減。', mp: 4, power: 0, skill_type: 'guard', scaling_stat: 'defense', effect_type: 'guard', priority: 20 },
  { id: 'bs_double_slash', name: '二連斬', job: '剣士', desc: '2回の斬撃。', mp: 6, power: 0.65, skill_type: 'physical', scaling_stat: 'attack', hits: 2 },
  { id: 'bs_break_slash', name: '崩し斬り', job: '剣士', desc: '体勢を崩す一撃。', mp: 5, power: 0.85, skill_type: 'break', scaling_stat: 'attack', break_power: 28 },
  { id: 'bs_sword_focus', name: '剣気集中', job: '剣士', desc: '剣に力を込める。', mp: 5, power: 0, skill_type: 'support', scaling_stat: 'attack', effect_type: 'atk_buff' },
  { id: 'bs_ash_thrust', name: '灰燼突き', job: '剣士', desc: '灰を纏った突き。', mp: 7, power: 1.15, skill_type: 'physical', scaling_stat: 'attack', break_power: 10 },
  { id: 'bs_counter_blade', name: '返し刃', job: '剣士', desc: '受けて返す。', mp: 6, power: 0, skill_type: 'guard', scaling_stat: 'defense', effect_type: 'guard', break_power: 15 },
  { id: 'bs_twilight_combo', name: '黄昏連斬', job: '剣士', desc: '黄昏の連撃。', mp: 9, power: 0.55, skill_type: 'physical', scaling_stat: 'attack', hits: 3, target_type: 'single_enemy' },
  { id: 'bs_sword_pressure', name: '剣圧解放', job: '剣士', desc: '剣圧で敵を崩す。', mp: 10, power: 1.2, skill_type: 'break', scaling_stat: 'attack', break_power: 35 },
  { id: 'bs_star_sever', name: '星断ち', job: '剣士', desc: '星屑を断つ一撃。', mp: 12, power: 1.35, skill_type: 'physical', scaling_stat: 'attack', crit_bonus: 0.1 },
  { id: 'bs_twilight_sword_ultimate', name: '黄昏剣奥義', job: '剣士', desc: '剣士の奥義。', mp: 18, power: 1.65, skill_type: 'special', scaling_stat: 'attack', break_power: 40, crit_bonus: 0.15 },

  // --- 重騎士 ---
  { id: 'bs_shield_bash', name: '盾撃', job: '重騎士', desc: '盾で叩きつける。', mp: 4, power: 0.9, skill_type: 'physical', scaling_stat: 'defense' },
  { id: 'bs_shield_guard', name: '盾構え', job: '重騎士', desc: '盾で身を守る。', mp: 4, power: 0, skill_type: 'guard', scaling_stat: 'defense', effect_type: 'guard', priority: 20 },
  { id: 'bs_taunt', name: '挑発', job: '重騎士', desc: '敵の狙いを引く。', mp: 3, power: 0, skill_type: 'support', scaling_stat: 'defense', effect_type: 'taunt', target_type: 'taunt' },
  { id: 'bs_fortress', name: '城塞防御', job: '重騎士', desc: '大きく身を固める。', mp: 6, power: 0, skill_type: 'guard', scaling_stat: 'defense', effect_type: 'guard_strong', priority: 20 },
  { id: 'bs_silver_break', name: '白銀崩し', job: '重騎士', desc: '重い一撃で崩す。', mp: 7, power: 0.75, skill_type: 'break', scaling_stat: 'defense', break_power: 32 },
  { id: 'bs_cover', name: 'かばう', job: '重騎士', desc: '身を挺して守る。', mp: 5, power: 0, skill_type: 'guard', scaling_stat: 'defense', effect_type: 'def_buff', target_type: 'cover' },
  { id: 'bs_counter_shield', name: '反撃の盾', job: '重騎士', desc: '盾で反撃の隙を作る。', mp: 6, power: 0.85, skill_type: 'physical', scaling_stat: 'defense', break_power: 18 },
  { id: 'bs_immovable_oath', name: '不動の誓い', job: '重騎士', desc: '揺るがぬ守り。', mp: 8, power: 0, skill_type: 'guard', scaling_stat: 'defense', effect_type: 'guard_strong' },
  { id: 'bs_ancient_guard', name: '古王の守り', job: '重騎士', desc: '古の加護。', mp: 9, power: 0, skill_type: 'support', scaling_stat: 'defense', effect_type: 'def_buff' },
  { id: 'bs_fortress_counter', name: '城塞反攻', job: '重騎士', desc: '城塞から反撃。', mp: 11, power: 1.1, skill_type: 'break', scaling_stat: 'defense', break_power: 30 },
  { id: 'bs_silver_fortress_ultimate', name: '白銀城塞奥義', job: '重騎士', desc: '重騎士の奥義。', mp: 18, power: 1.4, skill_type: 'special', scaling_stat: 'defense', break_power: 45 },

  // --- 狩人 ---
  { id: 'bs_aim_shot', name: '狙い撃ち', job: '狩人', desc: '精密な一射。', mp: 4, power: 1.28, skill_type: 'technique', scaling_stat: 'attack', hit_bonus: 0.08, target_type: 'single_enemy' },
  { id: 'bs_bind_arrow', name: '足止め矢', job: '狩人', desc: '敵の足を止める。', mp: 5, power: 0.8, skill_type: 'debuff', scaling_stat: 'attack', effect_type: 'slow', target_type: 'single_enemy' },
  { id: 'bs_trap', name: '罠設置', job: '狩人', desc: '罠を仕掛ける。', mp: 6, power: 0, skill_type: 'break', scaling_stat: 'speed', effect_type: 'trap' },
  { id: 'bs_weak_shot', name: '弱点射撃', job: '狩人', desc: '急所を狙う。', mp: 7, power: 1.35, skill_type: 'technique', scaling_stat: 'attack', crit_bonus: 0.15, break_power: 12, target_type: 'single_enemy' },
  { id: 'bs_mist_clear', name: '霧払い', job: '狩人', desc: '霧を払い見通す。', mp: 5, power: 0, skill_type: 'support', scaling_stat: 'attack', effect_type: 'scan' },
  { id: 'bs_part_shot', name: '部位狙い', job: '狩人', desc: '部位を狙う一射。', mp: 8, power: 1.1, skill_type: 'technique', scaling_stat: 'attack', break_power: 20, hit_bonus: 0.05 },
  { id: 'bs_tracker_eye', name: '追跡者の目', job: '狩人', desc: '獲物を見逃さない。', mp: 6, power: 0, skill_type: 'support', scaling_stat: 'speed', effect_type: 'scan' },
  { id: 'bs_dragon_bone_shot', name: '竜骨射ち', job: '狩人', desc: '竜骨の矢。', mp: 10, power: 1.25, skill_type: 'technique', scaling_stat: 'attack', break_power: 15 },
  { id: 'bs_star_shadow_arrow', name: '星影の矢', job: '狩人', desc: '星影を射る。', mp: 11, power: 1.3, skill_type: 'technique', scaling_stat: 'attack', crit_bonus: 0.12 },
  { id: 'bs_sure_aim', name: '必中の構え', job: '狩人', desc: '外さぬ構え。', mp: 8, power: 0, skill_type: 'support', scaling_stat: 'attack', effect_type: 'atk_buff', hit_bonus: 0.15 },
  { id: 'bs_echo_bow_ultimate', name: '残響弓奥義', job: '狩人', desc: '狩人の奥義。', mp: 17, power: 1.55, skill_type: 'special', scaling_stat: 'attack', crit_bonus: 0.2, break_power: 25 },

  // --- 魔術師 ---
  { id: 'bs_ash_fire', name: '灰火', job: '魔術師', desc: '灰の炎。', mp: 6, power: 1.0, skill_type: 'magic', scaling_stat: 'magic', element: 'ash' },
  { id: 'bs_ice_needle', name: '氷針', job: '魔術師', desc: '氷の針。', mp: 8, power: 0.85, skill_type: 'magic', scaling_stat: 'magic', element: 'ice', effect_type: 'slow', target_type: 'single_enemy' },
  { id: 'bs_star_bullet', name: '星弾', job: '魔術師', desc: '星の弾。', mp: 10, power: 1.35, skill_type: 'magic', scaling_stat: 'magic', element: 'star', hit_bonus: -0.05 },
  { id: 'bs_magic_focus', name: '魔力集中', job: '魔術師', desc: '魔力を研ぎ澄ます。', mp: 5, power: 0, skill_type: 'support', scaling_stat: 'magic', effect_type: 'mag_buff' },
  { id: 'bs_deep_thunder', name: '深層雷', job: '魔術師', desc: '深層の雷。', mp: 9, power: 1.15, skill_type: 'magic', scaling_stat: 'magic', element: 'thunder' },
  { id: 'bs_ash_circle', name: '灰術陣', job: '魔術師', desc: '次の魔法を強化。', mp: 9, power: 0, skill_type: 'support', scaling_stat: 'magic', effect_type: 'mag_buff' },
  { id: 'bs_echo_blast', name: '残響爆破', job: '魔術師', desc: '残響の爆発。', mp: 10, power: 1.2, skill_type: 'magic', scaling_stat: 'magic', element: 'neutral', break_power: 12 },
  { id: 'bs_star_fall', name: '星落とし', job: '魔術師', desc: '星を落とす。', mp: 12, power: 1.3, skill_type: 'magic', scaling_stat: 'magic', element: 'star' },
  { id: 'bs_magic_cycle', name: '魔力循環', job: '魔術師', desc: '魔力を巡らせる。', mp: 7, power: 0, skill_type: 'support', scaling_stat: 'magic', effect_type: 'mag_buff' },
  { id: 'bs_ash_crown_fire', name: '灰冠の火', job: '魔術師', desc: '灰冠の炎。', mp: 13, power: 1.4, skill_type: 'magic', scaling_stat: 'magic', element: 'ash' },
  { id: 'bs_deep_great_thunder', name: '深層大雷', job: '魔術師', desc: '大いなる雷。', mp: 14, power: 1.45, skill_type: 'magic', scaling_stat: 'magic', break_power: 18 },
  { id: 'bs_stardust_storm', name: '星屑の嵐', job: '魔術師', desc: '星屑の嵐。', mp: 15, power: 0.5, skill_type: 'magic', scaling_stat: 'magic', hits: 3, target_type: 'all_enemies' },
  { id: 'bs_star_ultimate', name: '星術奥義', job: '魔術師', desc: '魔術師の奥義。', mp: 20, power: 1.75, skill_type: 'special', scaling_stat: 'magic', break_power: 30 },

  // --- 祈祷師 ---
  { id: 'bs_lamp_prayer', name: '灯火の祈り', job: '祈祷師', desc: '灯火の加護。', mp: 8, power: 0.55, skill_type: 'divine', scaling_stat: 'spirit' },
  { id: 'bs_minor_heal', name: '小癒', job: '祈祷師', desc: 'HPを癒す。', mp: 6, power: 0.35, skill_type: 'recovery', scaling_stat: 'spirit', target_type: 'ally' },
  { id: 'bs_guard_prayer', name: '守りの祈祷', job: '祈祷師', desc: '身を守る。', mp: 7, power: 0, skill_type: 'support', scaling_stat: 'spirit', effect_type: 'def_buff', target_type: 'self' },
  { id: 'bs_purify', name: '浄化', job: '祈祷師', desc: '毒を祓う。', mp: 5, power: 0, skill_type: 'support', scaling_stat: 'spirit', effect_type: 'cure_poison', target_type: 'all_allies' },
  { id: 'bs_quiet_ode', name: '静かな祝詞', job: '祈祷師', desc: '静かな加護。', mp: 6, power: 0.25, skill_type: 'recovery', scaling_stat: 'spirit' },
  { id: 'bs_spirit_focus', name: '精神集中', job: '祈祷師', desc: '精神を研ぎ澄ます。', mp: 5, power: 0, skill_type: 'support', scaling_stat: 'spirit', effect_type: 'def_buff' },
  { id: 'bs_lamp_wall', name: '灯火の壁', job: '祈祷師', desc: '灯火の障壁。', mp: 8, power: 0, skill_type: 'guard', scaling_stat: 'spirit', effect_type: 'guard' },
  { id: 'bs_healing_lamp', name: '癒しの灯', job: '祈祷師', desc: '深い癒し。', mp: 10, power: 0.5, skill_type: 'recovery', scaling_stat: 'spirit', target_type: 'ally' },
  { id: 'bs_revive_prayer', name: '蘇生の祈り', job: '祈祷師', desc: '灯火で立ち上がる。', mp: 12, power: 0.2, skill_type: 'recovery', scaling_stat: 'spirit', target_type: 'ally' },
  { id: 'bs_binding_light', name: '繋ぎの光', job: '祈祷師', desc: '光で繋ぐ。', mp: 11, power: 0.7, skill_type: 'divine', scaling_stat: 'spirit' },
  { id: 'bs_silent_tune', name: '静寂の調律', job: '祈祷師', desc: '心を整える。', mp: 9, power: 0, skill_type: 'support', scaling_stat: 'spirit', effect_type: 'cure_poison', target_type: 'all_allies' },
  { id: 'bs_great_lamp', name: '大灯火', job: '祈祷師', desc: '大いなる灯火。', mp: 14, power: 0.65, skill_type: 'recovery', scaling_stat: 'spirit' },
  { id: 'bs_pilgrim_prayer_ultimate', name: '巡礼祈祷奥義', job: '祈祷師', desc: '祈祷師の奥義。', mp: 18, power: 1.0, skill_type: 'special', scaling_stat: 'spirit', break_power: 20 },

  // --- 斥候 ---
  { id: 'bs_shadow_strike', name: '影打ち', job: '斥候', desc: '影の一撃。', mp: 4, power: 1.0, skill_type: 'technique', scaling_stat: 'speed' },
  { id: 'bs_poison_blade', name: '毒刃', job: '斥候', desc: '毒を塗る。', mp: 6, power: 0.85, skill_type: 'debuff', scaling_stat: 'attack', status_effect: 'poison', target_type: 'single_enemy' },
  { id: 'bs_dark_walk', name: '闇歩き', job: '斥候', desc: '影に紛れる。', mp: 5, power: 0, skill_type: 'support', scaling_stat: 'speed', effect_type: 'flee_buff' },
  { id: 'bs_backstab', name: '背面刺し', job: '斥候', desc: '背後から突く。', mp: 8, power: 1.2, skill_type: 'technique', scaling_stat: 'speed', crit_bonus: 0.2, hit_bonus: -0.05 },
  { id: 'bs_weakness_sight', name: '弱点看破', job: '斥候', desc: '弱点を見抜く。', mp: 5, power: 0, skill_type: 'support', scaling_stat: 'speed', effect_type: 'scan' },
  { id: 'bs_plunder', name: '奪取', job: '斥候', desc: '隙を突いて奪う。', mp: 7, power: 0.9, skill_type: 'technique', scaling_stat: 'speed', break_power: 15 },
  { id: 'bs_shadow_stitch', name: '影縫い', job: '斥候', desc: '影を縫いとめる。', mp: 8, power: 0.9, skill_type: 'debuff', scaling_stat: 'speed', effect_type: 'slow', target_type: 'single_enemy' },
  { id: 'bs_black_fox_shadow', name: '黒狐絶影', job: '斥候', desc: '黒狐の一太刀。', mp: 10, power: 1.25, skill_type: 'technique', scaling_stat: 'speed', crit_bonus: 0.15 },
  { id: 'bs_afterimage', name: '残影', job: '斥候', desc: '残像を残す。', mp: 6, power: 0, skill_type: 'support', scaling_stat: 'speed', effect_type: 'flee_buff' },
  { id: 'bs_blind_spot', name: '死角潜り', job: '斥候', desc: '死角に潜る。', mp: 9, power: 1.15, skill_type: 'technique', scaling_stat: 'speed', crit_bonus: 0.18 },
  { id: 'bs_shadow_pass_ultimate', name: '影渡り奥義', job: '斥候', desc: '斥候の奥義。', mp: 16, power: 1.6, skill_type: 'special', scaling_stat: 'speed', crit_bonus: 0.25, break_power: 22 },

  // --- 機工師 ---
  { id: 'bs_mini_cannon', name: '小型砲撃', job: '機工師', desc: '小型砲を撃つ。', mp: 5, power: 0.95, skill_type: 'machine', scaling_stat: 'attack', secondary_scaling_stat: 'magic' },
  { id: 'bs_weak_scan', name: '弱点スキャン', job: '機工師', desc: '弱点を解析。', mp: 4, power: 0, skill_type: 'support', scaling_stat: 'magic', effect_type: 'scan' },
  { id: 'bs_field_repair', name: '応急修理', job: '機工師', desc: '自身を修理。', mp: 7, power: 0.25, skill_type: 'recovery', scaling_stat: 'spirit', target_type: 'self' },
  { id: 'bs_deep_pierce', name: '深層穿ち', job: '機工師', desc: '深く穿つ。', mp: 8, power: 1.15, skill_type: 'break', scaling_stat: 'magic', break_power: 30 },
  { id: 'bs_turret_set', name: '砲台設置', job: '機工師', desc: '砲台を設置。', mp: 8, power: 0, skill_type: 'break', scaling_stat: 'magic', effect_type: 'trap' },
  { id: 'bs_core_bullet', name: '炉心弾', job: '機工師', desc: '炉心の弾。', mp: 10, power: 1.2, skill_type: 'machine', scaling_stat: 'magic', break_power: 15 },
  { id: 'bs_arc_jam', name: 'アーク干渉', job: '機工師', desc: '干渉波を放つ。', mp: 9, power: 0.85, skill_type: 'debuff', scaling_stat: 'magic', effect_type: 'slow', target_type: 'single_enemy' },
  { id: 'bs_multi_aim', name: '多重照準', job: '機工師', desc: '複数照準。', mp: 8, power: 0, skill_type: 'support', scaling_stat: 'magic', effect_type: 'scan' },
  { id: 'bs_deep_analysis', name: '深層解析', job: '機工師', desc: '深層を解析。', mp: 7, power: 0, skill_type: 'support', scaling_stat: 'magic', effect_type: 'scan', break_power: 10 },
  { id: 'bs_control_volley', name: '制御弾幕', job: '機工師', desc: '制御された弾幕。', mp: 12, power: 0.42, skill_type: 'machine', scaling_stat: 'magic', hits: 3, target_type: 'all_enemies' },
  { id: 'bs_creation_cannon_ultimate', name: '創造砲奥義', job: '機工師', desc: '機工師の奥義。', mp: 18, power: 1.7, skill_type: 'special', scaling_stat: 'magic', secondary_scaling_stat: 'attack', break_power: 35 },

  // --- 格闘士 ---
  { id: 'bs_straight_punch', name: '正拳', job: '格闘士', desc: '正拳突き。', mp: 3, power: 1.0, skill_type: 'physical', scaling_stat: 'attack' },
  { id: 'bs_spirit_shout', name: '気合', job: '格闘士', desc: '気を込める。', mp: 5, power: 0.15, skill_type: 'support', scaling_stat: 'spirit', effect_type: 'atk_buff' },
  { id: 'bs_combo', name: '連打', job: '格闘士', desc: '連続攻撃。', mp: 6, power: 0.55, skill_type: 'physical', scaling_stat: 'attack', hits: 3 },
  { id: 'bs_armor_break', name: '破甲拳', job: '格闘士', desc: '装甲を砕く。', mp: 7, power: 1.0, skill_type: 'break', scaling_stat: 'attack', break_power: 22 },
  { id: 'bs_ukemi', name: '受け身', job: '格闘士', desc: '受け身で身を守る。', mp: 4, power: 0, skill_type: 'guard', scaling_stat: 'speed', effect_type: 'guard' },
  { id: 'bs_dragon_bone_crush', name: '竜骨砕き', job: '格闘士', desc: '竜骨を砕く。', mp: 9, power: 1.15, skill_type: 'break', scaling_stat: 'attack', break_power: 28 },
  { id: 'bs_ash_fist_rampage', name: '灰拳乱舞', job: '格闘士', desc: '灰の乱舞。', mp: 10, power: 0.32, skill_type: 'physical', scaling_stat: 'attack', hits: 4, target_type: 'all_enemies' },
  { id: 'bs_blood_stance', name: '血潮の構え', job: '格闘士', desc: '血潮を燃やす。', mp: 7, power: 0, skill_type: 'support', scaling_stat: 'attack', effect_type: 'atk_buff' },
  { id: 'bs_taboo_combo', name: '破戒連撃', job: '格闘士', desc: '破戒の連撃。', mp: 11, power: 0.6, skill_type: 'physical', scaling_stat: 'attack', hits: 3, break_power: 12 },
  { id: 'bs_iron_body', name: '剛体', job: '格闘士', desc: '体を鋼にする。', mp: 8, power: 0, skill_type: 'guard', scaling_stat: 'defense', effect_type: 'guard_strong' },
  { id: 'bs_fist_king_ultimate', name: '拳闘王奥義', job: '格闘士', desc: '格闘士の奥義。', mp: 16, power: 1.65, skill_type: 'special', scaling_stat: 'attack', break_power: 30, hits: 2 },
];

export function getUnlocksUpToLevel(jobName: string, level: number): JobUnlock[] {
  return (JOB_SKILL_UNLOCKS[jobName] ?? []).filter((u) => u.level <= level);
}

export function getNextUnlock(jobName: string, currentLevel: number): JobUnlock | undefined {
  return (JOB_SKILL_UNLOCKS[jobName] ?? []).find((u) => u.level > currentLevel);
}
