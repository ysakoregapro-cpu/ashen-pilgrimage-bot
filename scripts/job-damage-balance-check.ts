/** job-damage-balance-check — npx tsx scripts/job-damage-balance-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ALL_JOB_SKILLS, JOB_SKILL_UNLOCKS } from '../src/db/seedData/jobSkillData';
import { computeExpectedMaxMp } from '../src/systems/combatMp';
import { AOE_DAMAGE_MULT } from '../src/systems/skillBattleCore';

const JOBS = ['剣士', '狩人', '格闘士', '機工師', '魔術師'] as const;
const MP_MOD: Record<string, number> = {
  剣士: 5, 狩人: 8, 格闘士: -5, 機工師: 8, 魔術師: 22,
};
const LEVELS = [30, 50, 70, 100];
const WEAKNESS_MULT = 1.35;

const warns: string[] = [];

function learnLevel(job: string, skillId: string): number {
  return JOB_SKILL_UNLOCKS[job]?.find((u) => u.skillId === skillId)?.level ?? 1;
}

function bestSingleAtLevel(job: string, playerLv: number): { id: string; name: string; power: number; mp: number; hits: number } | null {
  let best: { id: string; name: string; power: number; mp: number; hits: number; eff: number } | null = null;
  for (const s of ALL_JOB_SKILLS) {
    if (s.job !== job || s.target_type === 'all_enemies' || s.power <= 0) continue;
    const slv = learnLevel(job, s.id);
    if (slv > playerLv) continue;
    const hits = s.hits ?? 1;
    const eff = s.power * hits;
    if (!best || eff > best.eff) {
      best = { id: s.id, name: s.name, power: s.power, mp: s.mp, hits, eff };
    }
  }
  return best ? { id: best.id, name: best.name, power: best.power, mp: best.mp, hits: best.hits } : null;
}

function bestAoeAtLevel(job: string, playerLv: number) {
  for (const s of ALL_JOB_SKILLS) {
    if (s.job !== job || s.target_type !== 'all_enemies') continue;
    const slv = learnLevel(job, s.id);
    if (slv > playerLv) continue;
    const row = getDb().prepare('SELECT power, mp_cost, hits FROM skills WHERE id = ?').get(s.id) as {
      power: number; mp_cost: number; hits: number;
    };
    const total1 = row.power * AOE_DAMAGE_MULT * (row.hits ?? 1);
    return { id: s.id, name: s.name, total1, mp: row.mp_cost };
  }
  return null;
}

function ultimateAtLevel(job: string, playerLv: number) {
  for (const s of ALL_JOB_SKILLS) {
    if (s.job !== job || s.skill_type !== 'special') continue;
    const slv = learnLevel(job, s.id);
    if (slv > playerLv) continue;
    const row = getDb().prepare('SELECT power, mp_cost FROM skills WHERE id = ?').get(s.id) as { power: number; mp_cost: number };
    return { id: s.id, name: s.name, power: row.power, mp: row.mp_cost };
  }
  return null;
}

function main() {
  const db = getDb();
  ensurePhase2Seed(db);

  console.log('## 職業別代表火力比較\n');

  for (const lv of LEVELS) {
    console.log(`### Lv${lv}\n`);
    console.log('| 職業 | 代表単体 | power | MP | MPあたり | 使用回数 | 弱点なしDPS | 弱点あり |');
    console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');

    const physicalPowers: number[] = [];
    let mageNeutral = 0;
    let mageWeak = 0;

    for (const job of JOBS) {
      const single = bestSingleAtLevel(job, lv);
      if (!single) continue;
      const mpRow = db.prepare('SELECT mp_cost FROM skills WHERE id = ?').get(single.id) as { mp_cost: number };
      const mp = mpRow.mp_cost;
      const maxMp = computeExpectedMaxMp(lv, MP_MOD[job] ?? 0, 0);
      const uses = Math.floor(maxMp / mp);
      const eff = (single.power * single.hits) / mp;
      const dps = single.power * single.hits;
      const weakDps = dps * (job === '魔術師' ? WEAKNESS_MULT : 1.05);

      if (job !== '魔術師') physicalPowers.push(dps);
      else { mageNeutral = dps; mageWeak = weakDps; }

      console.log(`| ${job} | ${single.name} | ${single.power}×${single.hits} | ${mp} | ${eff.toFixed(3)} | ${uses} | ${dps.toFixed(2)} | ${weakDps.toFixed(2)} |`);
    }

    const physAvg = physicalPowers.length
      ? physicalPowers.reduce((a, b) => a + b, 0) / physicalPowers.length
      : 1;
    const mageOverPct = ((mageNeutral / physAvg) - 1) * 100;
    console.log(`\n弱点なし: 魔術師 vs 物理平均 **${mageOverPct >= 0 ? '+' : ''}${mageOverPct.toFixed(1)}%**\n`);

    if (mageOverPct > 25) {
      warns.push(`Lv${lv} 弱点なしで魔術師が物理平均を${mageOverPct.toFixed(0)}%上回る`);
    }

    const ult = ultimateAtLevel('魔術師', lv);
    if (ult) {
      const maxMp = computeExpectedMaxMp(lv, 22, 0);
      const ultUses = Math.floor(maxMp / ult.mp);
      console.log(`魔術師奥義 ${ult.name}: MP${ult.mp} → 最大${ultUses}回/戦`);
      if (lv === 70 && ultUses >= 4) warns.push(`Lv70 魔術師奥義${ultUses}回/戦 (≥4)`);
      if (lv === 100 && ultUses >= 6) warns.push(`Lv100 魔術師奥義${ultUses}回/戦 (≥6)`);
    }

    const aoe = bestAoeAtLevel('魔術師', lv);
    const mageSingle = bestSingleAtLevel('魔術師', lv);
    if (aoe && mageSingle) {
      const ratio2 = (aoe.total1 * 2) / (mageSingle.power * mageSingle.hits);
      console.log(`魔術師AOE ${aoe.name}: 1体${aoe.total1.toFixed(2)} / 2体x${ratio2.toFixed(2)} vs 単体${mageSingle.name}`);
      if (aoe.total1 > mageSingle.power * mageSingle.hits) {
        warns.push(`Lv${lv} 魔術師AOEが単体戦でも単体主力超え`);
      }
    }

    const machAoe = bestAoeAtLevel('機工師', lv);
    if (machAoe && mageSingle) {
      console.log(`機工師AOE ${machAoe.name}: 1体${machAoe.total1.toFixed(2)} (MP${machAoe.mp})`);
    }
    console.log('');
  }

  console.log('## MP効率比較 (Lv70代表)\n');
  const lv = 70;
  const effs: Array<{ job: string; eff: number }> = [];
  for (const job of JOBS) {
    const s = bestSingleAtLevel(job, lv);
    if (!s) continue;
    const mp = (db.prepare('SELECT mp_cost FROM skills WHERE id = ?').get(s.id) as { mp_cost: number }).mp_cost;
    effs.push({ job, eff: (s.power * s.hits) / mp });
  }
  effs.sort((a, b) => b.eff - a.eff);
  for (const e of effs) console.log(`- ${e.job}: ${e.eff.toFixed(3)} power/MP`);
  const mageEff = effs.find((e) => e.job === '魔術師')?.eff ?? 0;
  const othersAvg = effs.filter((e) => e.job !== '魔術師').reduce((a, e) => a + e.eff, 0) / 4;
  if (mageEff > othersAvg * 1.35) {
    warns.push(`Lv70 MPあたり火力で魔術師が他職平均+${(((mageEff / othersAvg) - 1) * 100).toFixed(0)}%`);
  }

  console.log('\n## WARN\n');
  const unique = [...new Set(warns)];
  if (unique.length) {
    for (const w of unique) console.log(`- ${w}`);
    console.error('\n❌ job-damage-balance-check failed');
    process.exit(1);
  }
  console.log('(なし)');
  console.log('\n✅ job-damage-balance-check passed');
}

main();
