/**
 * Init DB on first start: db push (sync schema) + db seed (create admin if missing).
 * Run automatically before `npm run dev`.
 */

import { execSync } from "child_process";
import { resolve } from "path";

const root = resolve(__dirname, "..");

function run(cmd: string, label: string) {
  console.log(`\n[init-db] ${label}...`);
  try {
    execSync(cmd, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, FORCE_COLOR: "1" },
    });
    console.log(`[init-db] ${label} done.\n`);
  } catch (e) {
    console.error(`[init-db] ${label} failed.`, e);
    process.exit(1);
  }
}

run("npx prisma db push", "db push");
run("npx prisma db seed", "db seed");
