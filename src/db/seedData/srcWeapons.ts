import type Database from 'better-sqlite3';
import { computeSrcBaseStats } from '../../systems/enhanceSystem';
import { MAX_SRC_WEAPON_LEVEL } from './weaponTierBalanceMaster';

const SRC_WEAPONS = [
  { id: 'src_twilight', base: 'wpn_unique_twilight', srcItem: 'wpn_src_twilight', name: 'Src: 黄昏剣', jobs: ['剣士', '剣豪', '魔剣士', '星剣士'], skill: 'skill_twilight_combo', plus10: '敵HP50%以下で追撃', manifest: { gold: 5000, materials: [{ id: 'src_primordial', qty: 3 }, { id: 'mat_hourglass_shard', qty: 5 }] } },
  { id: 'src_lamp', base: 'wpn_unique_lamp', srcItem: 'wpn_src_lamp', name: 'Src: 灯火杖', jobs: ['祈祷師', '司祭', '癒し手', '繋ぎ手'], skill: 'skill_lamp_prayer', plus10: '蘇生時に味方全体へ小バリア', manifest: { gold: 5000, materials: [{ id: 'src_lamp_core', qty: 3 }, { id: 'src_bind_thread', qty: 5 }] } },
  { id: 'src_mist_lantern', base: 'wpn_unique_mist_lantern', srcItem: 'wpn_src_mist_lantern', name: 'Src: 霧灯星杖', jobs: ['魔術師', '星読み', '黒魔導士', '調律師'], skill: 'skill_lamp_prayer', plus10: '星属性魔法の与ダメージ上昇', manifest: { gold: 5000, materials: [{ id: 'src_echo_core', qty: 3 }, { id: 'mat_starfall_shard', qty: 5 }] } },
  { id: 'src_deep', base: 'wpn_unique_deep', srcItem: 'wpn_src_deep', name: 'Src: 深層砲', jobs: ['機工師', '錬機師', '砲術師', 'アーク技師'], skill: 'skill_deep_pierce', plus10: 'ブレイクゲージ削り大幅上昇', manifest: { gold: 6000, materials: [{ id: 'src_deep_furnace', qty: 3 }, { id: 'mat_deep_soot', qty: 10 }] } },
  { id: 'src_echo', base: 'wpn_unique_echo', srcItem: 'wpn_src_echo', name: 'Src: 残響弓', jobs: ['狩人', '追跡者', '弓聖'], skill: 'skill_echo_shot', plus10: '弱点命中時に追加射撃', manifest: { gold: 5000, materials: [{ id: 'src_echo_core', qty: 3 }, { id: 'mat_moon_ink', qty: 8 }] } },
  { id: 'src_mirror', base: 'wpn_unique_mirror', srcItem: 'wpn_src_mirror', name: 'Src: 灰鏡刀', jobs: ['斥候', '暗部', '執行者'], skill: 'skill_mirror_slash', plus10: '回避成功後、次攻撃が確定会心', manifest: { gold: 5500, materials: [{ id: 'src_mirror_shard', qty: 3 }, { id: 'src_ash_star', qty: 2 }] } },
  { id: 'src_silver', base: 'wpn_unique_silver', srcItem: 'wpn_src_silver', name: 'Src: 白銀槌', jobs: ['重騎士', '城塞騎士', '聖盾士'], skill: 'skill_silver_break', plus10: '防御中でも反撃可能', manifest: { gold: 5000, materials: [{ id: 'mat_silver_ore', qty: 15 }, { id: 'src_primordial', qty: 2 }] } },
  { id: 'src_silence', base: 'wpn_unique_silence', srcItem: 'wpn_src_silence', name: 'Src: 静寂聖印', jobs: ['祈祷師', '司祭', '調律師'], skill: 'skill_silence_tune', plus10: '状態異常解除時に追加回復', manifest: { gold: 5000, materials: [{ id: 'src_silence_tune', qty: 3 }, { id: 'mat_silent_holy', qty: 8 }] } },
  { id: 'src_old_shield', base: 'wpn_unique_old_shield', srcItem: 'wpn_src_old_shield', name: 'Src: 古王盾', jobs: ['重騎士', '聖盾士', '黄昏騎士'], skill: 'skill_old_king_stance', plus10: '味方をかばった時、被ダメージ大幅軽減', manifest: { gold: 6000, materials: [{ id: 'src_old_king_mark', qty: 3 }, { id: 'mat_ash_crest', qty: 10 }] } },
  { id: 'src_star_scar', base: 'wpn_unique_star_scar', srcItem: 'wpn_src_star_scar', name: 'Src: 星痕槍', jobs: ['剣士', '追跡者', '星剣士'], skill: 'skill_star_scar', plus10: 'ブレイク中の敵に追加星属性ダメージ', manifest: { gold: 5500, materials: [{ id: 'src_star_mark', qty: 3 }, { id: 'mat_starfall_shard', qty: 5 }] } },
  { id: 'src_tuner', base: 'wpn_unique_tuner', srcItem: 'wpn_src_tuner', name: 'Src: 調律器', jobs: ['解析者', '調律師', 'アーク技師'], skill: 'skill_silence_tune', plus10: '敵の強化効果を低確率で解除', manifest: { gold: 5500, materials: [{ id: 'src_silence_tune', qty: 3 }, { id: 'src_echo_core', qty: 3 }] } },
  { id: 'src_black_fox', base: 'wpn_unique_black_fox', srcItem: 'wpn_src_black_fox', name: 'Src: 黒狐刃', jobs: ['斥候', '暗部', '執行者'], skill: 'skill_black_fox', plus10: '低HP時、与ダメージ大幅上昇', manifest: { gold: 5000, materials: [{ id: 'src_mirror_shard', qty: 2 }, { id: 'mat_forgotten_sand', qty: 10 }] } },
  { id: 'src_bind', base: 'wpn_unique_bind', srcItem: 'wpn_src_bind', name: 'Src: 繋ぎ糸', jobs: ['繋ぎ手', '癒し手', '調律師'], skill: 'skill_bind_light', plus10: '味方全体のHPが低いほど回復量上昇', manifest: { gold: 5000, materials: [{ id: 'src_bind_thread', qty: 5 }, { id: 'src_lamp_core', qty: 3 }] } },
];

