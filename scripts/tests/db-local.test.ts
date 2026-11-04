import { afterAll, expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch: string[] = [];
function run(args: string[], network = "safe") {
  const root = mkdtempSync(join(tmpdir(), "modpack-db-wrapper-"));
  scratch.push(root);
  for (const dir of ["scripts", "node_modules/.bin", "tools"]) mkdirSync(join(root, dir), { recursive: true });
  copyFileSync(join(import.meta.dir, "../db-local.sh"), join(root, "scripts/db-local.sh"));
  const log = join(root, "calls.log");
  writeFileSync(log, "");
  writeFileSync(join(root, "tools/docker"), `#!/bin/sh
printf 'docker %s\n' "$*" >> "$CALL_LOG"
if [ "$2" = inspect ]; then
  [ "$MOCK_NETWORK" != absent ] || exit 1
  [ "$MOCK_NETWORK" != unsafe ] || { printf 'bridge|0.0.0.0'; exit 0; }
  printf 'bridge|127.0.0.1'
fi
`);
  writeFileSync(join(root, "node_modules/.bin/supabase"), '#!/bin/sh\nprintf "supabase %s\\n" "$*" >> "$CALL_LOG"\n');
  for (const file of ["tools/docker", "node_modules/.bin/supabase"]) chmodSync(join(root, file), 0o755);
  const result = Bun.spawnSync(["bash", join(root, "scripts/db-local.sh"), ...args], {
    env: { ...process.env, PATH: `${root}/tools:${process.env.PATH}`, CALL_LOG: log, MOCK_NETWORK: network },
  });
  return { ...result, calls: readFileSync(log, "utf8"), root };
}
afterAll(() => scratch.forEach((path) => rmSync(path, { recursive: true })));

test("start creates a loopback-only network before starting the local project", () => {
  const result = run(["start"], "absent");
  expect(result.exitCode).toBe(0);
  expect(result.calls).toContain("network create --driver bridge --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 modpack-creator-local");
  expect(result.calls).toContain(`supabase start --network-id modpack-creator-local --workdir ${result.root}`);
});
test("start reuses safe networks but rejects unsafe bindings without invoking Supabase", () => {
  const safe = run(["start"]);
  expect(safe.exitCode).toBe(0);
  expect(safe.calls).not.toContain("network create");
  const unsafe = run(["start"], "unsafe");
  expect(unsafe.exitCode).not.toBe(0);
  expect(unsafe.calls).not.toContain("supabase ");
});
test("lifecycle commands remain local and do not accept forwarded remote or deletion options", () => {
  for (const [command, expected] of [["stop", "stop"], ["status", "status"], ["reset", "db reset"], ["test", "test db"]]) {
    const result = run([command]);
    expect(result.exitCode).toBe(0);
    expect(result.calls).toBe(`supabase ${expected} --network-id modpack-creator-local --workdir ${result.root}\n`);
  }
  for (const args of [[], ["reset", "--remote"], ["stop", "--all"], ["login"], ["link"]]) {
    const result = run(args);
    expect(result.exitCode).toBe(64);
    expect(result.calls).toBe("");
  }
});
