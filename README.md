# Modpack Creator

An open-source project for creating and sharing Minecraft modpacks. Two independent
applications share a Bun workspace: a Next.js frontend and a Hono API.
The API implements Modrinth search, dependency resolution, `.mrpack` export,
Clerk session verification, application profile endpoints, group membership and
modpack drafts, and group votes on mod additions. The frontend has account controls
and a same-origin identity bridge, not a complete modpack editor. Published pack
versions remain planned.

Start with the local quick path below, or choose a task in the
[documentation index](docs/README.md). The [current handoff](docs/handoff.md)
records environment-specific verification and blockers; an implemented endpoint
does not imply that its hosted dependencies are configured.

## Run locally

Prerequisites: Bun 1.4.4 and Node.js 22 or newer. Node runs Next.js; Bun runs the
API and manages dependencies and workspace scripts.

```bash
bun install --frozen-lockfile
bun run dev
```

- Web: http://localhost:3000
- API health check: http://localhost:3001/health

Run either application independently with `bun run dev:web` or `bun run dev:api`.
For Clerk configuration, use the [local identity guide](docs/guides/local-identity.md).
The [historical startup report](docs/handoff-history-2026-11-12.md#local-startup-correction-and-api-configuration)
records the previously verified localhost-binding workaround.
The API defaults to port 3001; optionally copy `apps/api/.env.example` to
`apps/api/.env` to configure `PORT`. Never commit real environment files.

## Check locally

For the optional local database foundation, follow the
[Supabase development guide](docs/guides/local-database.md). It uses a pinned
local CLI and Docker without requiring a cloud account. The existing Modrinth
endpoints still run without a database. Profile setup has separate prerequisites
in the [profile guide](docs/guides/account-profiles.md).

```bash
bun run check
bun run build
```

`check` runs TypeScript checks for both applications and the Bun test suite.
`build` produces the production Next.js build. The API is TypeScript source
executed by Bun locally and built by Vercel's Hono integration when deployed.

## Repository layout

```text
apps/
  web/                 Next.js App Router + TypeScript + Tailwind CSS
  api/
    src/index.ts       Hono application; Vercel entrypoint
    src/dev.ts         Local Bun server only
```

See the [modpack creation guide](docs/guides/create-modpack.md) for the stateless search,
dependency-approval, and pack-download workflow. Supply an exact Minecraft and
loader version; runtime compatibility is not guaranteed. No mods are redistributed.

The API and frontend are separate applications, not Next.js API routes. Their
health/page tests do not require credentials or external services. `/health`
checks the API process only; it does not claim database or email connectivity.

## Deployment direction

Create two independent Vercel projects from this repository when ready to deploy:

- Web root directory: `apps/web`, framework preset: Next.js.
- API root directory: `apps/api`, framework preset: Hono. `vercel.json` selects
  the Bun 1.4 runtime; `src/dev.ts` is not the production entrypoint.

In each project's settings, include source files outside its root directory so
Vercel can access the workspace lockfile. Use the repository's Bun package manager
and frozen lockfile; do not generate separate npm lockfiles in the applications.

The verified workflow is local; deployment and provider-account setup remain separate.
Bun on Vercel is currently beta. Vercel Hobby is limited to personal,
non-commercial use and has usage quotas; open source alone does not establish
eligibility.

## Continue reading

- [Documentation index](docs/README.md): guides, contracts, architecture and decisions.
- [Backend roadmap](docs/plans/backend-roadmap.md): approved future milestones.
- [Current handoff](docs/handoff.md): latest checkpoint and next action.
- [Delivery records](docs/delivery/README.md): numbered records of completed work,
  starting with the documentation reorganization rather than project inception.

The initial operating target is USD 0/month and approximately 15 users, not a
guarantee of unlimited free service. Do not add service credentials until the
corresponding integration is implemented.
