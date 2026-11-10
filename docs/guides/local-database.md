# Develop against local Supabase

This foundation runs PostgreSQL and the Data API in Docker. Clerk owns application
accounts and sessions; Supabase email/password, SMS, anonymous sign-in, new signup
and the local email inbox are disabled. Database JWT infrastructure and historical
auth schema remain for third-party token verification and safe migration replay,
not as an alternative application sign-in provider. No cloud resources are provisioned.

## Prerequisites and startup

Install Bun 1.4.4, Node.js 22+, Bash, and a running Docker-compatible daemon.
The project pins Supabase CLI 3.0.0; a global CLI installation, account login, or
linked cloud project is not required. Initial startup downloads container images
and needs additional disk and memory. Stop unrelated workloads if resources are low.

From the repository root:

```sh
bun install --frozen-lockfile
bun run db:start
bun run db:status
bun run db:test
```

The launcher creates or validates the `modpack-creator-local` bridge network with
Docker's default published-port binding set to `127.0.0.1`. An existing network
with a different driver or binding is rejected, not modified. Do not replace
`db:start` with a direct CLI start that bypasses this check.

Local endpoints: Data API gateway on `http://127.0.0.1:54321` and PostgreSQL on
`127.0.0.1:54322`. There is no local email inbox.
Studio, Storage, Realtime, analytics, the pooler, and edge runtime are disabled.
Local database success does not prove hosted Clerk authentication or third-party trust.

See [local identity](local-identity.md) and [account profiles](account-profiles.md)
for API environment and Clerk-to-database trust requirements. CLI status may show local
development keys and connection information: never commit that output or put
secret/service-role credentials in frontend code. The API's existing health
endpoint remains a process check, not a database readiness check.

The forward Clerk profile-owner migration retains existing UUID-owned rows as text
without linking or deletion. Old rows are not automatically reassigned. Verify the
upgrade in a new isolated PostgreSQL container with `bun run db:test:upgrade`;
this command does not reset the developer database. Existing running stacks do
not pick up configuration changes until deliberately restarted.

## Migrations and rebuilding

Keep real application migrations in `supabase/migrations/`, adding each with its
feature. To create one, run the pinned CLI from the repository root:

```sh
bun run supabase migration new descriptive_name
```

The first migration removes the inherited `PUBLIC` execution default for future
functions created by `postgres`, the migration role. PostgreSQL requires this
default change to apply across schemas, not only `public`; existing routines and
other owner roles are unaffected. No application tables are fabricated.
The migration runner is enabled and sample seeding disabled.
Future migrations must explicitly grant intended Data API access and add their
authorization policies; `api.auto_expose_new_tables = false` makes exposure opt-in.
That local setting does not configure a cloud project's permissions.

The function migration is necessary in addition to the local exposure setting:
otherwise roles still inherit PostgreSQL's `PUBLIC` execution permission. Future
function migrations must grant execution only to their intended callers. See
[PostgreSQL default privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).

**Reset deletes the current local project's data.** Use only on a disposable
development database after preserving anything needed. It is never a production
migration command:

```sh
bun run db:reset
bun run db:test
```

The launcher targets the project in this repository and rejects extra flags,
including `--remote` and `--all`. It never logs in, links a project, or pushes
schema remotely. Running the raw CLI separately bypasses those safeguards.

SQL tests live in `supabase/tests/database/`; pgTAP checks the foundation and
effective opt-in privileges using transaction-only probes rolled back afterward.
Migration replay is verified during setup using a scratch-only migration; no
probe tables are part of the application schema. CI runs mocked launcher tests
and the disposable Docker upgrade regression. The full local Supabase pgTAP
suite remains a separate check; the upgrade probe does not reset that stack.

## Stop and troubleshoot

```sh
bun run db:stop
```

Normal stop preserves local database data and leaves the loopback network for
reuse. Do not use global Docker prune, stop-all, or volume deletion to troubleshoot
this project. If ports are occupied, resolve the conflict without stopping unrelated
containers. Multiple checkouts need distinct project IDs and ports before starting.

Keep `.temp`, `.branches`, environment files, keys, and database dumps out of Git.
See [Supabase local development](https://supabase.com/docs/guides/local-development)
and [CLI reference](https://supabase.com/docs/reference/cli/introduction) for details.
