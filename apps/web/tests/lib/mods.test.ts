import { describe, expect, test } from "vitest";
import {
  buildModSearch,
  environmentLabel,
  formatCount,
  formatTotal,
  hasMore,
  isModSummary,
  nextOffset,
  parseModContext,
  parseModPage,
  serializeModSearch,
  type ModSummary,
} from "@/lib/mods";

const nullSummary: ModSummary = {
  projectId: "abc123",
  slug: "mosslight-decor",
  title: "Mosslight Decor",
  description: "Mossy planters, lamps and small garden props.",
  iconUrl: null,
  downloads: null,
  follows: null,
  author: null,
  categories: [],
  clientSide: null,
  serverSide: null,
  latestVersion: null,
};

function search(input: string) {
  return buildModSearch(new URLSearchParams(input));
}

function searchOrThrow(input: string) {
  const result = search(input);
  if (!result.ok) throw new Error(`expected a valid search: ${result.error}`);
  return result.search;
}

describe("buildModSearch", () => {
  test("an empty query string applies the pack defaults", () => {
    expect(searchOrThrow("")).toEqual({
      query: "",
      gameVersion: "1.21.1",
      loader: "fabric",
      offset: 0,
      sort: "relevance",
      categories: [],
      environment: null,
      author: null,
    });
  });

  test("every allowed parameter is read and normalized", () => {
    const result = searchOrThrow(
      "query=sodium&gameVersion=1.20.1&loader=neoforge&offset=40&sort=downloads" +
        "&category=optimization&category=utility&environment=server&author=jellysquid3",
    );

    expect(result).toEqual({
      query: "sodium",
      gameVersion: "1.20.1",
      loader: "neoforge",
      offset: 40,
      sort: "downloads",
      categories: ["optimization", "utility"],
      environment: "server",
      author: "jellysquid3",
    });
  });

  test("comma-separated categories are split and de-duplicated in order", () => {
    expect(searchOrThrow("category=utility,optimization&category=optimization").categories).toEqual([
      "utility",
      "optimization",
    ]);
  });

  test("serialization emits exactly the eight API parameters", () => {
    const params = serializeModSearch(
      searchOrThrow(
        "query=sodium&gameVersion=1.20.1&loader=neoforge&offset=40&sort=follows" +
          "&category=optimization&category=utility&environment=client&author=mezz",
      ),
    );

    expect([...params.keys()]).toEqual([
      "query",
      "gameVersion",
      "loader",
      "offset",
      "sort",
      "category",
      "category",
      "environment",
      "author",
    ]);
    expect(params.get("query")).toBe("sodium");
    expect(params.get("gameVersion")).toBe("1.20.1");
    expect(params.get("loader")).toBe("neoforge");
    expect(params.get("offset")).toBe("40");
    expect(params.get("sort")).toBe("follows");
    expect(params.getAll("category")).toEqual(["optimization", "utility"]);
    expect(params.get("environment")).toBe("client");
    expect(params.get("author")).toBe("mezz");
    expect(params.toString()).not.toMatch(/limit|facets|index/);
  });

  test("absent optional parameters stay out of the serialized URL", () => {
    expect([...serializeModSearch(searchOrThrow("")).keys()]).toEqual([
      "query",
      "gameVersion",
      "loader",
      "offset",
      "sort",
    ]);
  });

  test("an unknown parameter is rejected instead of forwarded", () => {
    const result = search("limit=20");
    expect(result).toEqual({ ok: false, error: 'Unknown search parameter "limit".' });
  });

  test.each([
    ["sort=top", "The sort must be one of relevance, downloads, follows, newest or updated."],
    ["environment=both", "The environment must be client or server."],
    ["loader=vanilla", "The loader must be one of fabric, forge, neoforge or quilt."],
    ["gameVersion=1.21 1", "The game version is invalid."],
    ["offset=-1", "The search offset must be a whole number from 0 to 10000."],
    ["offset=1.5", "The search offset must be a whole number from 0 to 10000."],
    ["offset=10001", "The search offset must be a whole number from 0 to 10000."],
    ["offset=abc", "The search offset must be a whole number from 0 to 10000."],
    ["category=Optimization", 'The category "Optimization" is invalid.'],
    ["author=bad author", "The author may contain only letters, numbers, underscores and hyphens."],
    ["query=a\u0000b", "The search query contains unsupported characters."],
    [`query=${"a".repeat(101)}`, "The search query must be 100 characters or fewer."],
  ])("rejects %s", (input, message) => {
    expect(search(input)).toEqual({ ok: false, error: message });
  });

  test("a repeated single-value parameter is rejected rather than silently narrowed", () => {
    expect(search("sort=downloads&sort=newest")).toEqual({
      ok: false,
      error: 'The "sort" parameter may appear only once.',
    });
  });
});

