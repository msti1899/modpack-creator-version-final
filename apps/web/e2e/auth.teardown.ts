import { deleteRecordedAccount } from "./support/clerk-test-account";

/**
 * Deletes the account this run created, on success and on failure.
 *
 * It runs in both modes: the public suite records no account, so it is a no-op
 * there. A leftover record from an interrupted run is still cleaned up.
 */
export default async function teardown(): Promise<void> {
  await deleteRecordedAccount();
}
