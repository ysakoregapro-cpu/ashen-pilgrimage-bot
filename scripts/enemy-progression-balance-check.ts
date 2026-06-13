/** enemy-progression-balance-check — npx tsx scripts/enemy-progression-balance-check.ts */
import { initAuditDb, emptyResult, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';
import {
  ENEMY_HP_SCALE_BY_LEVEL, ENEMY_OFFENSE_SCALE_BY_LEVEL,
} from '../src/systems/enemyBalanceV2';
import { scaleMonsterForBattle } from '../src/systems/combatMath';

const result = emptyResult();

function main() {
  const init = initAuditDb();
  const rows: string[][] = [];

  rows.push(['hp_scale_bands', String(ENEMY_HP_SCALE_BY_LEVEL.length), 'OK', 'Lv帯HP倍率']);
  rows.push(['offense_scale_bands', String(ENEMY_OFFENSE_SCALE_BY_LEVEL.length), 'OK', 'Lv帯攻撃倍率']);

  if (init.ok) {
    const samples = [
      { id: 'mon_bandit', label: 'Lv1-10', lv: 5 },
      { id: 'mon_ash_knight', label: 'Lv20-35', lv: 28 },
      { id: 'mon_silver_golem', label: 'Lv50-58', lv: 52 },
      { id: 'mon_old_army', label: 'Valhalla通常', lv: 65 },
    ];
    for (const s of samples) {
      const base = init.db.prepare('SELECT id, area_tag, hp, attack, defense, speed, gold_reward, exp_reward, is_boss FROM monsters WHERE id = ?').get(s.id) as {
        id: string; area_tag: string; hp: number; attack: number; defense: number; speed: number;
        gold_reward: number; exp_reward: number; is_boss: number;
      } | undefined;
      if (!base) {
        rows.push([s.label, s.id, 'SKIP', 'missing', '']);
        continue;
      }
      const scaled = scaleMonsterForBattle({ ...base, level: s.lv });
      rows.push([s.label, s.id, String(scaled.hp), `atk${scaled.attack}`, `g${base.gold_reward}`]);
      if (s.label === 'Valhalla通常') {
        if (scaled.hp < 3800 || scaled.hp > 5200) result.warns.push(`Valhalla HP ${scaled.hp} が目安3800-5200外`);
        if (scaled.attack < 90 || scaled.attack > 125) result.warns.push(`Valhalla atk ${scaled.attack} が目安90-125外`);
      }
    }
  } else {
    result.warns.push(`DB不可: ${init.error}`);
    rows.push(['db', 'SKIP', 'WARN', init.error]);
  }

  writeMdCsvPair(
    'enemy-progression-balance-summary',
    ['band', 'monster_id', 'hp_or_status', 'attack', 'gold'],
    rows,
    ['## 敵進行バランス', '', '高難度維持・理不尽即死回避の目安確認。'],
  );
  exitCheckResult('enemy-progression-balance-check', result);
}

main();
