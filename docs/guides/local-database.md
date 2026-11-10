# Develop against local Supabase

This foundation runs PostgreSQL, the Data API, Auth, and a local email inbox in
Docker. It does not provision Supabase cloud resources, connect the Hono API to
a database, or send email through Brevo. Application tables arrive with their
respective backend features, not as speculative schema in this setup.

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

Local endpoints: Data API/Auth gateway on `http://127.0.0.1:54321`, PostgreSQL on
`127.0.0.1:54322`, and the test email inbox on `http://127.0.0.1:54324`.
Studio, Storage, Realtime, analytics, the pooler, and edge runtime are disabled.
The inbox captures local authentication messages; it does not prove real email delivery.

No application environment variables are needed yet. CLI status may show local
development keys and connection information: never commit that output or put
secret/service-role credentials in frontend code. The API's existing health
endpoint remains a process check, not a database readiness check.

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
without Docker; the live database checks must be run locally.

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

## Verify the legacy profile upgrade independently

Run `bun run db:test:upgrade` with Docker available through the local
`/var/run/docker.sock`. This rejects all arguments and ignores remote Docker
contexts: it creates one PostgreSQL 17.11 Alpine container without networking or
published ports, mounts only the SQL fixture directory read-only, and removes
only its exact newly created container and anonymous data volume on completion
or test failure. The first
run can download the version-pinned [official PostgreSQL image](https://hub.docker.com/_/postgres).
No existing development database, hosted URL or credential is accepted.

The fixture applies the original migrations, seeds a UUID-owned profile before
the Clerk migration, and asserts owner/name/cooldown retention, reserved names,
Clerk access, rejection isolation and legacy-subject denial. Its small Auth
helpers model claim extraction only; use the normal Supabase database suite for
platform-specific schema checks. This does not prove hosted Clerk trust or login.
Ordinary `bun test` remains Docker-free; CI invokes this upgrade probe separately.
