import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { groupQueryKey, identityQueryKey, syncAccountCache } from "@/lib/account-cache";
import { useAccountCache } from "@/components/query-provider";

const client = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

describe("the account boundary", () => {
  test("a group read is keyed by the caller, so two accounts never share one entry", () => {
    expect(groupQueryKey("user_one")).not.toEqual(groupQueryKey("user_two"));
    expect(groupQueryKey(null)).toEqual(["group", null]);
    expect(identityQueryKey()).toEqual(["identity"]);
  });

  test("changing the caller drops every cached read", () => {
    const query = client();
    query.setQueryData(groupQueryKey("user_one"), { group: { id: "g", name: "Copper Hollow", role: "owner" } });
    query.setQueryData(identityQueryKey(), { id: "user_one", email: "mara@proton.me" });

    expect(syncAccountCache(query, "user_two", "user_one")).toBe(true);
    expect(query.getQueryData(groupQueryKey("user_one"))).toBeUndefined();
    expect(query.getQueryData(identityQueryKey())).toBeUndefined();
  });

  test("rendering the same caller again clears nothing", () => {
    const query = client();
    query.setQueryData(groupQueryKey("user_one"), { group: null });
    expect(syncAccountCache(query, "user_one", "user_one")).toBe(false);
    expect(query.getQueryData(groupQueryKey("user_one"))).toEqual({ group: null });
  });

  test("signing out clears the previous person's read", () => {
    const query = client();
    query.setQueryData(groupQueryKey("user_one"), { group: { id: "g", name: "Copper Hollow", role: "owner" } });

    expect(syncAccountCache(query, null, "user_one")).toBe(true);
    expect(query.getQueryData(groupQueryKey("user_one"))).toBeUndefined();
  });

  test("the hook clears when the identity changes between renders", () => {
    const query = client();
    query.setQueryData(["group", "user_one"], { group: { id: "g", name: "Copper Hollow", role: "owner" } });

    const { rerender } = renderHook(({ id }: { id: string | null }) => useAccountCache(query, id), {
      initialProps: { id: "user_one" as string | null },
    });

    // Mounting must not clear what the current render is about to read.
    expect(query.getQueryData(["group", "user_one"])).toEqual({
      group: { id: "g", name: "Copper Hollow", role: "owner" },
    });

    rerender({ id: "user_two" });
    expect(query.getQueryData(["group", "user_one"])).toBeUndefined();
  });
});
