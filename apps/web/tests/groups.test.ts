import { describe, expect, it } from "bun:test";
import {
  GROUP_ERROR_SENTENCES,
  initialsFromEmail,
  NO_GROUP_LABEL,
  parseGroupRead,
  reduceGroup,
  roleLabel,
  safeRedirectPath,
} from "../src/lib/groups";
import { parseIdentityRead } from "../src/lib/identity-read";

const groupId = "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b";

describe("reduceGroup", () => {
  it("keeps the three fields the frame renders and drops the rest", () => {
    const reduced = reduceGroup({
      id: groupId,
      name: "Copper Hollow",
      role: "owner",
      visibility: "private",
      ownerId: "user_owner",
      memberCount: 3,
      members: [{ userId: "user_owner", username: "mara", role: "owner", joinedAt: "2026-11-01" }],
      requests: [{ userId: "user_x", username: "x", createdAt: "2026-11-01" }],
      invitation: { token: "a".repeat(64) },
    });

    expect(reduced).toEqual({ id: groupId, name: "Copper Hollow", role: "owner" });
  });

  it("rejects a role the product does not have", () => {
    expect(reduceGroup({ id: groupId, name: "Copper Hollow", role: "admin" })).toBeNull();
  });

  it("rejects an id that is not a UUID and an empty or oversized name", () => {
    expect(reduceGroup({ id: "group-1", name: "Copper Hollow", role: "owner" })).toBeNull();
    expect(reduceGroup({ id: groupId, name: "", role: "owner" })).toBeNull();
    expect(reduceGroup({ id: groupId, name: "x".repeat(61), role: "owner" })).toBeNull();
  });

  it("rejects a payload that is not an object", () => {
    expect(reduceGroup(null)).toBeNull();
    expect(reduceGroup([])).toBeNull();
    expect(reduceGroup("Copper Hollow")).toBeNull();
  });
});

describe("parseGroupRead", () => {
  it("accepts the documented no-group state", () => {
    expect(parseGroupRead({ group: null })).toEqual({ group: null });
  });

  it("accepts a member read", () => {
    expect(parseGroupRead({ group: { id: groupId, name: "Copper Hollow", role: "member", members: [] } })).toEqual({
      group: { id: groupId, name: "Copper Hollow", role: "member" },
    });
  });

  it("rejects a body without the group key, and one carrying extra shapes", () => {
    expect(parseGroupRead({})).toBeNull();
    expect(parseGroupRead({ group: { id: groupId, name: "Copper Hollow" } })).toBeNull();
    expect(parseGroupRead({ group: { id: groupId, name: "Copper Hollow", role: "owner" }, extra: true })).toEqual({
      group: { id: groupId, name: "Copper Hollow", role: "owner" },
    });
  });

  it("answers null for anything a broken upstream might send", () => {
    expect(parseGroupRead(undefined)).toBeNull();
    expect(parseGroupRead("{\"group\":null}")).toBeNull();
    expect(parseGroupRead({ group: [] })).toBeNull();
  });
});

describe("roleLabel", () => {
  it("names the role, and the no-group label when there is no group", () => {
    expect(roleLabel({ id: groupId, name: "Copper Hollow", role: "owner" })).toBe("Owner");
    expect(roleLabel({ id: groupId, name: "Copper Hollow", role: "member" })).toBe("Member");
    expect(roleLabel(null)).toBe(NO_GROUP_LABEL);
  });
});

describe("initialsFromEmail", () => {
  it("takes the first letter of up to two separated segments", () => {
    expect(initialsFromEmail("mara.reid@proton.me")).toBe("MR");
    expect(initialsFromEmail("mara_reid@proton.me")).toBe("MR");
    expect(initialsFromEmail("mara-reid@proton.me")).toBe("MR");
  });

  it("falls back to the first character of a single segment", () => {
    expect(initialsFromEmail("mara@proton.me")).toBe("M");
    expect(initialsFromEmail("mara.reid.third@proton.me")).toBe("MR");
  });

  it("never renders an empty disc", () => {
    expect(initialsFromEmail(null)).toBe("?");
    expect(initialsFromEmail("")).toBe("?");
  });
});

describe("safeRedirectPath", () => {
  it("accepts a same-origin path", () => {
    expect(safeRedirectPath("/mods")).toBe("/mods");
    expect(safeRedirectPath("/mods?gameVersion=1.21.1&loader=fabric")).toBe(
      "/mods?gameVersion=1.21.1&loader=fabric",
    );
    expect(safeRedirectPath("  /mods  ")).toBe("/mods");
  });

  it("refuses an absolute, protocol-relative or scheme-carrying destination", () => {
    expect(safeRedirectPath("https://evil.example/mods")).toBe("/");
    expect(safeRedirectPath("//evil.example/mods")).toBe("/");
    expect(safeRedirectPath("/\\evil.example")).toBe("/");
    expect(safeRedirectPath("mods")).toBe("/");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath(undefined)).toBe("/");
  });

  it("refuses control characters and whitespace inside the path", () => {
    expect(safeRedirectPath("/mods\nLocation: https://evil.example")).toBe("/");
    expect(safeRedirectPath(`/mods${String.fromCharCode(0)}`)).toBe("/");
  });

  it("trims surrounding whitespace instead of carrying it into the URL", () => {
    expect(safeRedirectPath("/mods\r\n")).toBe("/mods");
  });
});

describe("parseIdentityRead", () => {
  it("accepts the documented shape", () => {
    expect(parseIdentityRead({ user: { id: "user_2abc", email: "mara@proton.me" } })).toEqual({
      id: "user_2abc",
      email: "mara@proton.me",
    });
    expect(parseIdentityRead({ user: { id: "user_2abc", email: null } })).toEqual({
      id: "user_2abc",
      email: null,
    });
  });

  it("rejects an id that is not a Clerk subject and an email that is not text", () => {
    expect(parseIdentityRead({ user: { id: "abc", email: null } })).toBeNull();
    expect(parseIdentityRead({ user: { id: "user_2abc", email: 42 } })).toBeNull();
    expect(parseIdentityRead({ user: null })).toBeNull();
    expect(parseIdentityRead({})).toBeNull();
  });
});

describe("error sentences", () => {
  it("never carries a status code", () => {
    for (const sentence of Object.values(GROUP_ERROR_SENTENCES)) {
      expect(sentence).not.toMatch(/\b[45]\d\d\b/);
    }
  });
});
