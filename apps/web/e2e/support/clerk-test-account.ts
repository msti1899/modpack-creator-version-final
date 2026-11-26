import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClerkClient } from "@clerk/backend";
import { requireDevelopmentInstance } from "./clerk-env";

/**
 * One throwaway account per authenticated run.
 *
 * The account is created through the Clerk Backend API with a `+clerk_test`
 * address, so no mail is delivered and the address cannot collide with a real
 * person's. Nothing is reused between runs and no long-lived credential is
 * stored: the run records the created id, signs in, and deletes the account when
 * it ends. See docs/decisions/0007-authenticated-e2e-account.md.
 *
 * Two failures are covered explicitly, because a killed run can leave a live
 * account behind:
 *   - the recorded account is deleted before the next one is created, so an
 *     interrupted run is reconciled by the next authenticated run;
 *   - a run that died between creating the account and recording it is caught by
 *     a sweep of test-owned accounts older than an hour.
 */

const authDir = path.join(__dirname, "..", ".auth");
const accountFile = path.join(authDir, "account.json");

export const storageStateFile = path.join(authDir, "state.json");

const emailPrefix = "modpack.e2e.";
const staleAfterMs = 60 * 60 * 1000;
const pageSize = 100;
const maxPages = 10;

export type TestAccount = { id: string; emailAddress: string };

function client() {
  const { secretKey } = requireDevelopmentInstance();
  return createClerkClient({ secretKey });
}

function isMissingUser(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === 404;
}

async function deleteAccount(id: string): Promise<void> {
  try {
    await client().users.deleteUser(id);
  } catch (error) {
    if (!isMissingUser(error)) throw error;
  }
}

export async function createTestAccount(): Promise<TestAccount> {
  const emailAddress = `${emailPrefix}${Date.now()}.${randomUUID().slice(0, 8)}+clerk_test@example.com`;

  await deleteRecordedAccount();
  await deleteStaleTestAccounts();

  const user = await client().users.createUser({
    emailAddress: [emailAddress],
    skipPasswordRequirement: true,
    // Marks the account as test-owned, so a later reader can tell it apart from
    // a real account before anything touches it.
    privateMetadata: { e2eTestUser: true },
  });

  await mkdir(authDir, { recursive: true });
  await writeFile(accountFile, `${JSON.stringify({ id: user.id, emailAddress }, null, 2)}\n`);
  return { id: user.id, emailAddress };
}

export async function readTestAccount(): Promise<TestAccount> {
  return JSON.parse(await readFile(accountFile, "utf8")) as TestAccount;
}

/**
 * Deletes the account recorded by this run and clears its local state.
 *
 * A missing record is a no-op: the public suite never creates one. A failed
 * provider deletion keeps the record, so the next run retries instead of
 * forgetting a live account. Without a development key there is nothing safe to
 * attempt, so it warns and keeps the record rather than failing an unrelated run.
 */
export async function deleteRecordedAccount(): Promise<void> {
  let account: TestAccount;
  try {
    account = await readTestAccount();
  } catch {
    return;
  }

  if (!(process.env.CLERK_SECRET_KEY ?? "").startsWith("sk_test_")) {
    console.warn(
      "A recorded test account is still waiting to be deleted. Run the authenticated suite with the development-instance keys to clean it up.",
    );
    return;
  }

  await deleteAccount(account.id);
  await rm(authDir, { recursive: true, force: true });
}

/**
 * Deletes test-owned accounts left behind by an interrupted run.
 *
 * An account qualifies only when a previous run marked it test-owned and its
 * address carries the run prefix. Accounts younger than an hour are left alone,
 * so a suite running in parallel is not touched.
 */
export async function deleteStaleTestAccounts(now = Date.now()): Promise<number> {
  const clerk = client();
  const stale: string[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const { data } = await clerk.users.getUserList({ limit: pageSize, offset: page * pageSize });
    for (const user of data) {
      if (user.privateMetadata?.e2eTestUser !== true) continue;
      if (!user.emailAddresses.some((entry) => entry.emailAddress.startsWith(emailPrefix))) continue;
      if (now - user.createdAt <= staleAfterMs) continue;
      stale.push(user.id);
    }
    if (data.length < pageSize) break;
  }

  for (const id of stale) await deleteAccount(id);
  return stale.length;
}
