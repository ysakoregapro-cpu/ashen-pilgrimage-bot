import type Database from 'better-sqlite3';

const SETS: { id: string; name: string; tier: string; bonuses: { count: number; desc: string; effect: Record<string, number> }[] }[] = [
  { id: 'set_starfield', name: '星原シリーズ', tier: 'R', bonuses: [
    { count: 2, desc: 'HP +3%', effect: { hp_pct: 0.03 } },
    { count: 3, desc: '探索素材入手率 +5%', effect: { explore_drop_pct: 0.05 } },
    { count: 5, desc: '戦闘開始時小バリア', effect: { battle_barrier: 1 } },
  ]},
  { id: 'set_old_road', name: '古道シリーズ', tier: 'R', bonuses: [
    { count: 2, desc: '速度 +2%', effect: { speed_pct: 0.02 } },
    { count: 3, desc: '逃走成功率 +5%', effect: { flee_bonus_pct: 0.05 } },
    { count: 5, desc: '探索イベント発生率 +5%', effect: { explore_event_pct: 0.05 } },
  ]},
  { id: 'set_rain', name: '雨音シリーズ', tier: 'R', bonuses: [
    { count: 2, desc: 'MP +3%', effect: { mp_pct: 0.03 } },
    { count: 3, desc: '毒耐性 +8%', effect: { poison_resist: 0.08 } },
    { count: 5, desc: 'ターン終了時低確率MP回復', effect: { mp_regen_chance: 0.1 } },
  ]},
  { id: 'set_twilight', name: '薄明シリーズ', tier: 'R', bonuses: [
    { count: 2, desc: '回復効果 +3%', effect: { heal_bonus_pct: 0.03 } },
    { count: 3, desc: '救難参加時被回復量 +5%', effect: { rescue_heal_pct: 0.05 } },
    { count: 5, desc: '味方回復時自己も少量回復', effect: { heal_self_pct: 0.05 } },
  ]},
  { id: 'set_silver', name: '白銀シリーズ', tier: 'R', bonuses: [
    { count: 2, desc: '防御 +3%', effect: { defense_pct: 0.03 } },
    { count: 3, desc: 'ブレイク耐性 +5%', effect: { break_resist: 0.05 } },
    { count: 5, desc: '防御時低確率反撃', effect: { counter_chance: 0.1 } },
  ]},
  { id: 'set_mist', name: '霧守りシリーズ', tier: 'R', bonuses: [
    { count: 2, desc: '毒耐性 +10%', effect: { poison_resist: 0.1 } },
    { count: 3, desc: '回避 +3%', effect: { evasion: 0.03 } },
    { count: 5, desc: '状態異常低確率無効', effect: { status_null_chance: 0.08 } },
  ]},
  { id: 'set_moon', name: '月下シリーズ', tier: 'SR', bonuses: [
    { count: 2, desc: '魔力 +3%', effect: { magic_pct: 0.03 } },
    { count: 3, desc: '解析済み敵ダメージ +5%', effect: { analyzed_dmg_pct: 0.05 } },
    { count: 5, desc: '戦闘開始時敵情報開示', effect: { reveal_enemy: 1 } },
  ]},
  { id: 'set_ash_crown', name: '灰冠シリーズ', tier: 'SR', bonuses: [
    { count: 2, desc: '攻撃 +3%', effect: { attack_pct: 0.03 } },
    { count: 3, desc: '旧軍系ダメージ +5%', effect: { old_army_dmg_pct: 0.05 } },
    { count: 5, desc: 'HP50%以下で与ダメージ上昇', effect: { low_hp_dmg_pct: 0.1 } },
  ]},
  { id: 'set_dragonbone', name: '竜骨シリーズ', tier: 'SR', bonuses: [
    { count: 2, desc: '会心率 +3%', effect: { crit_rate: 0.03 } },
    { count: 3, desc: '大型敵ダメージ +5%', effect: { large_dmg_pct: 0.05 } },
    { count: 5, desc: '部位破壊時追加報酬', effect: { part_break_bonus: 1 } },
  ]},
  { id: 'set_silence', name: '沈黙シリーズ', tier: 'SR', bonuses: [
    { count: 2, desc: '精神 +3%', effect: { spirit_pct: 0.03 } },
    { count: 3, desc: '状態異常回復効果 +5%', effect: { cleanse_bonus_pct: 0.05 } },
    { count: 5, desc: '戦闘不能時1度耐える', effect: { survive_once: 1 } },
  ]},
  { id: 'set_glass', name: '硝子沼シリーズ', tier: 'SR', bonuses: [
    { count: 2, desc: '回避 +3%', effect: { evasion: 0.03 } },
    { count: 3, desc: '魔法被ダメ -4%', effect: { magic_dmg_reduce: 0.04 } },
    { count: 5, desc: '回避成功時敵に小ダメ', effect: { evade_counter: 1 } },
  ]},
  { id: 'set_red_ash', name: '赤灰シリーズ', tier: 'SR', bonuses: [
    { count: 2, desc: '攻撃+2%/防御+2%', effect: { attack_pct: 0.02, defense_pct: 0.02 } },
    { count: 3, desc: '炎属性ダメージ +5%', effect: { fire_dmg_pct: 0.05 } },
    { count: 5, desc: '被弾時低確率攻撃上昇', effect: { hit_atk_buff: 0.1 } },
  ]},
  { id: 'set_deep_furnace', name: '深層炉シリーズ', tier: 'SSR', bonuses: [
    { count: 2, desc: '攻撃 +4%', effect: { attack_pct: 0.04 } },
    { count: 3, desc: '攻撃 +2% / 防御 +2%', effect: { attack_pct: 0.02, defense_pct: 0.02 } },
    { count: 5, desc: '全ステ +5% / 会心ダメ +5%', effect: { all_stat_pct: 0.05, crit_damage: 0.05 } },
  ]},
  { id: 'set_black_lamp', name: '黒灯シリーズ', tier: 'SSR', bonuses: [
    { count: 2, desc: '攻撃 +4%', effect: { attack_pct: 0.04 } },
    { count: 3, desc: '会心 +3% / 会心ダメ +3%', effect: { crit_rate: 0.03, crit_damage: 0.03 } },
    { count: 5, desc: '攻撃 +5% / 会心 +5%', effect: { attack_pct: 0.05, crit_rate: 0.05 } },
  ]},
  { id: 'set_starfall', name: '星落ちシリーズ', tier: 'SSR', bonuses: [
    { count: 2, desc: '魔力 +4%', effect: { magic_pct: 0.04 } },
    { count: 3, desc: '魔力 +2% / 精神 +2%', effect: { magic_pct: 0.02, spirit_pct: 0.02 } },
    { count: 5, desc: '全ステ +4% / 魔力 +4%', effect: { all_stat_pct: 0.04, magic_pct: 0.04 } },
  ]},
  { id: 'set_iron_snow', name: '鉄雪シリーズ', tier: 'SSR', bonuses: [
    { count: 2, desc: '防御 +4%', effect: { defense_pct: 0.04 } },
    { count: 3, desc: '防御 +3% / HP +3%', effect: { defense_pct: 0.03, hp_pct: 0.03 } },
    { count: 5, desc: '全ステ +3% / 防御 +5%', effect: { all_stat_pct: 0.03, defense_pct: 0.05 } },
  ]},
  { id: 'set_valhalla', name: 'ヴァルハラシリーズ', tier: 'UR', bonuses: [
    { count: 2, desc: '全ステ +4%', effect: { all_stat_pct: 0.04 } },
    { count: 3, desc: '攻撃 +3% / 防御 +3%', effect: { attack_pct: 0.03, defense_pct: 0.03 } },
    { count: 5, desc: '全ステ +5% / 会心ダメ +8%', effect: { all_stat_pct: 0.05, crit_damage: 0.08 } },
  ]},
  { id: 'set_old_king', name: '旧王シリーズ', tier: 'UR', bonuses: [
    { count: 2, desc: '攻撃 +5%', effect: { attack_pct: 0.05 } },
    { count: 3, desc: '精神 +4% / 防御 +3%', effect: { spirit_pct: 0.04, defense_pct: 0.03 } },
    { count: 5, desc: '攻撃 +6% / 全ステ +3%', effect: { attack_pct: 0.06, all_stat_pct: 0.03 } },
  ]},
];