describe("formatCount", () => {
  test.each([
    [null, "—"],
    [0, "0"],
    [7, "7"],
    [999, "999"],
    [1_000, "1K"],
    [1_284, "1.3K"],
    [842_100, "842.1K"],
    [999_999, "1M"],
    [21_700_000, "21.7M"],
    [84_300_000, "84.3M"],
  ])("formats %s as %s", (value, expected) => {
    expect(formatCount(value)).toBe(expected);
  });

  test("null counts never render as a zero", () => {
    expect(formatCount(null)).not.toBe(formatCount(0));
  });
});

describe("formatTotal", () => {
  test("groups a plain integer for the result counter", () => {
    expect(formatTotal(1_284)).toBe("1,284");
    expect(formatTotal(20)).toBe("20");
  });
});

describe("environmentLabel", () => {
  test.each([
    ["required", "unsupported", "Client only"],
    ["optional", "unsupported", "Client only"],
    ["unsupported", "required", "Server only"],
    ["required", "required", "Both sides"],
    ["required", "optional", "Both sides"],
    ["optional", "optional", "Both sides"],
    [null, null, "Unknown side"],
    ["unsupported", "unsupported", "Unknown side"],
  ])("maps %s/%s to %s", (client, server, expected) => {
    expect(environmentLabel(client as never, server as never)).toBe(expected);
  });
});

describe("offset and page helpers", () => {
  test("the next offset steps one page at a time", () => {
    expect(nextOffset(0)).toBe(20);
    expect(nextOffset(9980)).toBe(10_000);
    expect(nextOffset(10_000)).toBeNull();
    expect(nextOffset(9990)).toBeNull();
  });

  test("more results exist only while the loaded window stays under the total", () => {
    expect(hasMore(0, 20, 1_284)).toBe(true);
    expect(hasMore(0, 20, 20)).toBe(false);
    expect(hasMore(0, 0, 100)).toBe(false);
    expect(hasMore(9960, 20, 10_000)).toBe(true);
    expect(hasMore(9980, 20, 10_000)).toBe(false);
  });
});

describe("parseModContext", () => {
  test("missing values fall back to the documented defaults", () => {
    expect(parseModContext({})).toEqual({ gameVersion: "1.21.1", loader: "fabric" });
  });

  test("valid values are kept", () => {
    expect(parseModContext({ gameVersion: "1.20.6", loader: "neoforge" })).toEqual({
      gameVersion: "1.20.6",
      loader: "neoforge",
    });
  });

  test.each([
    { gameVersion: "1.21 1" },
    { loader: "Fabric" },
    { loader: "vanilla" },
    { gameVersion: ["1.20.6", "1.21"] },
    { gameVersion: "" },
  ])("an invalid context value falls back (%o)", (values) => {
    expect(parseModContext(values)).toEqual({ gameVersion: "1.21.1", loader: "fabric" });
  });
});

describe("summary and page shape", () => {
  test("a summary whose enriched fields are absent is still valid", () => {
    expect(isModSummary(nullSummary)).toBe(true);
  });

  test.each([
    [{ ...nullSummary, projectId: 4 }],
    [{ ...nullSummary, title: null }],
    [{ ...nullSummary, downloads: -1 }],
    [{ ...nullSummary, follows: 1.5 }],
    [{ ...nullSummary, categories: ["utility", 7] }],
    [{ ...nullSummary, clientSide: "sometimes" }],
    [{ ...nullSummary, iconUrl: 12 }],
    [{ ...nullSummary, latestVersion: false }],
  ])("rejects a malformed summary", (value) => {
    expect(isModSummary(value)).toBe(false);
  });

  test("a well-formed page keeps its hits and counters", () => {
    expect(parseModPage({ hits: [nullSummary], total: 1_284, offset: 0 })).toEqual({
      hits: [nullSummary],
      total: 1_284,
      offset: 0,
    });
  });

  test.each([
    [null],
    [[]],
    [{ hits: [], total: 1_284 }],
    [{ hits: [], total: 1.5, offset: 0 }],
    [{ hits: [], total: -1, offset: 0 }],
    [{ hits: [], total: 0, offset: "0" }],
    [{ hits: [{ ttl: "missing fields" }], total: 1, offset: 0 }],
    [{ hits: 4, total: 1, offset: 0 }],
  ])("rejects a malformed page (%o)", (value) => {
    expect(parseModPage(value)).toBeNull();
  });
});
