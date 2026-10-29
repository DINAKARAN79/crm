"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowRight, User, CheckSquare, Loader2 } from "lucide-react";
import { searchApi } from "@/lib/api";

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: string;
  href: string;
}

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const requestIdRef = React.useRef(0);
  const debounceRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const executeSearch = async (searchQuery: string) => {
    const requestId = ++requestIdRef.current;

    setIsLoading(true);
    try {
      const response = await searchApi.quick(searchQuery);
      if (requestId !== requestIdRef.current) return;
      const data = response.data?.data;
      const flattened: SearchResult[] = [];

      if (data?.leads) {
        data.leads.forEach((item: any) => {
          flattened.push({
            id: item.id,
            title: `${item.firstName || ""} ${item.lastName || ""}`.trim() || "Untitled Lead",
            subtitle: `Lead${item.status ? ` - ${item.status}` : ""}`,
            type: "lead",
            href: `/leads/${item.id}`,
          });
        });
      }
      if (data?.tasks) {
        data.tasks.forEach((item: any) => {
          flattened.push({
            id: item.id,
            title: item.title || "Untitled Task",
            subtitle: `Task - ${item.status || "Unknown"}${item.priority ? ` (${item.priority})` : ""}`,
            type: "task",
            href: `/follow-ups/${item.id}`,
          });
        });
      }

      if (requestId === requestIdRef.current) {
        setResults(flattened);
      }
    } catch (error: any) {
      if (requestId === requestIdRef.current && error?.name !== "AbortError") {
        console.error("Search failed:", error);
        setResults([]);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleSearch = (searchQuery: string) => {
    setQuery(searchQuery);

    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (searchQuery.length < 2) {
      requestIdRef.current += 1;
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      void executeSearch(searchQuery);
    }, 300);
  };

  const handleSelect = (href: string) => {
    router.push(href);
    onOpenChange(false);
    setQuery("");
    setResults([]);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "lead":
        return <User className="h-4 w-4" />;
      case "task":
        return <CheckSquare className="h-4 w-4" />;
      default:
        return <CheckSquare className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "lead":
        return "bg-blue-100 text-blue-800";
      case "task":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="sr-only">Search</DialogTitle>
        </DialogHeader>
        <div className="relative p-4 pt-0">
          <Search className="absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search leads and tasks..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 h-9"
            autoFocus
          />
        </div>
        {isLoading && (
          <div className="px-4 pb-4">
            <div className="flex items-center justify-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Searching...</span>
            </div>
          </div>
        )}
        {!isLoading && results.length > 0 && (
          <div className="max-h-[400px] overflow-y-auto px-4 pb-4">
            <div className="space-y-1">
              {results.map((result) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleSelect(result.href)}
                  className="flex w-full items-center justify-between rounded-lg p-3 text-left hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-md", getTypeColor(result.type))}>
                      {getIcon(result.type)}
                    </div>
                    <div>
                      <p className="font-medium">{result.title}</p>
                      <p className="text-sm text-muted-foreground">{result.subtitle}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}
        {!isLoading && query.length >= 2 && results.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-muted-foreground">No results found for &quot;{query}&quot;</p>
          </div>
        )}
        <div className="border-t p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs">⌘K</Badge>
                Open
              </span>
              <span className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs">↑↓</Badge>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs">↵</Badge>
                Select
              </span>
            </div>
            <span className="flex items-center gap-1">
              <Badge variant="outline" className="text-xs">Esc</Badge>
              Close
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
