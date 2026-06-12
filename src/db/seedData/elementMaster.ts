/** Canonical game elements — single source for combat, equipment, skills, areas */
export const GAME_ELEMENTS = [
  'neutral', 'fire', 'ice', 'thunder', 'wind', 'light', 'dark',
  'machine', 'beast', 'undead', 'dragon', 'old_king', 'valhalla',
] as const;

export type GameElement = typeof GAME_ELEMENTS[number];

export const ELEMENT_LABELS: Record<GameElement, string> = {
  neutral: '無属性',
  fire: '火',
  ice: '氷',
  thunder: '雷',
  wind: '風',
  light: '光',
  dark: '闇',
  machine: '機械',
  beast: '獣',
  undead: '不死',
  dragon: '竜',
  old_king: '旧王',
  valhalla: 'ヴァルハラ',
};

/** Legacy skill/seed element strings → canonical */
export const ELEMENT_ALIASES: Record<string, GameElement> = {
  neutral: 'neutral', none: 'neutral', ash: 'neutral', star: 'light',
  fire: 'fire', ice: 'ice', thunder: 'thunder', wind: 'wind',
  light: 'light', dark: 'dark', echo: 'dark', mist: 'wind',
  machine: 'machine', arc: 'machine', divine: 'light',
  beast: 'beast', undead: 'undead', dragon: 'dragon',
  old_king: 'old_king', valhalla: 'valhalla', water: 'ice',
};

export type AffinityTier = 'major_weak' | 'weak' | 'neutral' | 'resist' | 'major_resist' | 'immune';

export const AFFINITY_MULTIPLIER: Record<AffinityTier, number> = {
  major_weak: 1.35,
  weak: 1.15,
  neutral: 1.0,
  resist: 0.85,
  major_resist: 0.65,
  immune: 0.35,
};

/** attackElement → defenderElement → tier */
export const ELEMENT_AFFINITY: Partial<Record<GameElement, Partial<Record<GameElement, AffinityTier>>>> = {
  fire: { ice: 'resist', beast: 'weak', undead: 'weak', machine: 'neutral', wind: 'neutral' },
  ice: { fire: 'resist', machine: 'weak', wind: 'weak', beast: 'neutral' },
  thunder: { machine: 'major_weak', wind: 'resist' },
  wind: { ice: 'resist', beast: 'weak', machine: 'neutral' },
  light: { dark: 'major_weak', undead: 'major_weak', old_king: 'weak' },
  dark: { light: 'resist', undead: 'neutral', old_king: 'weak' },
  machine: { thunder: 'major_weak', fire: 'weak', ice: 'neutral' },
  beast: { fire: 'weak', wind: 'resist', dragon: 'neutral' },
  undead: { light: 'major_weak', fire: 'weak', dark: 'resist' },
  dragon: { dragon: 'resist', thunder: 'weak', wind: 'weak' },
  old_king: { valhalla: 'weak', light: 'resist', dark: 'neutral' },
  valhalla: { old_king: 'weak', dark: 'weak', machine: 'neutral' },
  neutral: {},
};

export function normalizeElement(raw: string | null | undefined): GameElement {
  if (!raw) return 'neutral';
  const key = raw.toLowerCase().trim();
  return ELEMENT_ALIASES[key] ?? (GAME_ELEMENTS.includes(key as GameElement) ? key as GameElement : 'neutral');
}

export function getAffinityTier(attack: GameElement, defense: GameElement): AffinityTier {
  if (attack === 'neutral' || defense === 'neutral') return 'neutral';
  if (attack === defense) return 'resist';
  return ELEMENT_AFFINITY[attack]?.[defense] ?? 'neutral';
}

export function getAffinityMultiplier(attack: GameElement, defense: GameElement): number {
  return AFFINITY_MULTIPLIER[getAffinityTier(attack, defense)];
}

export function affinityLogText(tier: AffinityTier, attack: GameElement): string | null {
  switch (tier) {
    case 'major_weak': return `${ELEMENT_LABELS[attack]}が大弱点を突いた！`;
    case 'weak': return '弱点を突いた！';
    case 'resist': return '耐性に阻まれた……';
    case 'major_resist': return '大きく効きにくい……';
    case 'immune': return 'ほとんど通らない……';
    default: return null;
  }
}
