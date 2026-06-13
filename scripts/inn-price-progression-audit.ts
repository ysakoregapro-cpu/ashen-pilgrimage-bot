/** inn-price-progression-audit.ts — npx tsx scripts/inn-price-progression-audit.ts */
import { execSync } from 'child_process';

try {
  execSync('npx tsx scripts/inn-pricing-progression-check.ts', { stdio: 'inherit', cwd: process.cwd() });
} catch {
  process.exit(1);
}
