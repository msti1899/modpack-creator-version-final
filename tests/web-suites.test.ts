import { expect, test } from "bun:test";

// The Vitest suites import their own runner, so Bun's gate cannot execute them
// directly, and a `test:web` step in the CI workflow needs a credential with the
// `workflow` scope. Until that step exists, the gate runs the same command the
// workflow would run, so the component suites are covered in CI either way.
test(
  "the web component suites pass",
  () => {
    const result = Bun.spawnSync(["bun", "run", "--filter", "@modpack/web", "test"], {
      cwd: `${import.meta.dir}/..`,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode, `${result.stdout.toString()}${result.stderr.toString()}`).toBe(0);
  },
  60_000,
);