type Wpn = { id: string; name: string; rarity: string; wtype: string; atk?: number; mag?: number; def?: number; effect?: string; unique?: boolean; srcId?: string; maxUpg?: number };
type Armor = { id: string; name: string; rarity: string; setId: string; slot: string; def: number; hp?: number; effect?: string };

const N_WEAPONS: Wpn[] = [
  { id: 'wpn_traveler_sword', name: '旅人の剣', rarity: 'N', wtype: 'sword', atk: 8 },
  { id: 'wpn_rust_dagger', name: '錆びた短剣', rarity: 'N', wtype: 'dagger', atk: 6 },
  { id: 'wpn_wood_axe', name: '木こりの斧', rarity: 'N', wtype: 'axe', atk: 10 },
  { id: 'wpn_old_bow', name: '古い弓', rarity: 'N', wtype: 'bow', atk: 7 },
  { id: 'wpn_apprentice_staff', name: '見習い杖', rarity: 'N', wtype: 'staff', mag: 8 },
  { id: 'wpn_leather_gauntlet', name: '皮巻きの拳甲', rarity: 'N', wtype: 'fist', atk: 7 },
  { id: 'wpn_crude_spear', name: '粗末な槍', rarity: 'N', wtype: 'spear', atk: 9 },
  { id: 'wpn_mini_cannon', name: '小型機工砲', rarity: 'N', wtype: 'cannon', atk: 8, mag: 4 },
  { id: 'wpn_training_shield', name: '訓練用大盾', rarity: 'N', wtype: 'shield', def: 6, atk: 3 },
  { id: 'wpn_training_hammer', name: '訓練用槌', rarity: 'N', wtype: 'hammer', atk: 9 },
  { id: 'wpn_prayer_rod', name: '祈りの短杖', rarity: 'N', wtype: 'rod', mag: 7 },
  { id: 'wpn_cracked_axe', name: 'ひび割れた斧', rarity: 'N', wtype: 'axe', atk: 9 },
  { id: 'wpn_old_road_knife', name: '古道のナイフ', rarity: 'N', wtype: 'dagger', atk: 6, effect: 'explore_drop_pct:0.03' },
  { id: 'wpn_rain_bow', name: '雨濡れの弓', rarity: 'N', wtype: 'bow', atk: 7, effect: 'poison_resist:0.05' },
  { id: 'wpn_iron_scrap_barrel', name: '鉄屑の砲筒', rarity: 'N', wtype: 'cannon', atk: 9 },
  { id: 'wpn_broken_wrap', name: '欠けた拳帯', rarity: 'N', wtype: 'fist', atk: 6 },
];

