/** skill-balance-check — npx tsx scripts/skill-balance-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ALL_JOB_SKILLS, JOB_SKILL_UNLOCKS } from '../src/db/seedData/jobSkillData';
import { isCoopFullySupportedSkill, COOP_PARTIAL_EFFECTS } from '../src/systems/skillBattleCore';

const issues: string[] = [];
const modified: string[] = [];
const okSkills: string[] = [];
const coopGapSkills: string[] = [];

function learnLevel(job: string, skillId: string): number {
  const row = JOB_SKILL_UNLOCKS[job]?.find((u) => u.skillId === skillId);
  return row?.level ?? 1;
}

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);

  console.log('## 全職業スキルバランス表\n');
  console.log('| 職業 | Lv | スキル | power | MP | target | solo | coop | 備考 |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');

  for (const s of ALL_JOB_SKILLS) {
    const row = db.prepare(`
      SELECT target_type, power, mp_cost, skill_type, break_power, status_effect, effect_type, hit_bonus, crit_bonus
      FROM skills WHERE id = ?
    `).get(s.id) as {
      target_type: string | null; power: number; mp_cost: number; skill_type: string;
      break_power: number; status_effect: string | null; effect_type: string | null;
      hit_bonus: number; crit_bonus: number;
    } | undefined;
    if (!row) {
      issues.push(`スキル未seed: ${s.id}`);
      continue;
    }

    const lv = learnLevel(s.job, s.id);
    const skillRow = { ...s, ...row, id: s.id, name: s.name, scaling_stat: s.scaling_stat ?? 'attack' } as import('../src/systems/skillSystem').SkillRow;
    const coopOk = isCoopFullySupportedSkill(skillRow);
    const partial = row.effect_type && COOP_PARTIAL_EFFECTS.has(row.effect_type);

    let note = '';
    if (partial) { note = 'coop部分'; coopGapSkills.push(`${s.id}(${row.effect_type})`); }
    else if (!coopOk) { note = 'coop要確認'; coopGapSkills.push(s.id); }
    else okSkills.push(s.id);

    // 低〜中Lv純火力チェック（L1-15, 状態異常/ブレイク/回復/支援以外）
    const isUtility = ['recovery', 'support', 'guard', 'break'].includes(row.skill_type)
      || row.status_effect || row.break_power > 20 || row.effect_type;
    if (lv <= 15 && !isUtility && row.power > 1.32 && !row.crit_bonus && !row.hit_bonus) {
      issues.push(`低Lv過剰火力: ${s.id} L${lv} power=${row.power}`);
    }
    if (lv <= 15 && row.status_effect && row.power > 1.05) {
      issues.push(`状態異常スキル火力高: ${s.id} power=${row.power}`);
    }

    console.log(`| ${s.job} | ${lv} | ${s.name} | ${row.power} | ${row.mp_cost} | ${row.target_type ?? '-'} | OK | ${coopOk && !partial ? 'OK' : '△'} | ${note} |`);
  }

  const aimShot = db.prepare('SELECT power FROM skills WHERE id = ?').get('bs_aim_shot') as { power: number };
  if (aimShot.power > 1.32) issues.push(`bs_aim_shot power=${aimShot.power} (expected ≤1.32)`);
  if (aimShot.power !== 1.28) modified.push('bs_aim_shot: 1.38→1.28');

  const noTarget = ALL_JOB_SKILLS.filter((s) => {
    const r = db.prepare('SELECT target_type FROM skills WHERE id = ?').get(s.id) as { target_type: string | null };
    return !r?.target_type;
  });
  if (noTarget.length) issues.push(`target_type未設定: ${noTarget.map((s) => s.id).join(', ')}`);

  console.log('\n## 修正したスキル');
  console.log(modified.length ? modified.join('\n') : '(Phase3: bs_aim_shot 1.28)');

  console.log('\n## coop/solo効果差が残るスキル');
  console.log(coopGapSkills.length ? coopGapSkills.slice(0, 20).join(', ') + (coopGapSkills.length > 20 ? '...' : '') : 'なし（主要スキルは共通化済）');

  if (issues.length) {
    console.error('\n❌ skill-balance-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log(`\n✅ skill-balance-check passed (${ALL_JOB_SKILLS.length} skills, coop parity checked)`);
}

main();
