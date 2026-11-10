# Account API cutover (review-chain state)

The former Supabase `/auth/register`, `/auth/login`, `/auth/verify`, `/auth/recover`
and `/auth/password` proxies return 404 without forwarding credentials or returning
sessions. Do not follow the previous account/email-hash examples or retry those
URLs. Clerk owns these flows in the completed integration; no replacement password
or token issuer is added to Hono.

This child only retires the account proxies. `/me` and `/profile` still use the
previous identity verification until the next Clerk cutover. It is not a complete
or independently deployable integration. No provider accounts/settings, credentials
or existing data are imported, deleted or changed by this route retirement.

Application profile/username rules remain separate from provider account settings.
Use the [API reference](../reference/backend-api.md) for this boundary and the
[reconciliation task log](../../odd/tasks/clerk-reconciliation.md) for the full
verified integration and remaining review slices. Do not store real credentials
in chat, Git, logs or shell history; external setup remains separately authorized.
