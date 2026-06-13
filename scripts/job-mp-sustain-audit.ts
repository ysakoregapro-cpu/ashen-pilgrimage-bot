/** job-mp-sustain-audit.ts — npx tsx scripts/job-mp-sustain-audit.ts */
import { execSync } from 'child_process';

const scripts = ['mp-balance-check.ts', 'job-damage-balance-check.ts'];
for (const s of scripts) {
  try {
    execSync(`npx tsx scripts/${s}`, { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    process.exit(1);
  }
}
console.log('PASS: job-mp-sustain-audit');
