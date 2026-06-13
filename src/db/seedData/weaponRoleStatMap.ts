/** 武器種ごとの想定ジョブ・主能力値（監査・表示の単一ソース） */

export type WeaponRoleEntry = {
  weapon_type: string;
  assumed_main_job: string;
  assumed_sub_job: string;
  primary_stat: string;
  secondary_stat: string;
  expected_role: string;
  notes: string;
  /** 【性能】表示に含める stat キー（順序付き） */
  display_stat_keys: Array<'attack' | 'magic' | 'defense' | 'spirit' | 'speed' | 'hp' | 'mp'>;
};

export const WEAPON_ROLE_STAT_MAP: WeaponRoleEntry[] = [
  {
    weapon_type: 'sword',
    assumed_main_job: '剣士',
    assumed_sub_job: '刃走り',
    primary_stat: 'attack',
    secondary_stat: 'hp',
    expected_role: '安定物理火力・前衛',
    notes: '基本の前衛武器。副能力はHP/防御少量。',
    display_stat_keys: ['attack', 'hp', 'defense'],
  },
  {
    weapon_type: 'dagger',
    assumed_main_job: '斥候',
    assumed_sub_job: '影足',
    primary_stat: 'attack',
    secondary_stat: 'speed',
    expected_role: '速度・手数',
    notes: '単発火力は剣より低いが速度で価値。',
    display_stat_keys: ['attack', 'speed'],
  },
  {
    weapon_type: 'bow',
    assumed_main_job: '狩人',
    assumed_sub_job: '矢痕読み',
    primary_stat: 'attack',
    secondary_stat: 'speed',
    expected_role: '遠距離物理火力',
    notes: '剣より軽め、短剣より火力寄り。',
    display_stat_keys: ['attack', 'speed'],
  },
  {
    weapon_type: 'axe',
    assumed_main_job: '重騎士',
    assumed_sub_job: '城壁番',
    primary_stat: 'attack',
    secondary_stat: 'defense',
    expected_role: '重火力・崩し',
    notes: '槌系に準ずる重武器。',
    display_stat_keys: ['attack', 'defense'],
  },
  {
    weapon_type: 'spear',
    assumed_main_job: '剣士',
    assumed_sub_job: '刃走り',
    primary_stat: 'attack',
    secondary_stat: 'speed',
    expected_role: '中距離物理',
    notes: '槍系。攻撃+速度。',
    display_stat_keys: ['attack', 'speed'],
  },
  {
    weapon_type: 'fist',
    assumed_main_job: '格闘士',
    assumed_sub_job: '勁打者',
    primary_stat: 'attack',
    secondary_stat: 'speed',
    expected_role: '近接連撃',
    notes: '手数と近接火力。HP少量。',
    display_stat_keys: ['attack', 'speed', 'hp'],
  },
  {
    weapon_type: 'staff',
    assumed_main_job: '魔術師',
    assumed_sub_job: '灰術士',
    primary_stat: 'magic',
    secondary_stat: 'mp',
    expected_role: '魔力火力',
    notes: '物理攻撃ではなく魔力で評価。',
    display_stat_keys: ['magic', 'mp'],
  },
  {
    weapon_type: 'spell_staff',
    assumed_main_job: '魔術師',
    assumed_sub_job: '灰術士',
    primary_stat: 'magic',
    secondary_stat: 'mp',
    expected_role: '魔力火力',
    notes: '魔導杖。staffと同系。',
    display_stat_keys: ['magic', 'mp'],
  },
  {
    weapon_type: 'rod',
    assumed_main_job: '祈祷師',
    assumed_sub_job: '灯守',
    primary_stat: 'magic',
    secondary_stat: 'mp',
    expected_role: '支援・回復寄り',
    notes: '杖より火力低め、MP・精神で価値。',
    display_stat_keys: ['magic', 'mp', 'spirit'],
  },
  {
    weapon_type: 'cannon',
    assumed_main_job: '機工師',
    assumed_sub_job: '歯車工',
    primary_stat: 'attack',
    secondary_stat: 'defense',
    expected_role: '重火力・ブレイク',
    notes: 'bs_mini_cannon は attack 主、奥義は magic 副。表示は attack 主。',
    display_stat_keys: ['attack', 'magic', 'defense'],
  },
  {
    weapon_type: 'shield',
    assumed_main_job: '重騎士',
    assumed_sub_job: '城壁番',
    primary_stat: 'defense',
    secondary_stat: 'hp',
    expected_role: '耐久・防御',
    notes: '火力武器ではなく防御/HPで評価。',
    display_stat_keys: ['defense', 'hp', 'attack'],
  },
];

export const WEAPON_ROLE_BY_TYPE = Object.fromEntries(
  WEAPON_ROLE_STAT_MAP.map((e) => [e.weapon_type, e]),
) as Record<string, WeaponRoleEntry>;

const STAT_LABELS: Record<string, string> = {
  attack: '攻撃',
  magic: '魔力',
  defense: '防御',
  spirit: '精神',
  speed: '速度',
  hp: 'HP',
  mp: 'MP',
};

export function statLabel(key: string): string {
  return STAT_LABELS[key] ?? key;
}

/** 防具・アクセは非ゼロ実効値を表示 */
export function armorDisplayStatKeys(stats: Record<string, number>): string[] {
  const order = ['attack', 'magic', 'defense', 'spirit', 'speed', 'hp', 'mp'] as const;
  return order.filter((k) => (stats[k] ?? 0) !== 0);
}