const R_WEAPONS: Wpn[] = [
  { id: 'wpn_starfield_sword', name: '星原の剣', rarity: 'R', wtype: 'sword', atk: 14 },
  { id: 'wpn_old_road_dagger', name: '古道の短剣', rarity: 'R', wtype: 'dagger', atk: 12, effect: 'flee_bonus_pct:0.03' },
  { id: 'wpn_twilight_bow', name: '薄明の弓', rarity: 'R', wtype: 'bow', atk: 13 },
  { id: 'wpn_silver_hammer', name: '白銀の槌', rarity: 'R', wtype: 'hammer', atk: 16 },
  { id: 'wpn_mist_staff', name: '霧払いの杖', rarity: 'R', wtype: 'staff', mag: 14 },
  { id: 'wpn_moon_rod', name: '月読の短杖', rarity: 'R', wtype: 'rod', mag: 13 },
  { id: 'wpn_ash_spear', name: '灰冠の槍', rarity: 'R', wtype: 'spear', atk: 15 },
  { id: 'wpn_dragon_fist', name: '竜骨の拳甲', rarity: 'R', wtype: 'fist', atk: 14 },
  { id: 'wpn_silence_seal', name: '沈黙の聖印', rarity: 'R', wtype: 'seal', mag: 12 },
  { id: 'wpn_red_ash_axe', name: '赤灰の斧', rarity: 'R', wtype: 'axe', atk: 16 },
  { id: 'wpn_glass_blade', name: '硝子沼の刃', rarity: 'R', wtype: 'sword', atk: 14 },
  { id: 'wpn_iron_snow_shield', name: '鉄雪の盾', rarity: 'R', wtype: 'shield', atk: 5 },
  { id: 'wpn_black_lamp_twin', name: '黒灯りの双刃', rarity: 'R', wtype: 'dagger', atk: 13 },
];

