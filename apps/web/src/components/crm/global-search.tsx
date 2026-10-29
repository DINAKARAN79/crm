"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, Loader2, Search, User, CheckSquare, X } from "lucide-react";
import { searchApi } from "@/lib/api";

type SearchCategory = "all" | "leads" | "tasks";

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: Exclude<SearchCategory, "all">;
  href: string;
}

interface QuickSearchItem {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  status?: string | null;
  statusLabel?: string | null;
  title?: string | null;
  priority?: string | null;
  url?: string;
}

interface QuickSearchData {
  leads?: QuickSearchItem[];
  tasks?: QuickSearchItem[];
}

const categories: Array<{ value: SearchCategory; label: string }> = [
  { value: "all", label: "All" },
  { value: "leads", label: "Leads" },
  { value: "tasks", label: "Follow-ups" },
];

function flattenResults(data: QuickSearchData | undefined): SearchResult[] {
  return [
    ...(data?.leads || []).map((item) => ({
      id: item.id,
      title: `${item.firstName || ""} ${item.lastName || ""}`.trim() || "Untitled Lead",
      subtitle: `Lead - ${item.statusLabel || item.status || "Incoming"}`,
      type: "leads" as const,
      href: item.url || `/leads/${item.id}`,
    })),
    ...(data?.tasks || []).map((item) => ({
      id: item.id,
      title: item.title || "Untitled Task",
      subtitle: `Task - ${item.status || "Unknown"}${item.priority ? ` (${item.priority})` : ""}`,
      type: "tasks" as const,
      href: item.url || `/follow-ups/${item.id}`,
    })),
  ];
}

export function GlobalSearch() {
  const router = useRouter();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const requestIdRef = React.useRef(0);
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<SearchCategory>("all");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, []);

  React.useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      requestIdRef.current += 1;
      setResults([]);
      setIsLoading(false);
      setHasError(false);
      setActiveIndex(-1);
      return;
    }

    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setHasError(false);
      try {
        const response = await searchApi.quick(trimmedQuery);
        if (requestId !== requestIdRef.current) return;
        setResults(flattenResults(response.data?.data as QuickSearchData | undefined));
        setActiveIndex(-1);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        console.error("Global search failed:", error);
        setResults([]);
        setHasError(true);
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  const visibleResults = category === "all"
    ? results
    : results.filter((result) => result.type === category);

  const selectResult = (result: SearchResult) => {
    setQuery("");
    setResults([]);
    setActiveIndex(-1);
    setIsOpen(false);
    router.push(result.href);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }
    if (event.key === "ArrowDown" && visibleResults.length) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => (index + 1) % visibleResults.length);
    } else if (event.key === "ArrowUp" && visibleResults.length) {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? visibleResults.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0 && visibleResults[activeIndex]) {
      event.preventDefault();
      selectResult(visibleResults[activeIndex]);
    }
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
    setHasError(false);
    setIsOpen(true);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex h-10 w-full items-center rounded-md border border-slate-200 bg-white shadow-sm transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
        <div className="relative h-full shrink-0">
          <select
            aria-label="Search category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value as SearchCategory);
              setIsOpen(true);
              setActiveIndex(-1);
            }}
            className="h-full w-[4.75rem] shrink-0 cursor-pointer appearance-none rounded-l-md bg-transparent pl-3 pr-7 text-[13px] font-medium text-slate-700 outline-none"
          >
            {categories.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
        </div>
        <span aria-hidden="true" className="h-6 w-px shrink-0 bg-slate-200" />
        <Search aria-hidden="true" className="ml-3 h-4 w-4 shrink-0 text-slate-500" />
        <input
          type="text"
          role="combobox"
          aria-label="Search CRM records"
          aria-expanded={isOpen && query.trim().length >= 2}
          aria-controls="global-search-results"
          aria-activedescendant={activeIndex >= 0 ? `global-search-result-${activeIndex}` : undefined}
          autoComplete="off"
          placeholder="Search..."
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-[13px] text-slate-800 outline-none placeholder:text-slate-400"
        />
        {isLoading ? (
          <Loader2 aria-label="Searching" className="mr-3 h-4 w-4 shrink-0 animate-spin text-slate-400" />
        ) : query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={clearSearch}
            className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {isOpen && query.trim().length >= 2 && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </div>
          ) : hasError ? (
            <p role="status" className="px-3 py-4 text-sm text-red-600">Search failed. Please try again.</p>
          ) : visibleResults.length ? (
            visibleResults.map((result, index) => {
              const Icon = result.type === "leads" ? User : CheckSquare;
              return (
                <button
                  key={`${result.type}-${result.id}`}
                  id={`global-search-result-${index}`}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectResult(result)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left transition-colors ${
                    activeIndex === index ? "bg-blue-50" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-slate-800">{result.title}</span>
                      <span className="block truncate text-xs text-slate-500">{result.subtitle}</span>
                    </span>
                  </span>
                  <ArrowRight className="ml-3 h-4 w-4 shrink-0 text-slate-400" />
                </button>
              );
            })
          ) : (
            <p className="px-3 py-4 text-sm text-slate-500">
              {results.length ? "No results in this category." : `No results found for "${query.trim()}".`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