function upgradeReqs(level: number): { gold: number; materials: { id: string; qty: number }[]; desc: string } {
  if (level <= 3) return { gold: 1000 * level, materials: [{ id: 'src_upg_shard', qty: level * 2 }, { id: 'upg_stone', qty: level }], desc: '基礎性能上昇' };
  if (level <= 6) return { gold: 3000 * level, materials: [{ id: 'src_upg_core', qty: level }, { id: 'upg_fine_stone', qty: level }], desc: '固有スキル強化' };
  if (level <= 9) return { gold: 5000 * level, materials: [{ id: 'src_star_scar_crystal', qty: level - 6 }, { id: 'raid_valhalla_plate', qty: level - 6 }], desc: '追加パッシブ解放' };
  if (level === 10) return { gold: 50000, materials: [{ id: 'src_valhalla_core', qty: 1 }, { id: 'src_old_king_echo', qty: 1 }, { id: 'src_machina_core', qty: 1 }, { id: 'src_star_mark_full', qty: 1 }], desc: '最終効果解放' };
  if (level <= 12) return { gold: 8000 * level, materials: [{ id: 'src_upg_core', qty: 2 }, { id: 'upg_rare_stone', qty: 2 }], desc: '極限性能上昇' };
  if (level <= 14) return { gold: 12000 * level, materials: [{ id: 'src_star_scar_crystal', qty: 2 }, { id: 'raid_deep_core', qty: 2 }, { id: 'upg_deep_core_stone', qty: 1 }], desc: '最終性能強化' };
  return { gold: 80000, materials: [{ id: 'src_valhalla_core', qty: 1 }, { id: 'src_old_king_echo', qty: 1 }, { id: 'upg_old_king_stone', qty: 3 }], desc: '最終段階強化（+15）' };
}

export function seedSrcWeapons(db: Database.Database): void {
  const ts = new Date().toISOString();
  const insItem = db.prepare(`INSERT INTO items (id, name, category, rarity, description, source_text, usage_text, sell_price, tradeable, created_at) VALUES (?, ?, 'equipment', 'Src', ?, 'Src化', '装備', 0, 0, ?)`);
  const insEq = db.prepare(`INSERT INTO equipment (item_id, slot, series_id, weapon_type, attack_bonus, magic_bonus, defense_bonus, spirit_bonus, speed_bonus, hp_bonus, mp_bonus, special_effect_json, skill_id, max_upgrade_level, is_unique, src_weapon_id) VALUES (?, 'weapon', NULL, ?, ?, ?, 0, 0, 0, 0, 0, NULL, ?, ?, 0, ?)`);
  const insSrc = db.prepare(`INSERT INTO src_weapons (id, base_item_id, src_item_id, name, jobs_json, innate_skill_id, plus10_effect, manifest_requirements_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insUpg = db.prepare(`INSERT INTO src_weapon_upgrades (src_weapon_id, target_src_level, gold_cost, material_requirements_json, effect_description) VALUES (?, ?, ?, ?, ?)`);

  for (const s of SRC_WEAPONS) {
    const baseEq = db.prepare('SELECT * FROM equipment WHERE item_id = ?').get(s.base) as { weapon_type: string; attack_bonus: number; magic_bonus: number } | undefined;
    const wtype = baseEq?.weapon_type ?? 'sword';
    const atk = computeSrcBaseStats(baseEq?.attack_bonus ?? 0, 0).atk;
    const mag = computeSrcBaseStats(0, baseEq?.magic_bonus ?? 0).mag;

    insItem.run(s.srcItem, s.name, `${s.name} — 伝承武器`, ts);
    insEq.run(s.srcItem, wtype, atk, mag, s.skill, MAX_SRC_WEAPON_LEVEL, s.id);
    insSrc.run(s.id, s.base, s.srcItem, s.name, JSON.stringify(s.jobs), s.skill, s.plus10, JSON.stringify(s.manifest));

    for (let lv = 1; lv <= MAX_SRC_WEAPON_LEVEL; lv++) {
      const req = upgradeReqs(lv);
      insUpg.run(s.id, lv, req.gold, JSON.stringify(req.materials), req.desc);
    }
  }
}

/** 既存DB — Src武器 max_upgrade_level=15 と +11〜+15 強化行 */
export function ensureSrcWeaponLevel15(db: Database.Database): void {
  db.prepare(`
    UPDATE equipment SET max_upgrade_level = ?
    WHERE item_id IN (SELECT src_item_id FROM src_weapons)
  `).run(MAX_SRC_WEAPON_LEVEL);

  const insUpg = db.prepare(`
    INSERT OR IGNORE INTO src_weapon_upgrades (src_weapon_id, target_src_level, gold_cost, material_requirements_json, effect_description)
    VALUES (?, ?, ?, ?, ?)
  `);
  const srcIds = db.prepare('SELECT id FROM src_weapons').all() as Array<{ id: string }>;
  for (const { id } of srcIds) {
    for (let lv = 1; lv <= MAX_SRC_WEAPON_LEVEL; lv++) {
      const req = upgradeReqs(lv);
      insUpg.run(id, lv, req.gold, JSON.stringify(req.materials), req.desc);
    }
  }
}
