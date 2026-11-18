/**
 * The identity read the frame renders.
 *
 * `GET /api/me` stays identity-only (`docs/reference/backend-api.md`); F2 owns
 * the username, so the shell never asks for one. The parser mirrors the
 * handler's own validation, so a malformed body is a failed read rather than a
 * half-empty chip.
 */

export type ShellIdentity = {
  id: string;
  email: string | null;
};

const SUBJECT = /^user_[A-Za-z0-9]+$/;

export function parseIdentityRead(value: unknown): ShellIdentity | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { user } = value as Record<string, unknown>;
  if (typeof user !== "object" || user === null || Array.isArray(user)) return null;
  const { id, email } = user as Record<string, unknown>;
  if (typeof id !== "string" || !SUBJECT.test(id)) return null;
  if (email !== null && typeof email !== "string") return null;
  return { id, email: (email as string | null) ?? null };
}
