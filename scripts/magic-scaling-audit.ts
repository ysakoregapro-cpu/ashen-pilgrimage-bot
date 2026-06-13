/** magic-scaling-audit — npx tsx scripts/magic-scaling-audit.ts */
import { initAuditDb, emptyResult, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';
import { ALL_JOB_SKILLS } from '../src/db/seedData/jobSkillData';
import { getScalingStat, calcSkillHitDamage } from '../src/systems/skillBattleCore';

const result = emptyResult();

const MAGIC_JOBS = new Set(['魔術師', '灰術士', '祈祷師', '灯守', '機巧士']);

const SAMPLE_STATS = {
  physical: { attack: 85, magic: 40, spirit: 30, defense: 50, speed: 40, level: 35, crit_rate: 0.05, crit_damage: 1.5 },
  magic: { attack: 42, magic: 148, spirit: 55, defense: 35, speed: 38, level: 35, crit_rate: 0.05, crit_damage: 1.5 },
};

function main() {
  const rows: string[][] = [];
  initAuditDb();

  const dmgSkills = ALL_JOB_SKILLS.filter((s) => s.power > 0 && ['physical', 'magic', 'divine', 'machine', 'prayer'].includes(s.skill_type));
  const picked = dmgSkills.filter((s) =>
    ['魔術師', '灰術士', '祈祷師', '機工師', '剣士'].includes(s.job),
  ).slice(0, 24);

  for (const skill of picked) {
    const isMag = ['magic', 'divine', 'machine', 'prayer'].includes(skill.skill_type);
    const expected = skill.scaling_stat === 'magic' || (isMag && skill.scaling_stat !== 'attack')
      ? 'magic'
      : skill.scaling_stat === 'attack' ? 'attack' : skill.scaling_stat;
    const stats = isMag || skill.scaling_stat === 'magic' ? SAMPLE_STATS.magic : SAMPLE_STATS.physical;
    const atkStat = getScalingStat(stats, skill.scaling_stat);
    const magStat = getScalingStat(stats, 'magic');
    const usesAttack = skill.scaling_stat === 'attack' || skill.scaling_stat === 'attack_magic';
    const usesMagic = skill.scaling_stat === 'magic' || skill.scaling_stat === 'attack_magic';

    let dmgSum = 0;
    for (let i = 0; i < 100; i++) {
      const hit = calcSkillHitDamage(stats, {
        id: skill.id, name: skill.name, power: skill.power, skill_type: skill.skill_type,
        scaling_stat: skill.scaling_stat, secondary_scaling_stat: skill.secondary_scaling_stat ?? null,
        hit_bonus: skill.hit_bonus ?? 0, crit_bonus: skill.crit_bonus ?? 0,
        mp_cost: 0, break_power: 0, element: skill.element ?? null, effect_type: null, status_effect: null,
        target_type: 'enemy', hits: 1, job_id: '', description: '',
      }, 40, { hitRate: 1 });
      dmgSum += hit.damage;
    }
    const dmgEst = Math.round(dmgSum / 100);

    let note = 'OK';
    if (isMag && skill.scaling_stat === 'attack' && !skill.secondary_scaling_stat) {
      note = 'WARN';
      result.warns.push(`${skill.id} magic skill uses attack scaling only`);
    }
    if (MAGIC_JOBS.has(skill.job) && isMag && atkStat > magStat && skill.scaling_stat === 'attack') {
      note = 'FAIL';
      result.fails.push(`${skill.id} magic job skill ignores magic stat`);
    }
    if (skill.job === '魔術師' && isMag && usesMagic && dmgEst < 30) {
      result.warns.push(`${skill.id} low magic damage estimate ${dmgEst}`);
    }

    rows.push([
      skill.id, skill.name, skill.job, expected, skill.scaling_stat,
      usesAttack ? 'yes' : 'no', usesMagic ? 'yes' : 'no',
      String(skill.mp_cost ?? 0), String(dmgEst), note,
    ]);
  }

  writeMdCsvPair(
    'magic-scaling-audit',
    ['skill_id', 'skill_name', 'job', 'expected_scaling', 'actual_scaling', 'uses_attack', 'uses_magic', 'mp_cost', 'damage_estimate', 'balance_note'],
    rows,
    ['## 攻撃/魔力スケーリング', '', '代表スキルの scaling_stat とダメージ見積。'],
  );
  exitCheckResult('magic-scaling-audit', result);
}

main();
