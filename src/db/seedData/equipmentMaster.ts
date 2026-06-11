import type { GameElement } from './elementMaster';

export type EquipmentElementDef = {
  element: GameElement;
  resistances: Partial<Record<GameElement, number>>;
};

const SERIES_ELEMENTS: Record<string, GameElement> = {
  set_starfield: 'light',
  set_old_road: 'neutral',
  set_rain: 'ice',
  set_twilight: 'light',
  set_silver: 'ice',
  set_mist: 'wind',
  set_moon: 'light',
  set_ash_crown: 'old_king',
  set_dragonbone: 'dragon',
  set_silence: 'dark',
  set_glass: 'ice',
  set_red_ash: 'fire',
  set_deep_furnace: 'machine',
  set_black_lamp: 'dark',
  set_starfall: 'light',
  set_iron_snow: 'ice',
  set_valhalla: 'valhalla',
  set_old_king: 'old_king',
};

const WEAPON_TYPE_ELEMENTS: Record<string, GameElement> = {
  staff: 'light', rod: 'light', spell_staff: 'light',
  cannon: 'machine', shield: 'neutral',
};

const WEAPON_OVERRIDES: Record<string, GameElement> = {
  wpn_traveler_sword: 'neutral',
  wpn_prayer_rod: 'light',
  wpn_twilight_bow: 'light',
  wpn_starfield_sword: 'light',
  wpn_silver_axe: 'ice',
  wpn_mist_dagger: 'wind',
  wpn_black_exec_blade: 'dark',
  wpn_dragon_fist: 'dragon',
};

const ARMOR_RESIST_BY_SERIES: Record<string, Partial<Record<GameElement, number>>> = {
  set_silver: { ice: 0.08, machine: 0.05 },
  set_mist: { wind: 0.05, dark: 0.05 },
  set_iron_snow: { ice: 0.1 },
  set_valhalla: { valhalla: 0.08, dark: 0.05 },
  set_old_king: { old_king: 0.08, light: 0.05 },
  set_red_ash: { fire: 0.08 },
};

export function getEquipmentElementDef(
  itemId: string,
  seriesId: string | null,
  weaponType: string | null,
  slot: string,
): EquipmentElementDef {
  if (WEAPON_OVERRIDES[itemId]) {
    return { element: WEAPON_OVERRIDES[itemId], resistances: {} };
  }
  if (seriesId && SERIES_ELEMENTS[seriesId]) {
    return {
      element: slot === 'weapon' ? SERIES_ELEMENTS[seriesId] : 'neutral',
      resistances: ARMOR_RESIST_BY_SERIES[seriesId] ?? {},
    };
  }
  if (weaponType && WEAPON_TYPE_ELEMENTS[weaponType]) {
    return { element: WEAPON_TYPE_ELEMENTS[weaponType], resistances: {} };
  }
  if (slot === 'weapon') return { element: 'neutral', resistances: {} };
  return { element: 'neutral', resistances: {} };
}

export type AcquisitionSource = {
  type: 'shop' | 'drop_monster' | 'drop_area' | 'boss_reward' | 'raid_reward' | 'story_reward' | 'craft' | 'upgrade_material' | 'trade_only' | 'unique' | 'start';
  detail: string;
};

/** Manual overrides for key items; others derived at seed time */
export const ACQUISITION_OVERRIDES: Record<string, AcquisitionSource[]> = {
  upg_rough_stone: [
    { type: 'drop_area', detail: '序章〜第一章の探索' },
    { type: 'shop', detail: 'はじまりの星原・薄明の港の売店' },
    { type: 'drop_monster', detail: '星原〜港の敵' },
  ],
  upg_stone: [
    { type: 'shop', detail: '薄明の港以降の売店' },
    { type: 'drop_area', detail: '白銀鉱山街以降の探索' },
  ],
  upg_fine_stone: [
    { type: 'drop_area', detail: '中盤以降の探索・ボス' },
    { type: 'boss_reward', detail: '中ボス報酬' },
  ],
  rep_patch: [
    { type: 'shop', detail: '各町の売店' },
    { type: 'drop_area', detail: '探索ドロップ' },
  ],
  wpn_prayer_rod: [
    { type: 'drop_area', detail: '序章探索' },
    { type: 'shop', detail: 'はじまりの星原（間接）' },
  ],
  wpn_traveler_sword: [{ type: 'start', detail: '冒険開始時' }],
};

export function formatAcquisitionHint(sources: AcquisitionSource[]): string {
  if (!sources.length) return '入手: 探索・店・ボス';
  return sources.map((s) => {
    const labels: Record<string, string> = {
      shop: '店', drop_monster: '敵', drop_area: '探索', boss_reward: 'ボス',
      raid_reward: 'レイド', story_reward: 'ストーリー', craft: '作成',
      upgrade_material: '強化', trade_only: '取引所', unique: '一点物', start: '初期',
    };
    return `${labels[s.type] ?? s.type}:${s.detail}`;
  }).join(' / ');
}
