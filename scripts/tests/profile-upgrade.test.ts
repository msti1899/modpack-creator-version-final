import { expect, test } from "bun:test";
import { resolve, join } from "node:path";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

test("upgrade runner refuses connection strings and forwarded Docker flags before execution", () => {
  for (const value of ["postgres://remote/database", "--host=tcp://remote:2375", "--help"]) {
    const result = Bun.spawnSync([process.execPath, resolve(import.meta.dir, "../test-profile-upgrade.ts"), value]);
    expect(result.exitCode).toBe(64);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toContain("no arguments");
  }
});

test("upgrade runner removes only its owned container and anonymous volumes on success or SQL failure", () => {
  const scratch = mkdtempSync(join(tmpdir(), "profile-upgrade-cleanup-"));
  const id = "a".repeat(64);
  const log = join(scratch, "calls.log");
  const executable = join(scratch, "docker");
  writeFileSync(executable, `#!/bin/sh
printf '%s\\n' "$*" >> "$CALL_LOG"
case "$2" in
  run) printf '%s\\n' '${id}' ;;
  exec) if [ "$4" = psql ] && [ "$SQL_FAILURE" = yes ]; then echo 'SQL fixture rejected' >&2; exit 1; fi ;;
esac
`);
  chmodSync(executable, 0o755);
  try {
    for (const failure of ["no", "yes"]) {
      writeFileSync(log, "");
      const result = Bun.spawnSync([process.execPath, resolve(import.meta.dir, "../test-profile-upgrade.ts")], {
        env: { ...process.env, PATH: `${scratch}:${process.env.PATH}`, CALL_LOG: log, SQL_FAILURE: failure },
        timeout: 10_000,
      });
      expect(result.exitCode).toBe(failure === "no" ? 0 : 1);
      const calls = readFileSync(log, "utf8").trim().split("\n");
      expect(calls[0]).toContain("--network=none");
      expect(calls[0]).toContain("dst=/tests,readonly");
      expect(calls.at(-1)).toBe(`--host=unix:///var/run/docker.sock rm --force --volumes ${id}`);
      expect(calls.filter((line) => line.includes(" rm "))).toHaveLength(1);
    }
  } finally { rmSync(scratch, { recursive: true }); }
});
