/** battle-damage-system-audit — npx tsx scripts/battle-damage-system-audit.ts */
import fs from 'fs';
import path from 'path';
import { emptyResult, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';

const result = emptyResult();

type AuditRow = {
  damage_type: string;
  source_file: string;
  uses_player_attack: string;
  uses_player_magic: string;
  uses_player_defense: string;
  uses_enemy_attack: string;
  uses_enemy_defense: string;
  uses_resistance: string;
  uses_min_damage: string;
  uses_variance: string;
  notes: string;
};

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function has(src: string, ...patterns: string[]): boolean {
  return patterns.every((p) => src.includes(p));
}

function main() {
  const combatMath = readSrc('src/systems/combatMath.ts');
  const battleSystem = readSrc('src/systems/battleSystem.ts');
  const skillCore = readSrc('src/systems/skillBattleCore.ts');
  const enemyV2 = readSrc('src/systems/enemyBalanceV2.ts');

  const rows: AuditRow[] = [
    {
      damage_type: 'player_physical_attack',
      source_file: 'combatMath.ts:calcPhysicalDamage',
      uses_player_attack: 'yes',
      uses_player_magic: 'no',
      uses_player_defense: 'no',
      uses_enemy_attack: 'no',
      uses_enemy_defense: 'yes',
      uses_resistance: 'via elementSystem in battleSystem',
      uses_min_damage: has(combatMath, 'Math.max(1') ? 'yes' : 'no',
      uses_variance: has(combatMath, 'variance') ? 'yes' : 'no',
      notes: 'DEFENSE_MITIGATION_COEFF mitigation',
    },
    {
      damage_type: 'player_skill_damage',
      source_file: 'skillBattleCore.ts:calcSkillHitDamage',
      uses_player_attack: has(skillCore, "scaling_stat") ? 'via scaling_stat' : 'no',
      uses_player_magic: has(skillCore, 'isMag') ? 'via scaling_stat when magic skill' : 'no',
      uses_player_defense: 'no',
      uses_enemy_attack: 'no',
      uses_enemy_defense: 'yes',
      uses_resistance: 'battleSystem applyElementToDamage',
      uses_min_damage: 'yes',
      uses_variance: 'via calcPhysicalDamage',
      notes: 'getScalingStat picks attack/magic/spirit etc',
    },
    {
      damage_type: 'enemy_to_player',
      source_file: 'combatMath.ts:calcEnemyDamageToPlayer',
      uses_player_attack: 'no',
      uses_player_magic: 'no',
      uses_player_defense: 'yes',
      uses_enemy_attack: 'yes',
      uses_enemy_defense: 'no',
      uses_resistance: has(battleSystem, 'applyPlayerElementResist') ? 'yes' : 'no',
      uses_min_damage: 'yes',
      uses_variance: 'HP% roll + physical variance',
      notes: 'HP% component + stat component; level gap mitigates HP% when overleveled',
    },
    {
      damage_type: 'enemy_balance_weights',
      source_file: 'enemyBalanceV2.ts',
      uses_player_attack: 'no',
      uses_player_magic: 'no',
      uses_player_defense: 'no',
      uses_enemy_attack: 'no',
      uses_enemy_defense: 'no',
      uses_resistance: 'no',
      uses_min_damage: 'no',
      uses_variance: 'no',
      notes: `HP weight ${enemyV2.match(/ENEMY_HP_DAMAGE_WEIGHT = ([\d.]+)/)?.[1] ?? '?'} / stat weight ${enemyV2.match(/ENEMY_STAT_DAMAGE_WEIGHT = ([\d.]+)/)?.[1] ?? '?'}`,
    },
  ];

  if (!has(combatMath, 'playerLevel', 'calcLevelGapHpMitigation')) {
    result.warns.push('calcLevelGapHpMitigation present but verify battleSystem passes playerLevel');
  }
  if (!has(battleSystem, 'playerLevel: player.level')) {
    result.fails.push('battleSystem missing playerLevel in calcEnemyDamageToPlayer');
  }
  if (!has(skillCore, 'getScalingStat')) {
    result.fails.push('skillBattleCore missing getScalingStat');
  }

  const csvRows = rows.map((r) => [
    r.damage_type, r.source_file, r.uses_player_attack, r.uses_player_magic,
    r.uses_player_defense, r.uses_enemy_attack, r.uses_enemy_defense,
    r.uses_resistance, r.uses_min_damage, r.uses_variance, r.notes,
  ]);

  writeMdCsvPair(
    'battle-damage-system-audit',
    ['damage_type', 'source_file', 'uses_player_attack', 'uses_player_magic', 'uses_player_defense', 'uses_enemy_attack', 'uses_enemy_defense', 'uses_resistance', 'uses_min_damage', 'uses_variance', 'notes'],
    csvRows,
    ['## 既存ダメージ計算システム', '', '式の参照値監査（ファイル実装ベース）。'],
  );
  exitCheckResult('battle-damage-system-audit', result);
}

main();
