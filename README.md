# Modpack Creator

An open-source Minecraft modpack project. This initial scaffold contains two
independent applications in a Bun workspace: a Next.js frontend and a Hono API.
The backend supports Modrinth search, dependency resolution, and `.mrpack` export.
The frontend is still a starter page. The backend verifies Clerk session identity at `/me` and protects application
username profiles. Web account controls and the same-origin identity bridge are connected locally; groups, voting, and pack persistence are not implemented. See the [local identity guide](docs/guides/local-identity.md).

Confirmed product and architecture choices are recorded in the
[project documentation](docs/README.md), alongside a reusable decision template.
For ongoing work, use the [backend roadmap](docs/plans/backend-roadmap.md) and
[current handoff](docs/handoff.md).

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
The API defaults to port 3001; optionally copy `apps/api/.env.example` to
`apps/api/.env` to configure `PORT`. Never commit real environment files.

## Check the scaffold

For the optional local database foundation, follow the
[Supabase development guide](docs/guides/local-database.md). It uses a pinned
local CLI and Docker; no cloud account or application database connection is
configured yet. The existing Modrinth endpoints still run without a database.

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

## Integration status

- Supabase PostgreSQL: application profiles now use verified Clerk user IDs and the existing naming rules. The
  API identity cutover, web account controls and identity bridge are local;
  final review-chain regression and continuity work remain. Do not deploy this partial chain independently.
- Brevo: the former auth-email prerequisite is superseded by Clerk-managed
  account flows. Real provider/email setup and delivery remain separately verified.
- Modrinth: the backend catalog and `.mrpack` export are implemented; frontend integration is deferred.

The initial operating target is USD 0/month and approximately 15 users, not a
guarantee of unlimited free service. Do not add service credentials until the
corresponding integration is implemented.