const SR_WEAPONS: Wpn[] = [
  { id: 'wpn_mist_bow_sr', name: '霧払いの弓', rarity: 'SR', wtype: 'bow', atk: 20, effect: 'evasion:0.02' },
  { id: 'wpn_ash_knight_shield', name: '灰騎士の大盾', rarity: 'SR', wtype: 'shield', atk: 8 },
  { id: 'wpn_moon_staff_sr', name: '月読の杖', rarity: 'SR', wtype: 'staff', mag: 22 },
  { id: 'wpn_dragon_fist_sr', name: '竜骨の拳甲', rarity: 'SR', wtype: 'fist', atk: 22 },
  { id: 'wpn_silence_seal_sr', name: '沈黙の聖印', rarity: 'SR', wtype: 'seal', mag: 20 },
  { id: 'wpn_unique_silence', name: '静寂の聖印', rarity: 'SR', wtype: 'seal', mag: 20 },
  { id: 'wpn_red_ash_axe_sr', name: '赤灰の戦斧', rarity: 'SR', wtype: 'axe', atk: 24 },
  { id: 'wpn_starfall_spear', name: '星落ちの槍', rarity: 'SR', wtype: 'spear', atk: 23 },
  { id: 'wpn_black_exec_blade', name: '黒灯の処刑刃', rarity: 'SR', wtype: 'sword', atk: 22, effect: 'crit_rate:0.03' },
];

const SSR_WEAPONS: Wpn[] = [
  { id: 'wpn_ash_knight_sword', name: '灰冠騎士剣', rarity: 'SSR', wtype: 'sword', atk: 30 },
  { id: 'wpn_dragon_pierce', name: '竜骨穿槍', rarity: 'SSR', wtype: 'spear', atk: 32 },
  { id: 'wpn_moon_spell_staff', name: '月下術杖', rarity: 'SSR', wtype: 'staff', mag: 34 },
  { id: 'wpn_deep_cannon', name: '深層機構砲', rarity: 'SSR', wtype: 'cannon', atk: 28, mag: 14 },
  { id: 'wpn_prayer_robe_weapon', name: '祈り縫いの聖衣', rarity: 'SSR', wtype: 'robe', mag: 30 },
  { id: 'wpn_black_iron_blade', name: '黒鉄の処刑刃', rarity: 'SSR', wtype: 'sword', atk: 31 },
  { id: 'wpn_iron_snow_greatshield', name: '鉄雪大盾', rarity: 'SSR', wtype: 'shield', atk: 12 },
  { id: 'wpn_hollow_bell_bow', name: '空鐘の弓', rarity: 'SSR', wtype: 'bow', atk: 29 },
];

const UR_WEAPONS: Wpn[] = [
  { id: 'wpn_valhalla_blade', name: 'ヴァルハラ・ブレード', rarity: 'UR', wtype: 'sword', atk: 42, maxUpg: 15 },
  { id: 'wpn_core_spear_grau', name: '炉心槍グラウ', rarity: 'UR', wtype: 'spear', atk: 44, maxUpg: 15 },
  { id: 'wpn_old_king_staff', name: '旧王の魔杖', rarity: 'UR', wtype: 'staff', mag: 45, maxUpg: 15 },
  { id: 'wpn_sky_bow_fress', name: '空塞弓フレス', rarity: 'UR', wtype: 'bow', atk: 41, maxUpg: 15 },
  { id: 'wpn_deep_cannon_regin', name: '深層砲レギン', rarity: 'UR', wtype: 'cannon', atk: 40, mag: 20, maxUpg: 15 },
  { id: 'wpn_ash_wing_twin', name: '灰翼の双刃', rarity: 'UR', wtype: 'dagger', atk: 40, maxUpg: 15 },
  { id: 'wpn_zero_shield', name: '統治軍制式大盾・零式', rarity: 'UR', wtype: 'shield', atk: 18, maxUpg: 15 },
  { id: 'wpn_starfall_judge', name: '星落ちの裁杖', rarity: 'UR', wtype: 'staff', mag: 44, maxUpg: 15 },
  { id: 'wpn_black_exec_sword', name: '黒灯処刑剣', rarity: 'UR', wtype: 'sword', atk: 43, maxUpg: 15 },
  { id: 'wpn_iron_snow_king_shield', name: '鉄雪王盾', rarity: 'UR', wtype: 'shield', atk: 16, maxUpg: 15 },
];

