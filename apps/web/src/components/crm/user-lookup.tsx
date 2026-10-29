"use client";

import * as React from "react";
import { Search, UserRound, X } from "lucide-react";
import { userApi } from "@/lib/api";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

export interface LookupUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  profile?: { name?: string | null } | null;
  isActive?: boolean;
}

interface UserLookupProps {
  id: string;
  users: LookupUser[];
  value: string;
  onChange: (userId: string) => void;
  excludedUserIds?: string[];
  placeholder?: string;
  selectedUser?: LookupUser | null;
  ariaLabel?: string;
  localSearch?: boolean;
}

export function UserLookup({
  id,
  users,
  value,
  onChange,
  excludedUserIds = [],
  placeholder = "Search users...",
  selectedUser: selectedUserFallback,
  ariaLabel,
  localSearch = false,
}: UserLookupProps) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [recentUsers, setRecentUsers] = React.useState<LookupUser[]>([]);
  const [matches, setMatches] = React.useState<LookupUser[]>([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchFailed, setSearchFailed] = React.useState(false);
  const selectedUser = users.find((user) => user.id === value)
    || recentUsers.find((user) => user.id === value)
    || matches.find((user) => user.id === value)
    || (selectedUserFallback?.id === value ? selectedUserFallback : undefined);
  const normalizedQuery = query.trim().toLowerCase();
  const excludedUserIdsKey = excludedUserIds.join("|");
  const searchableText = (user: LookupUser) =>
    `${user.firstName} ${user.lastName} ${user.email} ${user.profile?.name || ""}`.toLowerCase();

  React.useEffect(() => {
    if (localSearch) {
      setMatches([]);
      setSearchFailed(false);
      setSearchLoading(false);
      return;
    }
    if (!open || !normalizedQuery) {
      setMatches([]);
      setSearchFailed(false);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchFailed(false);
      try {
        const response = await userApi.list({ search: query.trim(), isActive: true, limit: 100 });
        const excluded = new Set(excludedUserIdsKey.split("|").filter(Boolean));
        if (!cancelled) setMatches((response.data.data || []).filter((user: LookupUser) => user.isActive && !excluded.has(user.id)));
      } catch {
        if (!cancelled) {
          setMatches([]);
          setSearchFailed(true);
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [excludedUserIdsKey, localSearch, normalizedQuery, open, query]);

  const visibleUsers = normalizedQuery
    ? localSearch
      ? users.filter((user) => searchableText(user).includes(normalizedQuery) && !excludedUserIds.includes(user.id))
      : matches
    : (recentUsers.length ? recentUsers : users).filter((user) => !excludedUserIds.includes(user.id));

  const selectUser = (user: LookupUser) => {
    onChange(user.id);
    setRecentUsers((current) => [user, ...current.filter((recentUser) => recentUser.id !== user.id)].slice(0, 5));
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative min-w-0">
          <div className="flex min-h-10 items-center gap-2 rounded-md border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
            {selectedUser && <span className="inline-flex min-w-0 items-center gap-2 rounded-md bg-muted px-2 py-1 text-sm">
              <UserRound className="h-4 w-4 shrink-0 text-primary" />
              <span className="max-w-[180px] truncate">{selectedUser.firstName} {selectedUser.lastName}</span>
              <button type="button" aria-label="Clear selected user" className="text-muted-foreground hover:text-foreground" onClick={() => { onChange(""); setQuery(""); }}><X className="h-4 w-4" /></button>
            </span>}
            <input
              id={id}
              aria-label={ariaLabel}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={`${id}-options`}
              autoComplete="off"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder={selectedUser ? "" : placeholder}
              value={query}
              onFocus={() => setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 120)}
              onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
            />
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent
        id={`${id}-options`}
        role="listbox"
        align="start"
        side="bottom"
        avoidCollisions={false}
        sideOffset={4}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className={`z-[60] w-[var(--radix-popover-trigger-width)] overflow-y-auto overscroll-contain rounded-xl border border-sky-200 bg-popover p-2 text-popover-foreground shadow-md [scrollbar-color:#7dd3fc_transparent] [scrollbar-width:thin] ${
          normalizedQuery && visibleUsers.length >= 3
            ? "max-h-[min(22rem,55vh)] min-h-[min(15rem,50vh)]"
            : "max-h-[min(22rem,55vh)]"
        }`}
      >
        {normalizedQuery
          ? searchLoading
            ? <p className="px-2 py-2 text-sm text-muted-foreground">Searching users...</p>
            : searchFailed
              ? <p className="px-2 py-2 text-sm text-destructive">Search failed. Try again.</p>
              : visibleUsers.length
                ? visibleUsers.map((user) => <UserLookupOption key={user.id} user={user} onSelect={selectUser} />)
                : <p className="px-2 py-2 text-sm text-muted-foreground">No users found.</p>
          : <>
              <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Recent Items</p>
              {visibleUsers.length ? visibleUsers.map((user) => <UserLookupOption key={user.id} user={user} onSelect={selectUser} />) : <p className="px-2 py-2 text-sm text-muted-foreground">No users available.</p>}
            </>}
      </PopoverContent>
    </Popover>
  );
}

function UserLookupOption({ user, onSelect }: { user: LookupUser; onSelect: (user: LookupUser) => void }) {
  return <button type="button" role="option" aria-selected="false"   className="flex w-full items-center gap-4 rounded-lg px-3 py-3 text-left hover:bg-sky-50" onPointerDown={(event) => event.preventDefault()} onClick={() => onSelect(user)}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white"><UserRound className="h-6 w-6" /></span>
      <span className="min-w-0"><span className="block truncate text-base font-semibold text-[#075d91]">{user.firstName} {user.lastName}</span><span className="block truncate text-sm text-[#1479a8]">{user.email}</span>{user.profile?.name && <span className="block truncate text-xs text-muted-foreground">{user.profile.name}</span>}</span>
  </button>;
}
