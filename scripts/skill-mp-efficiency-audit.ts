/** skill-mp-efficiency-audit.ts — npx tsx scripts/skill-mp-efficiency-audit.ts */
import { execSync } from 'child_process';

try {
  execSync('npx tsx scripts/mp-efficiency-all-jobs-audit.ts', { stdio: 'inherit', cwd: process.cwd() });
} catch {
  process.exit(1);
}