const UNIQUE_WEAPONS: Wpn[] = [
  { id: 'wpn_unique_twilight', name: '黄昏の古剣', rarity: 'Uni', wtype: 'sword', atk: 28, unique: true, srcId: 'src_twilight' },
  { id: 'wpn_unique_lamp', name: '灯火の古杖', rarity: 'Uni', wtype: 'rod', mag: 29, unique: true, srcId: 'src_lamp' },
  { id: 'wpn_unique_deep', name: '深層の砲筒', rarity: 'Uni', wtype: 'cannon', atk: 28, mag: 14, unique: true, srcId: 'src_deep' },
  { id: 'wpn_unique_echo', name: '残響の古弓', rarity: 'Uni', wtype: 'bow', atk: 28, unique: true, srcId: 'src_echo' },
  { id: 'wpn_unique_mirror', name: '灰鏡の刀', rarity: 'Uni', wtype: 'dagger', atk: 28, unique: true, srcId: 'src_mirror' },
  { id: 'wpn_unique_silver', name: '白銀の古槌', rarity: 'Uni', wtype: 'hammer', atk: 28, unique: true, srcId: 'src_silver' },
  { id: 'wpn_unique_old_hammer', name: '古炉の訓練槌', rarity: 'Uni', wtype: 'hammer', atk: 28, unique: true, srcId: 'src_silver' },
  { id: 'wpn_unique_mist_lantern', name: '霧灯の星杖', rarity: 'Uni', wtype: 'staff', mag: 29, unique: true, srcId: 'src_mist_lantern' },
  { id: 'wpn_unique_old_shield', name: '古王の割盾', rarity: 'Uni', wtype: 'shield', atk: 13, unique: true, srcId: 'src_old_shield' },
  { id: 'wpn_unique_star_scar', name: '星痕の古槍', rarity: 'Uni', wtype: 'spear', atk: 28, unique: true, srcId: 'src_star_scar' },
  { id: 'wpn_unique_tuner', name: '壊れた調律器', rarity: 'Uni', wtype: 'tuner', mag: 27, unique: true, srcId: 'src_tuner' },
  { id: 'wpn_unique_black_fox', name: '黒狐の短刃', rarity: 'Uni', wtype: 'dagger', atk: 28, unique: true, srcId: 'src_black_fox' },
  { id: 'wpn_unique_bind', name: '古びた繋ぎ糸', rarity: 'Uni', wtype: 'bind', mag: 27, unique: true, srcId: 'src_bind' },
];

function genArmor(setId: string, setName: string, rarity: string, baseDef: number): Armor[] {
  const slots = ['head', 'body', 'arms', 'legs', 'feet'] as const;
  const slotNames = { head: '兜', body: '鎧', arms: '篭手', legs: '腿当て', feet: '靴' };
  return slots.map((slot) => ({
    id: `arm_${setId}_${slot}`,
    name: `${setName}${slotNames[slot]}`,
    rarity,
    setId,
    slot,
    def: baseDef + (slot === 'body' ? 4 : slot === 'head' ? 2 : 1),
    hp: slot === 'body' ? 20 : 10,
  }));
}

