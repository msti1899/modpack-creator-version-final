import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Pins the account lifecycle without touching the provider.
 *
 * The real suite creates and deletes an account in a Clerk development instance.
 * What must never happen is a live account whose record was thrown away: that is
 * an account nobody will clean up. These cases cover the deletion outcomes and the
 * two recovery paths that do not need a provider call.
 */

const createUser = vi.fn();
const deleteUser = vi.fn();
const getUserList = vi.fn();

vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({ users: { createUser, deleteUser, getUserList } }),
}));

const authDir = path.join(__dirname, "../../e2e/.auth");
const accountFile = path.join(authDir, "account.json");
const leftover = { id: "user_leftover", emailAddress: "modpack.e2e.1.abcdefgh+clerk_test@example.com" };

async function record(account: typeof leftover = leftover) {
  await mkdir(authDir, { recursive: true });
  await writeFile(accountFile, JSON.stringify(account));
}

beforeEach(async () => {
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_unit");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_unit");
  createUser.mockReset();
  deleteUser.mockReset();
  getUserList.mockReset();
  getUserList.mockResolvedValue({ data: [] });
  await rm(authDir, { recursive: true, force: true });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await rm(authDir, { recursive: true, force: true });
});

describe("throwaway Clerk account lifecycle", () => {
  test("creates a +clerk_test account, marks it test-owned and records it", async () => {
    const mod = await import("../../e2e/support/clerk-test-account");
    createUser.mockResolvedValue({ id: "user_next" });

    const account = await mod.createTestAccount();

    const payload = createUser.mock.calls[0][0];
    expect(payload.emailAddress[0]).toMatch(/^modpack\.e2e\.\d+\.[0-9a-f]{8}\+clerk_test@example\.com$/);
    expect(payload.privateMetadata).toEqual({ e2eTestUser: true });
    expect(account.id).toBe("user_next");
    expect(JSON.parse(await readFile(accountFile, "utf8")).id).toBe("user_next");
  });

  test("deletes the recorded account and clears the record on success", async () => {
    const mod = await import("../../e2e/support/clerk-test-account");
    await record();
    deleteUser.mockResolvedValue({ id: leftover.id });

    await mod.deleteRecordedAccount();

    expect(deleteUser).toHaveBeenCalledWith(leftover.id);
    await expect(readFile(accountFile, "utf8")).rejects.toThrow();
  });

  test("treats an already deleted account as cleaned up", async () => {
    const mod = await import("../../e2e/support/clerk-test-account");
    await record();
    deleteUser.mockRejectedValue(Object.assign(new Error("not found"), { status: 404 }));

    await mod.deleteRecordedAccount();

    await expect(readFile(accountFile, "utf8")).rejects.toThrow();
  });

  test("keeps the record when the provider deletion fails", async () => {
    const mod = await import("../../e2e/support/clerk-test-account");
    await record();
    deleteUser.mockRejectedValue(Object.assign(new Error("provider unavailable"), { status: 500 }));

    await expect(mod.deleteRecordedAccount()).rejects.toThrow(/provider unavailable/);

    expect(JSON.parse(await readFile(accountFile, "utf8")).id).toBe(leftover.id);
  });

  test("does not fail a credential-free run over a leftover record", async () => {
    const mod = await import("../../e2e/support/clerk-test-account");
    await record();
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");

    await expect(mod.deleteRecordedAccount()).resolves.toBeUndefined();

    expect(JSON.parse(await readFile(accountFile, "utf8")).id).toBe(leftover.id);
  });

  test("removes a leftover account before creating the next one", async () => {
    const mod = await import("../../e2e/support/clerk-test-account");
    await record();
    createUser.mockResolvedValue({ id: "user_next" });
    deleteUser.mockResolvedValue({ id: leftover.id });

    await mod.createTestAccount();

    expect(deleteUser).toHaveBeenCalledWith(leftover.id);
  });

  test("deletes only old accounts that a previous run marked as its own", async () => {
    const mod = await import("../../e2e/support/clerk-test-account");
    const hour = 60 * 60 * 1000;
    const now = 10 * hour;
    getUserList.mockResolvedValue({
      data: [
        { id: "user_stale", createdAt: 0, privateMetadata: { e2eTestUser: true }, emailAddresses: [{ emailAddress: "modpack.e2e.1.aaaaaaaa+clerk_test@example.com" }] },
        { id: "user_fresh", createdAt: now - 1000, privateMetadata: { e2eTestUser: true }, emailAddresses: [{ emailAddress: "modpack.e2e.2.bbbbbbbb+clerk_test@example.com" }] },
        { id: "user_person", createdAt: 0, privateMetadata: {}, emailAddresses: [{ emailAddress: "modpack.e2e.3.cccccccc+clerk_test@example.com" }] },
        { id: "user_other", createdAt: 0, privateMetadata: { e2eTestUser: true }, emailAddresses: [{ emailAddress: "someone@example.com" }] },
      ],
    });
    deleteUser.mockResolvedValue({});

    const deleted = await mod.deleteStaleTestAccounts(now);

    expect(deleted).toBe(1);
    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(deleteUser).toHaveBeenCalledWith("user_stale");
  });
});
