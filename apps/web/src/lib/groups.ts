/**
 * Shared contract for the authenticated group read the application shell needs.
 *
 * The API owns the `group` projection (`docs/reference/backend-api.md`, `GET
 * /groups/me`); the web redeclares only the part the frame renders, with the
 * same field names and nullability, and re-validates every payload at the
 * boundary so a malformed response can never reach the shell.
 */

export const GROUP_ROLE_LABELS = { owner: "Owner", member: "Member" } as const;
export type GroupRole = keyof typeof GROUP_ROLE_LABELS;

/** The label the frame shows when the read returns no group at all. */
export const NO_GROUP_LABEL = "No group";

/** The projection the shell may receive: nothing else crosses the handler. */
export type ShellGroup = {
  id: string;
  name: string;
  role: GroupRole;
};

export type GroupRead = { group: ShellGroup | null };

/** Sentences the one error surface may render. A status code is never one. */
export const GROUP_ERROR_SENTENCES = {
  signedOut: "Sign in to continue.",
  unconfigured: "Accounts are not configured for this deployment yet.",
  unavailable: "We couldn’t load this group just now.",
  timeout: "This is taking longer than it should. Try again in a moment.",
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reduce one API group record to the shell projection, or reject it.
 *
 * Members, join requests, cursors, the invitation, `ownerId`, `visibility` and
 * `createdAt` are deliberately discarded: the frame renders none of them, and
 * forwarding them would put private values in markup that never shows them.
 */
export function reduceGroup(value: unknown): ShellGroup | null {
  if (!isRecord(value)) return null;
  const { id, name, role } = value;
  if (typeof id !== "string" || !UUID.test(id)) return null;
  if (typeof name !== "string" || name.length === 0 || name.length > MAX_NAME_LENGTH) return null;
  if (role !== "owner" && role !== "member") return null;
  return { id, name, role };
}

/**
 * Parse a whole `GET /groups/me` body into the shell projection.
 *
 * `{ group: null }` is a documented state, not an error. Anything that is not
 * exactly one of the two shapes is rejected, so the caller answers `502`.
 */
export function parseGroupRead(value: unknown): GroupRead | null {
  if (!isRecord(value) || !("group" in value)) return null;
  if (value.group === null) return { group: null };
  const group = reduceGroup(value.group);
  return group ? { group } : null;
}

/** The role text the chip shows, or the no-group label when there is none. */
export function roleLabel(group: ShellGroup | null): string {
  return group ? GROUP_ROLE_LABELS[group.role] : NO_GROUP_LABEL;
}

/**
 * Derive the monogram from the email local part.
 *
 * No display name exists until F2 delivers a username, so the approved artboard
 * draws initials from the address. Up to two dot-, underscore- or hyphen-
 * separated segments contribute their first character; a missing address falls
 * back to a single question mark so the disc never renders empty.
 */
export function initialsFromEmail(email: string | null): string {
  if (!email) return "?";
  const local = email.split("@")[0] ?? "";
  const segments = local.split(/[._-]/).filter((segment) => segment.length > 0);
  const letters = segments
    .slice(0, 2)
    .map((segment) => Array.from(segment)[0] ?? "")
    .join("");
  const fallback = Array.from(local)[0] ?? "";
  return (letters || fallback || "?").toUpperCase();
}

/**
 * Guard the post-authentication destination.
 *
 * `redirect_url` is Clerk's own name for the destination, so it is read as is.
 * Only a same-origin path is accepted: it must begin with a single `/`, must
 * not begin with `//` or `/\`, must not carry a scheme or backslash, and must
 * not be a protocol-relative or absolute URL. Anything else lands on `/`.
 */
export function safeRedirectPath(value: string | null | undefined): string {
  if (typeof value !== "string") return "/";
  const candidate = value.trim();
  if (candidate.length === 0 || candidate.length > 2048) return "/";
  if (!candidate.startsWith("/")) return "/";
  if (candidate.startsWith("//")) return "/";
  if (candidate.includes("\\")) return "/";
  if (candidate.includes("://")) return "/";
  // Control characters and whitespace cannot appear in a path an application
  // builds itself; rejecting them keeps header and log injection out.
  for (const character of candidate) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return "/";
  }
  if (/\s/.test(candidate)) return "/";
  return candidate;
}
