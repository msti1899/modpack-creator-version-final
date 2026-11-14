import { afterAll, expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch: string[] = [];

function run(args: string[], options: { docker?: boolean; bun?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "modpack-dev-wrapper-"));
  scratch.push(root);
  for (const dir of ["scripts", "node_modules/.bin", "tools"]) mkdirSync(join(root, dir), { recursive: true });
  copyFileSync(join(import.meta.dir, "../dev.sh"), join(root, "scripts/dev.sh"));
  copyFileSync(join(import.meta.dir, "../db-local.sh"), join(root, "scripts/db-local.sh"));
  const log = join(root, "calls.log");
  writeFileSync(log, "");
  const docker = options.docker ?? true;
  writeFileSync(
    join(root, "tools/docker"),
    `#!/bin/sh
printf 'docker %s\\n' "$*" >> "$CALL_LOG"
[ "$*" = info ] && exit ${docker ? 0 : 1}
if [ "$2" = inspect ]; then exit 1; fi
exit 0
`,
  );
  writeFileSync(join(root, "node_modules/.bin/supabase"), '#!/bin/sh\nprintf "supabase %s\\n" "$*" >> "$CALL_LOG"\n');
  if (options.bun !== false) {
    writeFileSync(join(root, "tools/bun"), '#!/bin/sh\nprintf "bun %s\\n" "$*" >> "$CALL_LOG"\n');
    chmodSync(join(root, "tools/bun"), 0o755);
  }
  chmodSync(join(root, "tools/docker"), 0o755);
  chmodSync(join(root, "node_modules/.bin/supabase"), 0o755);
  const result = Bun.spawnSync(["bash", join(root, "scripts/dev.sh"), ...args], {
    env: { ...process.env, PATH: `${root}/tools:/usr/bin:/bin`, CALL_LOG: log },
  });
  const calls = readFileSync(log, "utf8")
    .split("\n")
    .filter((line) => line !== "" && line !== "docker info")
    .join("\n");
  return { exitCode: result.exitCode, calls, stderr: result.stderr.toString(), root };
}

afterAll(() => scratch.forEach((path) => rmSync(path, { recursive: true, force: true })));

test("start brings the local database up before the web and api dev servers", () => {
  const result = run(["start"]);
  expect(result.exitCode).toBe(0);
  const lines = result.calls.split("\n");
  expect(lines.at(-1)).toBe("bun run dev");
  expect(result.calls).toContain(`supabase start --network-id modpack-creator-local --workdir ${result.root}`);
  expect(lines.indexOf("bun run dev")).toBeGreaterThan(lines.findIndex((line) => line.startsWith("supabase start")));
});

test("start still launches the applications when Docker is unreachable", () => {
  const result = run(["start"], { docker: false });
  expect(result.exitCode).toBe(0);
  expect(result.calls).toBe("bun run dev");
  expect(result.stderr).toContain("without the local database");
});

test("lifecycle modes forward only to the local database launcher", () => {
  for (const [mode, expected] of [["stop", "supabase stop"], ["status", "supabase status"]]) {
    const result = run([mode]);
    expect(result.exitCode).toBe(0);
    expect(result.calls).toBe(`${expected} --network-id modpack-creator-local --workdir ${result.root}`);
  }
});

test("lifecycle modes fail without Docker instead of touching the database", () => {
  const result = run(["stop"], { docker: false });
  expect(result.exitCode).not.toBe(0);
  expect(result.calls).toBe("");
});

test("unsupported flags and an absent Bun fail without side effects", () => {
  for (const args of [["reset"], ["--remote"], ["start", "--remote"]]) {
    const result = run(args);
    expect(result.exitCode).toBe(64);
    expect(result.calls).toBe("");
  }
  const missingBun = run(["start"], { bun: false });
  expect(missingBun.calls).toBe("");
  expect(missingBun.stderr).toContain("Bun is required");
});
