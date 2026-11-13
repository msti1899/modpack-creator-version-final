import { resolve } from "node:path";

// No connection strings, host paths or forwarded Docker flags are accepted.
if (process.argv.length !== 2) {
  console.error("Usage: bun run db:test:upgrade (disposable local Docker only; no arguments)");
  process.exit(64);
}
const dockerCommand = ["docker", "--host=unix:///var/run/docker.sock"];
const image = "postgres:17.11-alpine";
function docker(args: string[]) {
  const result = Bun.spawnSync([...dockerCommand, ...args], { timeout: 120_000 });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString() || "Docker command failed.");
  return result.stdout.toString().trim();
}
const id = docker(["run", "--detach", "--rm", "--network=none",
  "--env", "POSTGRES_PASSWORD=disposable-upgrade-only",
  "--mount", `type=bind,src=${resolve(import.meta.dir, "../supabase")},dst=/tests,readonly`, image]);
if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Docker did not return a container ID.");
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const probe = Bun.spawnSync([...dockerCommand, "exec", id, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], { timeout: 5000 });
    if (probe.exitCode === 0) { ready = true; break; }
    await Bun.sleep(500);
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready.");
  console.log(docker(["exec", id, "psql", "-X", "-U", "postgres", "-v", "ON_ERROR_STOP=1",
    "-f", "/tests/upgrade-tests/clerk-profile-owners.sql"]));
} finally {
  // Only the exact container created above is removed; no networks/volumes are reused.
  docker(["rm", "--force", "--volumes", id]);
}
