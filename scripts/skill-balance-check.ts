/** skill-balance-check — npx tsx scripts/skill-balance-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ALL_JOB_SKILLS } from '../src/db/seedData/jobSkillData';

const issues: string[] = [];

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);

  const noTarget: string[] = [];
  const deadSkills: string[] = [];

  for (const s of ALL_JOB_SKILLS) {
    const row = db.prepare('SELECT target_type, power FROM skills WHERE id = ?').get(s.id) as {
      target_type: string | null; power: number;
    } | undefined;
    if (!row) {
      issues.push(`スキル未seed: ${s.id}`);
      continue;
    }
    if (!row.target_type) noTarget.push(s.id);

    const def = ALL_JOB_SKILLS.find((b) => b.id === s.id);
    const power = def?.power ?? row.power ?? 1;
    if (def?.skill_type === 'recovery' || def?.skill_type === 'support' || def?.effect_type) {
      // skip heal/buff/debuff body skills
    } else if (s.mp > 0 && power <= 1.0 && !s.status_effect && !s.break_power && !(def?.hits && def.hits > 1)) {
      if (!['bs_parry', 'bs_shield_guard', 'bs_fortress', 'bs_cover', 'bs_taunt', 'bs_slash', 'bs_shield_bash', 'bs_aim_shot', 'bs_ash_fire', 'bs_lamp_prayer', 'bs_shadow_strike', 'bs_mini_cannon', 'bs_straight_punch'].includes(s.id)) {
        deadSkills.push(`${s.id} (power=${power}, mp=${s.mp})`);
      }
    }
  }

  const aimShot = ALL_JOB_SKILLS.find((s) => s.id === 'bs_aim_shot');
  if (!aimShot || aimShot.power < 1.25) issues.push(`bs_aim_shot power=${aimShot?.power} (expected ≥1.25)`);

  const slash = ALL_JOB_SKILLS.find((s) => s.id === 'bs_slash');
  if (aimShot && slash && aimShot.power <= slash.power) issues.push('狙い撃ちが通常斬击以下');

  if (noTarget.length) issues.push(`target_type未設定: ${noTarget.slice(0, 5).join(', ')}${noTarget.length > 5 ? '...' : ''}`);
  if (deadSkills.length > 5) issues.push(`死にスキル候補: ${deadSkills.slice(0, 5).join('; ')}`);

  const cover = db.prepare(`SELECT target_type FROM skills WHERE id = 'bs_cover'`).get() as { target_type: string } | undefined;
  if (cover && !['ally', 'cover'].includes(cover.target_type)) issues.push(`bs_cover target=${cover.target_type}`);

  if (issues.length) {
    console.error('❌ skill-balance-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log(`✅ skill-balance-check passed (${ALL_JOB_SKILLS.length} skills)`);
}

main();