export function seedEquipmentAndSets(db: Database.Database, ts: string): void {
  const insSet = db.prepare(`INSERT INTO equipment_sets (id, name, description, tier) VALUES (?, ?, ?, ?)`);
  const insBonus = db.prepare(`INSERT INTO equipment_set_bonuses (set_id, piece_count, effect_description, effect_json) VALUES (?, ?, ?, ?)`);
  for (const s of SETS) {
    insSet.run(s.id, s.name, `${s.name}の防具セット`, s.tier);
    for (const b of s.bonuses) {
      insBonus.run(s.id, b.count, b.desc, JSON.stringify(b.effect));
    }
  }

  const insItem = db.prepare(`
    INSERT INTO items (id, name, category, rarity, description, source_text, usage_text, sell_price, tradeable, created_at)
    VALUES (?, ?, 'equipment', ?, ?, ?, '装備', ?, ?, ?)
  `);
  const insEq = db.prepare(`
    INSERT INTO equipment (item_id, slot, series_id, weapon_type, attack_bonus, magic_bonus, defense_bonus, spirit_bonus, speed_bonus, hp_bonus, mp_bonus, special_effect_json, max_upgrade_level, is_unique, src_weapon_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, ?, ?, ?, ?)
  `);

  const rarityMax: Record<string, number> = { N: 5, R: 5, SR: 7, SSR: 10, UR: 15, Uni: 7, Src: 10 };
  const allWeapons = [...N_WEAPONS, ...R_WEAPONS, ...SR_WEAPONS, ...SSR_WEAPONS, ...UR_WEAPONS, ...UNIQUE_WEAPONS];

  for (const w of allWeapons) {
    const tradeable = w.unique ? 0 : w.rarity === 'Src' ? 0 : 1;
    insItem.run(w.id, w.name, w.rarity, `${w.name}の武器`, '探索・ドロップ', 50, tradeable, ts);
    const def = w.def ?? 0;
    insEq.run(
      w.id, 'weapon', null, w.wtype,
      w.atk ?? 0, w.mag ?? 0, def,
      0, w.effect ? JSON.stringify(parseEffect(w.effect)) : null,
      w.maxUpg ?? rarityMax[w.rarity] ?? 5,
      w.unique ? 1 : 0, w.srcId ?? null,
    );
  }

  const armorDefs: { setId: string; name: string; rarity: string; def: number }[] = [
    { setId: 'set_starfield', name: '星原', rarity: 'R', def: 5 },
    { setId: 'set_old_road', name: '古道', rarity: 'R', def: 5 },
    { setId: 'set_rain', name: '雨音', rarity: 'R', def: 6 },
    { setId: 'set_twilight', name: '薄明', rarity: 'R', def: 6 },
    { setId: 'set_silver', name: '白銀', rarity: 'R', def: 7 },
    { setId: 'set_mist', name: '霧守り', rarity: 'R', def: 7 },
    { setId: 'set_moon', name: '月下', rarity: 'SR', def: 10 },
    { setId: 'set_ash_crown', name: '灰冠', rarity: 'SR', def: 11 },
    { setId: 'set_dragonbone', name: '竜骨', rarity: 'SR', def: 11 },
    { setId: 'set_silence', name: '沈黙', rarity: 'SR', def: 10 },
    { setId: 'set_glass', name: '硝子沼', rarity: 'SR', def: 10 },
    { setId: 'set_red_ash', name: '赤灰', rarity: 'SR', def: 12 },
    { setId: 'set_deep_furnace', name: '深層炉', rarity: 'SSR', def: 15 },
    { setId: 'set_black_lamp', name: '黒灯', rarity: 'SSR', def: 14 },
    { setId: 'set_starfall', name: '星落ち', rarity: 'SSR', def: 14 },
    { setId: 'set_iron_snow', name: '鉄雪', rarity: 'SSR', def: 16 },
    { setId: 'set_valhalla', name: 'ヴァルハラ', rarity: 'UR', def: 20 },
    { setId: 'set_old_king', name: '旧王', rarity: 'UR', def: 19 },
  ];

  for (const a of armorDefs) {
    for (const piece of genArmor(a.setId, a.name, a.rarity, a.def)) {
      insItem.run(piece.id, piece.name, piece.rarity, `${piece.name}`, '探索・ドロップ', 40, 1, ts);
      insEq.run(piece.id, piece.slot, a.setId, null, 0, 0, piece.def, piece.hp ?? 0, null, rarityMax[piece.rarity] ?? 5, 0, null);
    }
  }
}

function parseEffect(s: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of s.split(',')) {
    const [k, v] = part.split(':');
    if (k && v) out[k.trim()] = parseFloat(v);
  }
  return out;
}
