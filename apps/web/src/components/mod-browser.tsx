"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Download,
  Filter,
  Lock,
  Moon,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  Sun,
  TriangleAlert,
  User,
  X,
} from "lucide-react";
import { BrandMark } from "./brand-mark";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import {
  environmentLabel,
  formatCount,
  formatTotal,
  hasMore,
  MOD_LOADER_LABELS,
  MOD_PAGE_SIZE,
  MOD_QUERY_LIMIT,
  MOD_SORT_LABELS,
  MOD_SORTS,
  nextOffset,
  parseModPage,
  serializeModSearch,
  type ModEnvironment,
  type ModLoader,
  type ModSearch,
  type ModSort,
  type ModSummary,
} from "@/lib/mods";

/**
 * The facet taxonomy is the documented Modrinth category set the design shows.
 * Facet totals are not part of `GET /mods`, so rows carry no counts.
 */
const CATEGORIES = [
  { id: "optimization", label: "Optimization" },
  { id: "adventure", label: "Adventure" },
  { id: "decoration", label: "Decoration" },
  { id: "technology", label: "Technology" },
  { id: "utility", label: "Utility" },
  { id: "worldgen", label: "Worldgen" },
  { id: "library", label: "Library" },
  { id: "shaders", label: "Shaders" },
  { id: "food", label: "Food" },
  { id: "storage", label: "Storage" },
  { id: "magic", label: "Magic" },
  { id: "transportation", label: "Transportation" },
] as const;

const CATEGORY_LABELS: Map<string, string> = new Map(
  CATEGORIES.map((category) => [category.id, category.label]),
);
const VISIBLE_CATEGORIES = 7;

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const fieldClass = cn(
  "h-9 w-full rounded-lg border border-input bg-muted px-2.5 text-[13px] text-foreground placeholder:text-muted-foreground",
  focusRing,
);
const chipClass =
  "inline-flex h-6 items-center gap-1 rounded-sm bg-secondary px-2 text-[11.5px] whitespace-nowrap text-muted-foreground";
const badgeClass =
  "inline-flex h-5 items-center rounded-sm bg-secondary px-1.5 text-[11px] whitespace-nowrap text-muted-foreground";
const secondaryButton =
  "h-[34px] gap-1.5 rounded-lg px-3.5 text-[12.5px] font-semibold";

type LoadState = "loading" | "ready" | "error";

type FacetProps = {
  idPrefix: string;
  query: string;
  onQuery: (value: string) => void;
  categories: string[];
  onCategory: (id: string) => void;
  environment: ModEnvironment | null;
  onEnvironment: (value: ModEnvironment) => void;
  authorDraft: string;
  onAuthorDraft: (value: string) => void;
  onAuthorCommit: () => void;
  showAll: boolean;
  onShowAll: () => void;
  onClear: () => void;
  withHead?: boolean;
};

