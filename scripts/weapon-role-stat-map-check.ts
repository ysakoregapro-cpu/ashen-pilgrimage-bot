/** weapon-role-stat-map-check — npx tsx scripts/weapon-role-stat-map-check.ts */
import { WEAPON_ROLE_STAT_MAP } from '../src/db/seedData/weaponRoleStatMap';
import { JOB_TRIO_MAP } from '../src/db/seedData/jobProgressionMaster';
import { emptyResult, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';

const VALID_JOBS = new Set([
  ...Object.keys(JOB_TRIO_MAP),
  ...Object.values(JOB_TRIO_MAP).flatMap((t) => [t.sub, t.advanced]),
  '巡礼者', '繋ぎ手',
]);

const INVALID_GENERIC = ['戦士', '騎士', 'レンジャー', 'モンク', '司祭'];

function usesInvalidJob(name: string): string | null {
  for (const bad of INVALID_GENERIC) {
    if (name === bad) return bad;
  }
  return null;
}

const result = emptyResult();

function main() {
  const rows: string[][] = [];
  for (const e of WEAPON_ROLE_STAT_MAP) {
    let status = 'OK';
    if (!VALID_JOBS.has(e.assumed_main_job)) {
      result.fails.push(`${e.weapon_type}: 主ジョブ "${e.assumed_main_job}" が実在ジョブと不一致`);
      status = 'FAIL';
    }
    if (!VALID_JOBS.has(e.assumed_sub_job)) {
      result.fails.push(`${e.weapon_type}: 副ジョブ "${e.assumed_sub_job}" が実在ジョブと不一致`);
      status = 'FAIL';
    }
    for (const bad of [e.assumed_main_job, e.assumed_sub_job]) {
      const hit = usesInvalidJob(bad);
      if (hit) {
        result.fails.push(`${e.weapon_type}: 一般職名 "${hit}" 使用`);
        status = 'FAIL';
      }
    }
    if (['staff', 'rod', 'spell_staff'].includes(e.weapon_type) && e.primary_stat === 'attack') {
      result.fails.push(`${e.weapon_type}: 杖系が attack 主能力`);
      status = 'FAIL';
    }
    if (e.weapon_type === 'shield' && e.primary_stat !== 'defense') {
      result.fails.push('shield: 主能力が defense でない');
      status = 'FAIL';
    }
    rows.push([
      e.weapon_type, e.assumed_main_job, e.assumed_sub_job,
      e.primary_stat, e.secondary_stat, e.expected_role, e.notes, status,
    ]);
  }

  writeMdCsvPair(
    'weapon-role-stat-map',
    ['weapon_type', 'assumed_main_job', 'assumed_sub_job', 'primary_stat', 'secondary_stat', 'expected_role', 'notes', 'status'],
    rows,
    ['## 武器種ロールマップ', '', '想定ジョブ名は jobs.ts / jobProgressionMaster と整合。'],
  );
  exitCheckResult('weapon-role-stat-map-check', result);
}

main();