function Facets({
  idPrefix,
  query,
  onQuery,
  categories,
  onCategory,
  environment,
  onEnvironment,
  authorDraft,
  onAuthorDraft,
  onAuthorCommit,
  showAll,
  onShowAll,
  onClear,
  withHead = true,
}: FacetProps) {
  const visible = showAll ? CATEGORIES : CATEGORIES.slice(0, VISIBLE_CATEGORIES);
  const chips = [
    ...categories.map((id) => (
      <span key={`category-${id}`} className={chipClass}>
        {CATEGORY_LABELS.get(id) ?? id}
        <button
          type="button"
          aria-label={`Remove ${CATEGORY_LABELS.get(id) ?? id} category filter`}
          onClick={() => onCategory(id)}
          className={cn(
            "grid size-[18px] place-items-center rounded-sm hover:bg-sidebar-accent hover:text-foreground",
            focusRing,
          )}
        >
          <X className="size-[11px]" aria-hidden="true" />
        </button>
      </span>
    )),
    ...(environment
      ? [
          <span key="environment" className={chipClass}>
            {environment === "client" ? "Client" : "Server"}
            <button
              type="button"
              aria-label={`Remove ${environment === "client" ? "Client" : "Server"} environment filter`}
              onClick={() => onEnvironment(environment)}
              className={cn(
                "grid size-[18px] place-items-center rounded-sm hover:bg-sidebar-accent hover:text-foreground",
                focusRing,
              )}
            >
              <X className="size-[11px]" aria-hidden="true" />
            </button>
          </span>,
        ]
      : []),
  ];

  return (
    <>
      {withHead ? (
        <div className="flex items-center justify-between px-1 pb-2">
          <h2 id="filters-title" className="text-[13px] font-semibold tracking-[-0.004em]">
            Filters
          </h2>
          <button
            type="button"
            onClick={onClear}
            className={cn("rounded-sm px-0.5 py-0.5 text-[12px] hover:underline hover:underline-offset-3", focusRing)}
          >
            Clear all
          </button>
        </div>
      ) : null}

      {withHead ? (
        chips.length > 0 ? (
          <div role="group" aria-label="Active filters" className="flex flex-wrap gap-1.5 px-1 pb-2.5">
            {chips}
          </div>
        ) : null
      ) : null}

      <div className="flex flex-col gap-1.5 px-1 pb-4">
        <label htmlFor={`${idPrefix}-search`} className="text-[12px] font-semibold">
          Search
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-[15px] -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id={`${idPrefix}-search`}
            name="query"
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search mods…"
            autoComplete="off"
            spellCheck={false}
            maxLength={MOD_QUERY_LIMIT}
            className={cn(fieldClass, "pl-8")}
          />
        </div>
      </div>

      <section
        aria-labelledby={`${idPrefix}-category-title`}
        className="border-t border-[color:var(--facet-divider)] px-1 pt-3.5"
      >
        <h3 id={`${idPrefix}-category-title`} className="pb-2.5 text-[12px] font-semibold tracking-[-0.002em]">
          Category
        </h3>
        <ul className="m-0 list-none p-0">
          {visible.map((category) => {
            const pressed = categories.includes(category.id);
            return (
              <li key={category.id}>
                <button
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => onCategory(category.id)}
                  className={cn(
                    "grid h-[30px] w-full grid-cols-[16px_minmax(0,1fr)] items-center gap-[9px] rounded-md border border-transparent px-1.5 text-left text-[13px] text-inherit",
                    "hover:bg-[color:var(--facet-hover)] aria-pressed:bg-[color:var(--facet-active)] aria-pressed:font-semibold",
                    focusRing,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-4 place-items-center rounded-sm border",
                      pressed
                        ? "border-foreground bg-foreground text-background"
                        : "border-input bg-card text-transparent",
                    )}
                  >
                    <Check className="size-[11px]" />
                  </span>
                  <span className="min-w-0 truncate">{category.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={onShowAll}
          className={cn(
            "mt-1 inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] hover:bg-[color:var(--facet-hover)]",
            focusRing,
          )}
        >
          <ChevronDown className={cn("size-3 transition-transform motion-reduce:transition-none", showAll && "rotate-180")} aria-hidden="true" />
          {showAll ? "Show fewer" : `Show all ${CATEGORIES.length}`}
        </button>
      </section>

      <section
        aria-labelledby={`${idPrefix}-environment-title`}
        className="mt-2.5 border-t border-[color:var(--facet-divider)] px-1 pt-3.5"
      >
        <h3 id={`${idPrefix}-environment-title`} className="pb-2.5 text-[12px] font-semibold tracking-[-0.002em]">
          Environment
        </h3>
        <ul className="m-0 list-none p-0">
          {(["client", "server"] as const).map((side) => {
            const pressed = environment === side;
            return (
              <li key={side}>
                <button
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => onEnvironment(side)}
                  className={cn(
                    "grid h-[30px] w-full grid-cols-[16px_minmax(0,1fr)] items-center gap-[9px] rounded-md border border-transparent px-1.5 text-left text-[13px] text-inherit",
                    "hover:bg-[color:var(--facet-hover)] aria-pressed:bg-[color:var(--facet-active)] aria-pressed:font-semibold",
                    focusRing,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-4 place-items-center rounded-sm border",
                      pressed
                        ? "border-foreground bg-foreground text-background"
                        : "border-input bg-card text-transparent",
                    )}
                  >
                    <Check className="size-[11px]" />
                  </span>
                  <span className="min-w-0 truncate">{side === "client" ? "Client" : "Server"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-labelledby={`${idPrefix}-author-title`}
        className="mt-2.5 border-t border-[color:var(--facet-divider)] px-1 pt-3.5"
      >
        <h3 id={`${idPrefix}-author-title`} className="pb-2.5 text-[12px] font-semibold tracking-[-0.002em]">
          Author
        </h3>
        <div className="relative">
          <User
            className="pointer-events-none absolute top-1/2 left-2.5 size-[15px] -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id={`${idPrefix}-author`}
            name="author"
            type="text"
            value={authorDraft}
            onChange={(event) => onAuthorDraft(event.target.value)}
            onBlur={onAuthorCommit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onAuthorCommit();
              }
            }}
            placeholder="e.g. jellysquid3"
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            aria-label="Author"
            className={cn(fieldClass, "pl-8")}
          />
        </div>
      </section>
    </>
  );
}

function ModIcon({ mod }: { mod: ModSummary }) {
  const [broken, setBroken] = useState(false);
  if (!mod.iconUrl || broken) {
    return (
      <>
        <span aria-hidden="true" className="text-[13px] font-semibold tracking-[-0.01em]">
          {mod.title.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <span className="sr-only">No icon available</span>
      </>
    );
  }
  return (
    // The catalog serves remote icons; a plain image keeps next/image remote
    // patterns out of the config, and the fallback covers a failed load.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={mod.iconUrl}
      alt=""
      width={32}
      height={32}
      loading="lazy"
      onError={() => setBroken(true)}
      className="size-full rounded-md object-cover"
    />
  );
}

function versionLabel(version: string | null) {
  if (version === null) return "—";
  return `v${version.replace(/^v/, "")}`;
}

function selectionMeta(mod: ModSummary) {
  const author = mod.author === null ? "Unknown author" : `by ${mod.author}`;
  const version = mod.latestVersion === null ? "no release listed" : versionLabel(mod.latestVersion);
  return `${author} · ${version}`;
}

function ModRow({
  mod,
  selected,
  onSelect,
}: {
  mod: ModSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "relative grid w-full grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 py-2.5 pr-2.5 text-left transition-colors motion-reduce:transition-none",
        "min-h-16 sm:h-[52px] sm:min-h-0 sm:grid-cols-[30px_minmax(120px,180px)_minmax(0,1fr)_76px_58px_78px] sm:gap-x-3 sm:py-0",
        "lg:h-14 lg:grid-cols-[32px_minmax(132px,168px)_minmax(0,1fr)_76px_48px_62px_78px]",
        "xl:grid-cols-[32px_minmax(190px,212px)_minmax(0,1fr)_140px_76px_50px_66px_74px]",
        selected
          ? "my-1 rounded-lg border border-border bg-card text-card-foreground shadow-[0_1px_2px_color-mix(in_oklab,var(--foreground)_5%,transparent)]"
          : "border-b border-border hover:bg-secondary",
        focusRing,
      )}
    >
      <span className="relative col-start-1 row-span-2 grid size-[30px] place-items-center rounded-md bg-secondary text-secondary-foreground sm:col-auto sm:row-span-1 sm:size-8">
        <ModIcon mod={mod} />
        {selected ? (
          <span
            aria-hidden="true"
            className="absolute -top-[3px] -right-[3px] grid size-[15px] place-items-center rounded-sm bg-foreground text-background sm:hidden"
          >
            <Check className="size-[10px]" />
          </span>
        ) : null}
      </span>

      <span className="col-start-2 row-start-1 flex min-w-0 items-baseline gap-1.5 sm:col-auto sm:row-start-auto">
        <span className="truncate text-[13px] font-semibold tracking-[-0.006em]">{mod.title}</span>
        <span className="hidden shrink-0 text-[11px] whitespace-nowrap xl:inline">
          · {mod.author ?? "Unknown author"}
        </span>
      </span>

      <span className="col-start-2 row-start-2 min-w-0 truncate text-[11.5px] sm:col-auto sm:row-auto sm:text-[12.5px]">
        {mod.description}
      </span>

      <span className="hidden min-w-0 items-center gap-1 overflow-hidden xl:flex">
        {mod.categories.slice(0, 2).map((category) => (
          <span key={category} className={badgeClass}>
            {CATEGORY_LABELS.get(category) ?? category}
          </span>
        ))}
      </span>

      <span className="hidden min-w-0 items-center gap-1 sm:flex">
        <span className="inline-flex h-5 items-center rounded-sm border border-border px-1.5 text-[11px] whitespace-nowrap text-foreground">
          {environmentLabel(mod.clientSide, mod.serverSide)}
        </span>
      </span>

      <span className="hidden text-[11.5px] whitespace-nowrap tracking-[-0.003em] tabular-nums lg:block">
        {mod.latestVersion === null ? (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Latest version not listed</span>
          </>
        ) : (
          versionLabel(mod.latestVersion)
        )}
      </span>

      <span
        title={mod.downloads === null ? "Downloads not listed" : `${formatTotal(mod.downloads)} downloads`}
        className="col-start-3 row-span-2 inline-flex items-center justify-end gap-1 self-center text-[12px] whitespace-nowrap tabular-nums sm:col-auto sm:row-span-1 sm:self-auto"
      >
        <Download className="size-3 shrink-0" aria-hidden="true" />
        <span aria-hidden="true">{formatCount(mod.downloads)}</span>
        <span className="sr-only">
          {mod.downloads === null ? "Downloads not listed" : `${formatTotal(mod.downloads)} downloads`}
        </span>
      </span>

      <span className="hidden items-center justify-end gap-[5px] text-[11.5px] font-semibold whitespace-nowrap sm:flex">
        {selected ? (
          <>
            <Check className="size-3.5 shrink-0" aria-hidden="true" />
            <span>Selected</span>
          </>
        ) : null}
      </span>
    </button>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading mods">
      <p className="sr-only">Loading mods…</p>
      <div aria-hidden="true" className="flex flex-col">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="grid h-[52px] grid-cols-[32px_120px_minmax(0,1fr)_54px_64px] items-center gap-3 border-b border-border"
          >
            <span className="size-8 rounded-md bg-secondary" />
            <span className="h-[9px] rounded-sm bg-secondary" />
            <span className="h-[9px] w-2/3 rounded-sm bg-secondary" />
            <span className="h-[9px] w-2/3 rounded-sm bg-secondary" />
            <span className="h-[9px] w-2/5 rounded-sm bg-secondary" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div role="status" className="flex min-h-[230px] flex-col items-center justify-center px-6 py-9 text-center">
      <span className="mb-3.5 grid size-10 place-items-center rounded-lg bg-secondary text-secondary-foreground" aria-hidden="true">
        <SearchX className="size-[19px]" />
      </span>
      <h3 className="mb-1 text-[15px] font-semibold tracking-[-0.008em]">No mods match these filters</h3>
      <p className="mb-3.5 max-w-[36ch] text-[12.5px] leading-relaxed">
        Try a different author, remove a category, or search for another name. The version and loader
        stay fixed.
      </p>
      <Button type="button" variant="secondary" onClick={onClear} className={secondaryButton}>
        <X className="size-3.5" aria-hidden="true" />
        Clear filters
      </Button>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex min-h-[230px] flex-col items-center justify-center px-6 py-9 text-center">
      <span
        className="mb-3.5 grid size-10 place-items-center rounded-lg border border-border bg-card text-destructive"
        aria-hidden="true"
      >
        <TriangleAlert className="size-[19px]" />
      </span>
      <h3 className="mb-1 text-[15px] font-semibold tracking-[-0.008em]">The mod catalog is unavailable.</h3>
      <p className="mb-3.5 max-w-[36ch] text-[12.5px] leading-relaxed">
        The catalog response could not be read. The results you already have are unchanged.
      </p>
      <Button type="button" variant="secondary" onClick={onRetry} className={secondaryButton}>
        <RefreshCw className="size-3.5" aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}

export function ModBrowser({ gameVersion, loader }: { gameVersion: string; loader: ModLoader }) {
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [environment, setEnvironment] = useState<ModEnvironment | null>(null);
  const [authorDraft, setAuthorDraft] = useState("");
  const [author, setAuthor] = useState<string | null>(null);
  const [sort, setSort] = useState<ModSort>("relevance");
  const [showAll, setShowAll] = useState(false);

  const [mods, setMods] = useState<ModSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<LoadState>("loading");
  const [retryToken, setRetryToken] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);

  const [selected, setSelected] = useState<ModSummary | null>(null);
  const [footerStatus, setFooterStatus] = useState<string | null>(null);

  const [dark, setDark] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDialogElement>(null);

  const activeCount =
    categories.length + (environment === null ? 0 : 1) + (author === null ? 0 : 1) + (query.trim() === "" ? 0 : 1);

  const search = useMemo<ModSearch>(
    () => ({
      query,
      gameVersion,
      loader,
      offset: 0,
      sort,
      categories,
      environment,
      author,
    }),
    [query, gameVersion, loader, sort, categories, environment, author],
  );
  const requestKey = useMemo(() => serializeModSearch(search).toString(), [search]);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setLoadMoreFailed(false);

    const run = async () => {
      try {
        const response = await fetch(`/api/mods?${requestKey}`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const body: unknown = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        const page = parseModPage(body);
        if (!response.ok || page === null) {
          setState("error");
          return;
        }
        setMods(page.hits);
        setTotal(page.total);
        setOffset(page.offset);
        setState("ready");
      } catch {
        if (controller.signal.aborted) return;
        setState("error");
      }
    };

    void run();
    return () => controller.abort();
  }, [requestKey, retryToken]);

  useEffect(() => {
    const dialog = sheetRef.current;
    if (!dialog) return;
    if (sheetOpen && !dialog.open) dialog.showModal();
    if (!sheetOpen && dialog.open) dialog.close();
  }, [sheetOpen]);

  // The sheet is the rail for small screens; widening the viewport brings the
  // rail back, so the modal must leave the top layer instead of trapping focus.
  useEffect(() => {
    if (!sheetOpen) return;
    const desktop = window.matchMedia("(min-width: 64rem)");
    const close = () => {
      if (desktop.matches) setSheetOpen(false);
    };
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, [sheetOpen]);

  const clearFilters = useCallback(() => {
    setQuery("");
    setCategories([]);
    setEnvironment(null);
    setAuthorDraft("");
    setAuthor(null);
    setFooterStatus(null);
  }, []);

  const toggleCategory = useCallback((id: string) => {
    setCategories((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }, []);

  const toggleEnvironment = useCallback((value: ModEnvironment) => {
    setEnvironment((current) => (current === value ? null : value));
  }, []);

  const commitAuthor = useCallback(() => {
    const next = authorDraft.trim();
    setAuthor(next === "" ? null : next);
  }, [authorDraft]);

  const loadMore = useCallback(async () => {
    const next = nextOffset(offset);
    if (next === null || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreFailed(false);
    try {
      const params = serializeModSearch({ ...search, offset: next });
      const response = await fetch(`/api/mods?${params.toString()}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const page = parseModPage(await response.json().catch(() => null));
      if (!response.ok || page === null) {
        setLoadMoreFailed(true);
        return;
      }
      setMods((current) => [...current, ...page.hits]);
      setTotal(page.total);
      setOffset(page.offset);
    } catch {
      setLoadMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }, [offset, search, loadingMore]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  const countLabel = `${selected === null ? 0 : 1} ${selected === null ? "mods" : "mod"} selected`;
  const canLoadMore = state === "ready" && hasMore(offset, mods.length, total);
  const loaderLabel = MOD_LOADER_LABELS[loader];

  const facade = {
    query,
    onQuery: setQuery,
    categories,
    onCategory: toggleCategory,
    environment,
    onEnvironment: toggleEnvironment,
    authorDraft,
    onAuthorDraft: setAuthorDraft,
    onAuthorCommit: commitAuthor,
    showAll,
    onShowAll: () => setShowAll((current) => !current),
    onClear: clearFilters,
  };

  return (
    <div className="grid h-dvh min-h-[560px] grid-cols-1 overflow-hidden bg-background text-foreground dark:[color-scheme:dark] lg:grid-cols-[264px_minmax(0,1fr)]">
      <a
        href="#mod-results"
        className="fixed top-3 left-3 z-50 -translate-y-[160%] rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] font-semibold text-card-foreground focus-visible:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Skip to results
      </a>

      <aside
        aria-labelledby="filters-title"
        className="hidden min-h-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex"
      >
        <div className="flex h-[60px] flex-none items-center gap-2.5 border-b border-sidebar-border px-5">
          <BrandMark className="size-[22px] shrink-0 text-sidebar-foreground" />
          <span className="text-[13px] font-semibold tracking-[-0.006em]">Modpack Creator</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pt-3.5 pb-6 [scrollbar-width:thin]">
          <Facets idPrefix="rail" {...facade} />
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-col bg-background">
        <header className="flex h-16 flex-none items-center gap-2 border-b border-border px-4 sm:px-5 lg:h-[60px] lg:px-7">
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="truncate text-[19px] leading-tight font-semibold tracking-[-0.02em] lg:text-[20px]">
              Add mods
            </h1>
            <p className="flex items-center gap-1.5 text-[10.5px] leading-tight lg:hidden">
              <Lock className="size-[11px] shrink-0" aria-hidden="true" />
              <span className="truncate">
                Minecraft {gameVersion} · {loaderLabel}
              </span>
            </p>
          </div>

          <div
            role="group"
            aria-label="Locked search context"
            className="hidden items-center gap-1.5 lg:flex"
          >
            <span className={chipClass}>
              <Lock className="size-[11px] shrink-0" aria-hidden="true" />
              Minecraft {gameVersion}
            </span>
            <span className={chipClass}>
              <Lock className="size-[11px] shrink-0" aria-hidden="true" />
              {loaderLabel}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            className={cn(
              "inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 text-[12.5px] font-semibold text-card-foreground hover:bg-muted lg:hidden",
              focusRing,
            )}
          >
            <Filter className="size-[15px]" aria-hidden="true" />
            Filters
            {activeCount > 0 ? (
              <span className="inline-grid h-[17px] min-w-[17px] place-items-center rounded-sm bg-secondary px-1 text-[10.5px] font-semibold tabular-nums text-secondary-foreground">
                {activeCount}
              </span>
            ) : null}
            <span className="sr-only">
              {activeCount > 0 ? `${activeCount} active ${activeCount === 1 ? "filter" : "filters"}` : ""}
            </span>
          </button>

          <button
            type="button"
            aria-pressed={dark}
            aria-label="Dark theme"
            onClick={toggleTheme}
            className={cn(
              "inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-md bg-secondary px-2.5 text-[12px] font-semibold text-secondary-foreground transition-colors hover:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_5%)] motion-reduce:transition-none",
              focusRing,
            )}
          >
            {dark ? <Moon className="size-3.5" aria-hidden="true" /> : <Sun className="size-3.5" aria-hidden="true" />}
            <span className="hidden sm:inline">Theme</span>
          </button>
        </header>

        <div className="flex-none border-b border-border px-4 py-2.5 sm:px-5 lg:hidden">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-[15px] -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              name="query"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search mods…"
              autoComplete="off"
              spellCheck={false}
              maxLength={MOD_QUERY_LIMIT}
              aria-label="Search mods"
              className={cn(fieldClass, "h-[38px] pl-8")}
            />
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col px-4 sm:px-5 lg:px-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[18px] bg-gradient-to-b from-transparent to-background"
          />
          <div
            id="mod-results"
            tabIndex={-1}
            aria-busy={state === "loading"}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] focus-visible:outline-none"
          >
            <div className="sticky top-0 z-20 flex h-11 items-center justify-between gap-4 border-b border-border bg-background sm:h-[46px]">
              <h2 className="sr-only">Results</h2>
              <p aria-live="polite" className="text-[13.5px] tracking-[-0.004em]">
                {state === "ready" ? (
                  <>
                    <strong className="font-semibold tabular-nums">{formatTotal(total)}</strong> results
                    <span className="hidden text-[11.5px] sm:inline"> · {MOD_PAGE_SIZE} per page</span>
                  </>
                ) : state === "error" ? (
                  "Results unavailable"
                ) : (
                  "Searching mods…"
                )}
              </p>
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="hidden text-[11.5px] sm:inline">
                  Sort
                </span>
                <div className="relative">
                  <ArrowUpDown
                    className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-card-foreground"
                    aria-hidden="true"
                  />
                  <select
                    aria-label="Sort by"
                    value={sort}
                    onChange={(event) => setSort(event.target.value as ModSort)}
                    className={cn(
                      "h-[34px] appearance-none rounded-lg border border-input bg-card pr-[30px] pl-[30px] text-[12.5px] text-card-foreground hover:bg-muted",
                      focusRing,
                    )}
                  >
                    {MOD_SORTS.map((value) => (
                      <option key={value} value={value}>
                        {MOD_SORT_LABELS[value]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute top-1/2 right-2 size-[13px] -translate-y-1/2 text-card-foreground"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </div>

            {state === "loading" && mods.length === 0 ? <Skeleton /> : null}
            {state === "error" ? <ErrorState onRetry={() => setRetryToken((value) => value + 1)} /> : null}
            {state === "ready" && mods.length === 0 ? <EmptyState onClear={clearFilters} /> : null}

            {state !== "error" && mods.length > 0 ? (
              <>
                <ul aria-label="Mod results" className="m-0 list-none p-0">
                  {mods.map((mod) => (
                    <li key={mod.projectId}>
                      <ModRow
                        mod={mod}
                        selected={selected?.projectId === mod.projectId}
                        onSelect={() => {
                          setFooterStatus(null);
                          setSelected((current) =>
                            current?.projectId === mod.projectId ? null : mod,
                          );
                        }}
                      />
                    </li>
                  ))}
                </ul>

                <div className="flex flex-col items-center gap-2.5 px-6 py-6 text-center">
                  <p className="text-[12.5px] tabular-nums">
                    Showing <strong className="font-semibold">{formatTotal(mods.length)}</strong> of{" "}
                    <strong className="font-semibold">{formatTotal(total)}</strong>
                  </p>
                  {loadMoreFailed ? (
                    <p role="alert" className="text-[12px] text-destructive">
                      Could not load more mods.
                    </p>
                  ) : null}
                  {canLoadMore ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void loadMore()}
                      disabled={loadingMore}
                      className={secondaryButton}
                    >
                      {loadingMore ? "Loading…" : "Load more"}
                    </Button>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </div>

        <footer className="relative z-20 flex h-[72px] flex-none items-center gap-2.5 border-t border-border bg-card px-4 text-card-foreground shadow-[0_-18px_40px_-34px_color-mix(in_oklab,var(--foreground)_55%,transparent)] sm:h-[76px] sm:gap-3 sm:px-5 lg:px-7">
          <div className="flex min-w-0 items-center gap-2.5">
            {selected ? (
              <span className="hidden size-8 shrink-0 place-items-center rounded-md bg-secondary text-secondary-foreground sm:grid">
                <ModIcon mod={selected} />
              </span>
            ) : null}
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-semibold tracking-[-0.006em]">
                {selected === null ? "No mod selected" : selected.title}
              </span>
              <span className="truncate text-[12px]">
                {selected === null ? (
                  <span className="text-muted-foreground">Choose a result to add it to the pack.</span>
                ) : (
                  <>
                    <span className="hidden sm:inline">{selectionMeta(selected)}</span>
                    <span className="sm:hidden" aria-hidden="true">
                      {countLabel}
                    </span>
                  </>
                )}
              </span>
            </span>
          </div>

          {selected ? (
            <button
              type="button"
              aria-label="Clear selection"
              onClick={() => {
                setSelected(null);
                setFooterStatus(null);
              }}
              className={cn(
                "hidden size-7 shrink-0 place-items-center rounded-md text-foreground hover:bg-muted sm:grid",
                focusRing,
              )}
            >
              <X className="size-[13px]" aria-hidden="true" />
            </button>
          ) : null}

          <span
            role="status"
            className="sr-only sm:not-sr-only sm:ml-auto sm:inline-flex sm:h-6 sm:items-center sm:rounded-sm sm:bg-secondary sm:px-2 sm:text-[11.5px] sm:whitespace-nowrap sm:tabular-nums sm:text-muted-foreground"
          >
            {footerStatus ?? countLabel}
          </span>

          <Button
            type="button"
            disabled={selected === null}
            onClick={() => setFooterStatus("Pack editing is not connected yet.")}
            className="ml-auto h-10 shrink-0 gap-[7px] rounded-lg px-[17px] text-[13.5px] font-semibold disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 sm:ml-0"
          >
            <Plus className="size-[15px]" aria-hidden="true" />
            Add to pack
          </Button>
        </footer>
      </main>

      <dialog
        ref={sheetRef}
        aria-labelledby="filter-sheet-title"
        onClose={() => setSheetOpen(false)}
        onCancel={() => setSheetOpen(false)}
        className={cn(
          "fixed inset-x-0 bottom-0 top-auto m-0 max-h-[82dvh] w-full max-w-none overflow-hidden rounded-t-[14px] border border-b-0 border-border bg-card p-0 text-card-foreground shadow-[0_-30px_60px_-30px_color-mix(in_oklab,var(--foreground)_45%,transparent)]",
          "[&::backdrop]:bg-[color-mix(in_oklab,var(--foreground)_34%,transparent)] dark:[&::backdrop]:bg-[color-mix(in_oklab,var(--background)_78%,transparent)]",
          "lg:hidden",
        )}
      >
        <div className="flex max-h-[82dvh] flex-col">
          <div className="flex flex-none items-center justify-between gap-2.5 px-4 pt-3 pb-3.5">
            <h2 id="filter-sheet-title" className="text-[20px] leading-tight font-semibold tracking-[-0.018em]">
              Filters
            </h2>
            <button
              type="button"
              aria-label="Close filters"
              onClick={() => setSheetOpen(false)}
              className={cn("grid size-8 place-items-center rounded-md hover:bg-muted", focusRing)}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 [--facet-active:var(--secondary)] [--facet-divider:var(--border)] [--facet-hover:var(--secondary)]">
            <div className="flex flex-wrap items-center gap-1.5 pb-3.5">
              <p className="mr-1 text-[11px] font-semibold">Locked to</p>
              <span className={chipClass}>
                <Lock className="size-[11px] shrink-0" aria-hidden="true" />
                Minecraft {gameVersion}
              </span>
              <span className={chipClass}>
                <Lock className="size-[11px] shrink-0" aria-hidden="true" />
                {loaderLabel}
              </span>
            </div>
            <Facets idPrefix="sheet" withHead={false} {...facade} />
          </div>

          <div className="flex flex-none items-center gap-2.5 border-t border-border px-4 pt-2.5 pb-6">
            <Button type="button" variant="ghost" onClick={clearFilters} className={secondaryButton}>
              Clear all
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSheetOpen(false)}
              className="h-[38px] flex-1 gap-1.5 rounded-lg px-3.5 text-[12.5px] font-semibold"
            >
              {state === "ready" ? `Show ${formatTotal(total)} mods` : "Show results"}
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
