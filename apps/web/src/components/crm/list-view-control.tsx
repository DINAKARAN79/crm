"use client";

import * as React from "react";
import { ChevronDown, Pin, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { parseFilterLogic } from "@dct-crm/shared";
import { listViewApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

export type ListModule = "LEAD" | "FOLLOW_UP" | "SITE_VISIT" | "BOOKING" | "PROJECT" | "UNIT" | "MIS_APPROVAL";
type Operator = "equals" | "not_equals" | "contains" | "not_contains" | "starts_with" | "greater_than" | "less_than" | "is_empty" | "is_not_empty" | "in" | "not_in" | "between" | "today" | "this_week" | "this_month" | "last_30_days";
type OwnerFilter = "ALL" | "MINE" | "SELECTED";
type FilterRule = { id?: number; field: string; operator: Operator; value?: string };
type FilterSet = { logic: "AND" | "OR"; rules: FilterRule[]; version?: 2; ownerFilter?: OwnerFilter; ownerUserIds?: string[]; filterLogic?: string | null };
type LeadRow = { field: string; operator: Operator; value: string };
type FieldDef = { key: string; label: string; kind: string; operators: Operator[]; options?: { value: string; label: string }[] };
type ListView = {
  key: string;
  name: string;
  apiName: string;
  system: boolean;
  visibility: "ONLY_ME" | "ALL_USERS" | "SELECTED_USERS";
  filters: FilterSet;
  sharedUserIds: string[];
  canEdit: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  presetLabel?: string | null;
};
type Catalog = {
  views: ListView[];
  fields: FieldDef[];
  users: { id: string; name: string }[];
  selectedKey: string;
  pinnedKeys: string[];
  recentKeys: string[];
};

const emptyFilters = (): FilterSet => ({ logic: "AND", rules: [] });
const NO_VALUE = new Set<Operator>(["is_empty", "is_not_empty", "today", "this_week", "this_month", "last_30_days"]);
const operatorText = (operator: Operator, kind?: string) => {
  const labels: Record<Operator, string> = {
    equals: "equals",
    not_equals: "not equal to",
    contains: "contains",
    not_contains: "does not contain",
    starts_with: "starts with",
    greater_than: kind === "date" ? "after" : "greater than",
    less_than: kind === "date" ? "before" : "less than",
    is_empty: "is empty",
    is_not_empty: "is not empty",
    in: "in",
    not_in: "not in",
    between: "between",
    today: "today",
    this_week: "this week",
    this_month: "this month",
    last_30_days: "last 30 days",
  };
  return labels[operator];
};
const tokenLabel = (value?: string) => value === "$currentUser" ? "Current user" : value === "$today" ? "Today" : value === "$thisMonth" ? "This month" : "";
const apiNameFrom = (name: string) => {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  return (/^[a-z]/.test(slug) ? slug : `view_${slug || "list"}`).slice(0, 61);
};

export function useRecordView(module: ListModule, recordId?: string) {
  React.useEffect(() => {
    if (!recordId) return;
    void listViewApi.recordView(module, recordId).catch(() => undefined);
  }, [module, recordId]);
}

export function useListView(module: ListModule) {
  const { toast } = useToast();
  const [catalog, setCatalog] = React.useState<Catalog | null>(null);
  const [ready, setReady] = React.useState(false);
  const [selectedKey, setSelectedKey] = React.useState("");
  const [draft, setDraft] = React.useState<FilterSet>(emptyFilters());
  const [applied, setApplied] = React.useState<FilterSet>(emptyFilters());
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [menuKey, setMenuKey] = React.useState("");
  const [editor, setEditor] = React.useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = React.useState<ListView | null>(null);
  const [name, setName] = React.useState("");
  const [apiName, setApiName] = React.useState("");
  const [apiTouched, setApiTouched] = React.useState(false);
  const [visibility, setVisibility] = React.useState<"ONLY_ME" | "ALL_USERS" | "SELECTED_USERS">("ONLY_ME");
  const [sharedUserIds, setSharedUserIds] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [ownerFilter, setOwnerFilter] = React.useState<OwnerFilter>("ALL");
  const [ownerUserIds, setOwnerUserIds] = React.useState<string[]>([]);
  const [leadRows, setLeadRows] = React.useState<LeadRow[]>([]);
  const [logicOpen, setLogicOpen] = React.useState(false);
  const [filterLogic, setFilterLogic] = React.useState("");
  const [logicWarning, setLogicWarning] = React.useState("");
  const [sorting, setSorting] = React.useState<{ id: string; desc: boolean } | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  const choose = React.useCallback((data: Catalog, key: string, replaceFilters: boolean) => {
    const view = data.views.find((item) => item.key === key) || data.views[0];
    if (!view) return;
    setSelectedKey(view.key);
    setSorting(null);
    if (replaceFilters) {
      setDraft(view.filters);
      setApplied(view.filters);
    }
  }, []);

  const load = React.useCallback(async (key?: string) => {
    const response = await listViewApi.catalog(module);
    const data = response.data.data as Catalog;
    setCatalog(data);
    choose(data, key || data.selectedKey, true);
    setReady(true);
    return data;
  }, [choose, module]);

  React.useEffect(() => {
    let cancelled = false;
    void listViewApi.catalog(module).then((response) => {
      if (cancelled) return;
      const data = response.data.data as Catalog;
      setCatalog(data);
      const view = data.views.find((item) => item.key === data.selectedKey) || data.views[0];
      setSelectedKey(view?.key || "");
      setDraft(view?.filters || emptyFilters());
      setApplied(view?.filters || emptyFilters());
      setReady(true);
      if (view) void listViewApi.select(module, view.key).catch(() => undefined);
    }).catch(() => {
      if (!cancelled) setReady(true);
    });
    return () => { cancelled = true; };
  }, [module]);

  const selected = catalog?.views.find((view) => view.key === selectedKey) || null;
  const queryKey = !ready ? "" : `${selected ? `${selected.key}:${JSON.stringify(applied)}` : "all"}:${sorting ? `${sorting.id}:${sorting.desc}` : ""}:${reloadToken}`;
  const params = {
    ...(selected ? { view: selected.key, filters: JSON.stringify(applied) } : {}),
    ...(sorting ? { sortBy: sorting.id, sortOrder: sorting.desc ? "desc" : "asc" } : {}),
  };

  const selectView = async (view: ListView) => {
    setSelectedKey(view.key);
    setSorting(null);
    setDraft(view.filters);
    setApplied(view.filters);
    setOpen(false);
    setMenuKey("");
    try {
      await listViewApi.select(module, view.key);
      setCatalog((current) => current ? { ...current, recentKeys: [view.key, ...current.recentKeys.filter((key) => key !== view.key)].slice(0, 8), selectedKey: view.key } : current);
    } catch (error) {
      toast({ title: "Could not open that list view", description: messageOf(error), variant: "destructive" });
    }
  };

  const togglePin = async (view: ListView) => {
    const pinned = !catalog?.pinnedKeys.includes(view.key);
    setCatalog((current) => current ? { ...current, pinnedKeys: pinned ? [...current.pinnedKeys, view.key] : current.pinnedKeys.filter((key) => key !== view.key) } : current);
    try {
      await listViewApi.pin(module, view.key, pinned);
    } catch (error) {
      toast({ title: "Could not update the pin", description: messageOf(error), variant: "destructive" });
      void load(selectedKey);
    }
  };

  const resetLeadFilters = (filters?: FilterSet) => {
    setOwnerFilter(filters?.ownerFilter || "ALL");
    setOwnerUserIds(filters?.ownerUserIds || []);
    setLeadRows((filters?.rules || []).map((rule) => ({ field: rule.field, operator: rule.operator, value: rule.value || "" })));
    setFilterLogic(filters?.filterLogic || "");
    setLogicOpen(Boolean(filters?.filterLogic));
    setLogicWarning("");
  };

  const openCreate = () => {
    setEditing(null);
    setName("");
    setApiName("");
    setApiTouched(false);
    setVisibility("ONLY_ME");
    setSharedUserIds([]);
    resetLeadFilters();
    setEditor("create");
    setOpen(false);
  };

  const openEdit = (view: ListView) => {
    setEditing(view);
    setName(view.name);
    setApiName(view.apiName);
    setApiTouched(true);
    setVisibility(view.visibility);
    setSharedUserIds(view.sharedUserIds);
    resetLeadFilters(view.filters);
    setEditor("edit");
    setOpen(false);
  };

  const leadFilters = (): FilterSet => ({
    version: 2,
    logic: "AND",
    ownerFilter,
    ownerUserIds: ownerFilter === "SELECTED" ? ownerUserIds : [],
    rules: leadRows.map((row, index) => ({ id: index + 1, field: row.field, operator: row.operator, ...(row.value ? { value: row.value } : {}) })),
    filterLogic: logicOpen && filterLogic.trim() ? filterLogic.trim() : null,
  });
  const leadError = module === "LEAD" ? leadFormError(catalog?.fields || [], ownerFilter, ownerUserIds, leadRows, logicOpen, filterLogic) : "";

  const saveView = async () => {
    if (leadError) return;
    setSaving(true);
    try {
      const filters = module === "LEAD" ? leadFilters() : editor === "create" ? applied : editing?.filters;
      const body = { module, name, apiName, visibility, sharedUserIds, filters };
      if (editor === "create") {
        const response = await listViewApi.create(body);
        const id = (response.data.data as { id?: string } | undefined)?.id;
        await load(id);
      } else if (editing) {
        await listViewApi.update(editing.key, body);
        await load(editing.key);
      }
      setEditor(null);
    } catch (error) {
      toast({ title: "Could not save the list view", description: messageOf(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const duplicateView = async (view: ListView) => {
    try {
      const response = await listViewApi.duplicate(view.key, module);
      const id = (response.data.data as { id?: string } | undefined)?.id;
      await load(id);
      setOpen(false);
    } catch (error) {
      toast({ title: "Could not duplicate the list view", description: messageOf(error), variant: "destructive" });
    }
  };

  const deleteView = async (view: ListView) => {
    if (!window.confirm(`Delete ${view.name}?`)) return;
    try {
      await listViewApi.remove(view.key);
      await load();
      setOpen(false);
    } catch (error) {
      toast({ title: "Could not delete the list view", description: messageOf(error), variant: "destructive" });
    }
  };

  const saveFilters = async () => {
    if (!selected?.canEdit) return;
    try {
      await listViewApi.update(selected.key, {
        module,
        name: selected.name,
        apiName: selected.apiName,
        visibility: selected.visibility,
        sharedUserIds: selected.sharedUserIds,
        filters: draft,
      });
      setApplied(draft);
      setCatalog((current) => current ? { ...current, views: current.views.map((view) => view.key === selected.key ? { ...view, filters: draft } : view) } : current);
      toast({ title: "List view filters saved" });
    } catch (error) {
      toast({ title: "Could not save filters", description: messageOf(error), variant: "destructive" });
    }
  };

  const control = (
    <div className="inline-flex min-w-0 max-w-full items-center gap-3">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex h-10 max-w-full items-center gap-2 rounded-md border border-[#bae6fd] bg-white px-3 text-left text-sm font-semibold text-[#075d91] shadow-sm hover:bg-[#f5fbff] dark:border-sky-800 dark:bg-slate-950 dark:text-sky-100 dark:hover:bg-slate-900 sm:max-w-[18rem]" aria-label="List view">
          <span className="truncate">{selected?.name || "List view"}</span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="border-b border-sky-100 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-[#278db8]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search list views" className="h-8 w-full rounded-md border border-[#bae6fd] bg-white pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-[#dbeafe]" />
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          <ViewSection title="Recent List Views" views={visibleViews(catalog, "recent", search)} pinnedKeys={catalog?.pinnedKeys || []} menuKey={menuKey} onMenu={setMenuKey} onSelect={selectView} onPin={togglePin} onEdit={openEdit} onDuplicate={duplicateView} onDelete={deleteView} />
          <ViewSection title="All Other Lists" views={visibleViews(catalog, "other", search)} pinnedKeys={catalog?.pinnedKeys || []} menuKey={menuKey} onMenu={setMenuKey} onSelect={selectView} onPin={togglePin} onEdit={openEdit} onDuplicate={duplicateView} onDelete={deleteView} />
        </div>
        <div className="border-t border-sky-100 p-2">
          <button type="button" className="flex h-8 w-full items-center justify-center gap-1 rounded-md bg-[#1479a8] text-xs font-semibold text-white hover:bg-[#075d91]" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> Create List View
          </button>
        </div>
      </PopoverContent>
    </Popover>
    <button type="button" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#bae6fd] bg-white text-[#075d91] hover:bg-[#f5fbff] dark:border-sky-800 dark:bg-slate-950 dark:text-sky-100 dark:hover:bg-slate-900" aria-label="Refresh list" onClick={() => setReloadToken((value) => value + 1)}>
      <RefreshCw className="h-4 w-4" />
    </button>
    </div>
  );

  const panel = catalog ? (
    <div className="rounded-xl border border-sky-100 bg-[#f5fbff] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-[#075d91]">Filters</p>
          {selected?.presetLabel ? <p className="text-[11px] text-[#1479a8]">{selected.presetLabel}</p> : null}
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-[#1479a8]">
          Logic
          <select value={draft.logic} onChange={(event) => setDraft({ ...draft, logic: event.target.value as "AND" | "OR" })} className="h-8 rounded-md border border-[#bae6fd] bg-white px-2 text-xs text-slate-700">
            <option value="AND">AND</option>
            <option value="OR">OR</option>
          </select>
        </label>
      </div>
      <div className="space-y-2">
        {draft.rules.map((rule, index) => {
          const field = catalog.fields.find((item) => item.key === rule.field) || catalog.fields[0];
          const needsValue = rule.operator !== "is_empty" && rule.operator !== "is_not_empty";
          return (
            <div key={`${rule.field}-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
              <select value={field?.key} onChange={(event) => updateRule(setDraft, catalog, index, { field: event.target.value })} className="crm-filter-control">
                {catalog.fields.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
              <select value={rule.operator} onChange={(event) => updateRule(setDraft, catalog, index, { operator: event.target.value as Operator })} className="crm-filter-control">
                {field?.operators.map((operator) => <option key={operator} value={operator}>{operatorText(operator, field.kind)}</option>)}
              </select>
              {needsValue ? <FilterValue field={field} users={catalog.users} value={rule.value || ""} onChange={(value) => updateRule(setDraft, catalog, index, { value })} /> : <span className="crm-filter-control text-slate-400">No value</span>}
              <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#bae6fd] bg-white text-[#075d91]" aria-label="Remove filter" onClick={() => setDraft((current) => ({ ...current, rules: current.rules.filter((_, ruleIndex) => ruleIndex !== index) }))}>
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setDraft((current) => ({ ...current, rules: [...current.rules, newRule(catalog.fields)] }))}>Add Filter</Button>
        <Button type="button" size="sm" className="bg-[#1479a8] text-white hover:bg-[#075d91]" onClick={() => setApplied(draft)}>Apply Filters</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => { const original = selected?.filters || emptyFilters(); setDraft(original); setApplied(original); }}>Reset Filters</Button>
        {selected?.canEdit ? <Button type="button" variant="outline" size="sm" onClick={() => void saveFilters()}>Save filters</Button> : null}
      </div>
    </div>
  ) : null;

  const changeLeadRows = (next: LeadRow[], changed: boolean) => {
    setLeadRows(next);
    if (changed && logicOpen && filterLogic.trim()) {
      setFilterLogic("");
      setLogicOpen(false);
      setLogicWarning("Filter logic was cleared because the filters changed. The remaining filters use AND.");
    }
  };

  const dialog = (
    <Dialog open={editor !== null} onOpenChange={(next) => { if (!next) setEditor(null); }}>
      <DialogContent className={module === "LEAD" ? "crm-list-view-dialog" : "max-w-lg"}>
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle>{editor === "edit" ? "Edit List View" : "Create List View"}</DialogTitle>
          <DialogDescription className="sr-only">Name the list view, choose who can see it, and set the filters it applies.</DialogDescription>
        </DialogHeader>
        <div className={module === "LEAD" ? "crm-list-view-dialog-body space-y-4 pr-1" : "space-y-3"}>
          <label className="block text-xs font-semibold text-[#1479a8]">List View Name
            <input value={name} onChange={(event) => { setName(event.target.value); if (!apiTouched) setApiName(apiNameFrom(event.target.value)); }} className="crm-filter-control mt-1" />
          </label>
          <label className="block text-xs font-semibold text-[#1479a8]">List View API Name
            <input value={apiName} onChange={(event) => { setApiTouched(true); setApiName(event.target.value); }} className="crm-filter-control mt-1" />
          </label>
          <fieldset className="space-y-1 text-sm text-slate-700">
            <legend className="text-xs font-semibold text-[#1479a8]">Visibility</legend>
            {([["ONLY_ME", "Only Me"], ["ALL_USERS", "All Users"], ["SELECTED_USERS", "Selected Users"]] as const).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input type="radio" name={`${module}-visibility`} checked={visibility === value} onChange={() => setVisibility(value)} /> {label}
              </label>
            ))}
          </fieldset>
          {visibility === "SELECTED_USERS" ? (
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-sky-100 bg-white p-2">
              {catalog?.users.map((user) => (
                <label key={user.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={sharedUserIds.includes(user.id)} onChange={(event) => setSharedUserIds((current) => event.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id))} />
                  {user.name}
                </label>
              ))}
            </div>
          ) : null}
          {module === "LEAD" && catalog ? (
            <LeadFilterEditor
              fields={catalog.fields}
              users={catalog.users}
              ownerFilter={ownerFilter}
              ownerUserIds={ownerUserIds}
              rows={leadRows}
              logicOpen={logicOpen}
              filterLogic={filterLogic}
              logicWarning={logicWarning}
              error={leadError}
              onOwnerFilter={setOwnerFilter}
              onOwnerUsers={setOwnerUserIds}
              onRows={changeLeadRows}
              onLogicOpen={setLogicOpen}
              onLogic={setFilterLogic}
              onClearWarning={() => setLogicWarning("")}
            />
          ) : null}
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={() => setEditor(null)}>Cancel</Button>
          <Button type="button" disabled={saving || !name.trim() || Boolean(leadError)} className="bg-[#1479a8] text-white hover:bg-[#075d91]" onClick={() => void saveView()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { ready, params, queryKey, sorting, onSortingChange: setSorting, control, panel, dialog };
}

export function ListSortHeader({
  label,
  column,
  sorting,
  onSortingChange,
  className,
}: {
  label: string;
  column: string;
  sorting: { id: string; desc: boolean } | null;
  onSortingChange: (sorting: { id: string; desc: boolean } | null) => void;
  className?: string;
}) {
  const active = sorting?.id === column;
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 uppercase ${className || ""}`}
      onClick={() => onSortingChange(!active ? { id: column, desc: false } : sorting?.desc ? null : { id: column, desc: true })}
    >
      {label}
      <span aria-hidden="true">{active ? (sorting?.desc ? "↓" : "↑") : ""}</span>
    </button>
  );
}

function visibleViews(catalog: Catalog | null, section: "recent" | "other", search: string) {
  if (!catalog) return [];
  const query = search.trim().toLowerCase();
  const recent = new Set(catalog.recentKeys);
  return catalog.views.filter((view) => {
    const inRecent = recent.has(view.key);
    const matches = !query || view.name.toLowerCase().includes(query);
    return matches && (section === "recent" ? inRecent : !inRecent);
  });
}

function ViewSection({ title, views, pinnedKeys, menuKey, onMenu, onSelect, onPin, onEdit, onDuplicate, onDelete }: {
  title: string;
  views: ListView[];
  pinnedKeys: string[];
  menuKey: string;
  onMenu: (key: string) => void;
  onSelect: (view: ListView) => void;
  onPin: (view: ListView) => void;
  onEdit: (view: ListView) => void;
  onDuplicate: (view: ListView) => void;
  onDelete: (view: ListView) => void;
}) {
  if (views.length === 0) return null;
  return (
    <div className="mb-2">
      <p className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#1479a8]">{title}</p>
      {views.map((view) => (
        <div key={view.key} className="rounded-md hover:bg-white">
          <div className="flex items-center gap-1">
            <button type="button" className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-[#1479a8]" aria-label={pinnedKeys.includes(view.key) ? `Unpin ${view.name}` : `Pin ${view.name}`} onClick={() => onPin(view)}>
              <Pin className={`h-3.5 w-3.5 ${pinnedKeys.includes(view.key) ? "fill-[#1479a8]" : ""}`} />
            </button>
            <button type="button" className="min-w-0 flex-1 truncate py-1.5 text-left text-sm text-slate-700" onClick={() => onSelect(view)}>{view.name}</button>
            <button type="button" className="px-2 text-xs font-semibold text-[#1479a8]" onClick={() => onMenu(menuKey === view.key ? "" : view.key)}>···</button>
          </div>
          {menuKey === view.key ? (
            <div className="flex flex-wrap gap-2 px-9 pb-2 text-xs">
              {view.canEdit ? <button type="button" className="font-semibold text-[#075d91]" onClick={() => onEdit(view)}>Edit List View</button> : null}
              {view.canDuplicate ? <button type="button" className="font-semibold text-[#075d91]" onClick={() => onDuplicate(view)}>Duplicate</button> : null}
              {view.canDelete ? <button type="button" className="font-semibold text-rose-700" onClick={() => onDelete(view)}>Delete</button> : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function FilterValue({ field, users, value, onChange }: { field?: FieldDef; users: { id: string; name: string }[]; value: string; onChange: (value: string) => void }) {
  if (tokenLabel(value)) return <span className="crm-filter-control text-[#075d91]">{tokenLabel(value)}</span>;
  if (field?.kind === "date") return <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="crm-filter-control" />;
  if (field?.options) {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)} className="crm-filter-control">
        <option value="">Select</option>
        {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }
  if (field?.kind === "user") {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)} className="crm-filter-control">
        <option value="">Select user</option>
        {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
      </select>
    );
  }
  return <input value={value} onChange={(event) => onChange(event.target.value)} className="crm-filter-control" placeholder="Value" />;
}

function updateRule(setDraft: React.Dispatch<React.SetStateAction<FilterSet>>, catalog: Catalog, index: number, patch: Partial<FilterRule>) {
  setDraft((current) => ({
    ...current,
    rules: current.rules.map((rule, ruleIndex) => {
      if (ruleIndex !== index) return rule;
      const next = { ...rule, ...patch };
      if (patch.field) {
        const field = catalog.fields.find((item) => item.key === patch.field);
        next.operator = field?.operators[0] || "equals";
        next.value = "";
      }
      if (patch.operator === "is_empty" || patch.operator === "is_not_empty") delete next.value;
      return next;
    }),
  }));
}

function newRule(fields: FieldDef[]): FilterRule {
  const field = fields[0];
  return { field: field?.key || "", operator: field?.operators[0] || "equals", value: "" };
}

function leadFormError(fields: FieldDef[], ownerFilter: OwnerFilter, ownerUserIds: string[], rows: LeadRow[], logicOpen: boolean, filterLogic: string) {
  if (ownerFilter === "SELECTED" && ownerUserIds.length === 0) return "Choose at least one user for Filter By Owner.";
  for (const [index, row] of rows.entries()) {
    const field = fields.find((item) => item.key === row.field);
    if (!field) return "Choose a field for every filter.";
    if (!rowNeedsValue(row.operator)) continue;
    if (row.operator === "between") {
      const [start, end] = row.value.split(",");
      if (!start || !end) return `Filter ${index + 1} needs a start and end date.`;
      if (start > end) return `Filter ${index + 1} end date cannot be earlier than the start date.`;
      continue;
    }
    if (!row.value.trim()) return `Filter ${index + 1} needs a value.`;
  }
  if (logicOpen) {
    const parsed = parseFilterLogic(filterLogic, rows.map((_, index) => index + 1));
    if (!parsed.ok) return parsed.error;
  }
  return "";
}

function rowNeedsValue(operator: Operator) {
  return !NO_VALUE.has(operator);
}

function LeadFilterEditor({
  fields, users, ownerFilter, ownerUserIds, rows, logicOpen, filterLogic, logicWarning, error,
  onOwnerFilter, onOwnerUsers, onRows, onLogicOpen, onLogic, onClearWarning,
}: {
  fields: FieldDef[];
  users: { id: string; name: string }[];
  ownerFilter: OwnerFilter;
  ownerUserIds: string[];
  rows: LeadRow[];
  logicOpen: boolean;
  filterLogic: string;
  logicWarning: string;
  error: string;
  onOwnerFilter: (value: OwnerFilter) => void;
  onOwnerUsers: (ids: string[]) => void;
  onRows: (rows: LeadRow[], changed: boolean) => void;
  onLogicOpen: (open: boolean) => void;
  onLogic: (value: string) => void;
  onClearWarning: () => void;
}) {
  const updateRow = (index: number, patch: Partial<LeadRow>) => {
    onRows(rows.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, ...patch };
      if (patch.field) {
        const field = fields.find((item) => item.key === patch.field);
        next.operator = field?.operators[0] || "equals";
        next.value = "";
      }
      if (patch.operator && NO_VALUE.has(patch.operator)) next.value = "";
      return next;
    }), false);
  };
  return (
    <div className="space-y-4 border-t border-sky-100 pt-3">
      <fieldset className="space-y-1 text-sm text-slate-700">
        <legend className="text-xs font-semibold text-[#1479a8]">Filter By Owner</legend>
        {([["ALL", "All Leads"], ["MINE", "My Leads"], ["SELECTED", "Selected Users"]] as const).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input type="radio" name="lead-owner-filter" checked={ownerFilter === value} onChange={() => onOwnerFilter(value)} /> {label}
          </label>
        ))}
      </fieldset>
      {ownerFilter === "SELECTED" ? (
        <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-sky-100 bg-white p-2">
          {users.map((user) => (
            <label key={user.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={ownerUserIds.includes(user.id)} onChange={(event) => onOwnerUsers(event.target.checked ? [...ownerUserIds, user.id] : ownerUserIds.filter((id) => id !== user.id))} />
              {user.name}
            </label>
          ))}
        </div>
      ) : null}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-[#1479a8]">Filter By Additional Fields</p>
          {rows.length > 0 ? <button type="button" className="text-xs font-semibold text-[#075d91] underline" onClick={() => onRows([], true)}>Remove All</button> : null}
        </div>
        <div className="space-y-2">
          {rows.map((row, index) => {
            const field = fields.find((item) => item.key === row.field) || fields[0];
            return (
              <div key={`${row.field}-${index}`} className="rounded-md border border-sky-100 p-2 sm:grid sm:grid-cols-[1.5rem_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.15fr)_auto] sm:items-start sm:gap-2 sm:border-0 sm:p-0">
                <div className="mb-2 flex items-center justify-between sm:hidden">
                  <span className="text-xs font-semibold text-[#1479a8]">{index + 1}</span>
                  <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#bae6fd] bg-white text-[#075d91]" aria-label={`Remove filter ${index + 1}`} onClick={() => onRows(rows.filter((_, rowIndex) => rowIndex !== index), true)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <span className="hidden pt-2 text-xs font-semibold text-[#1479a8] sm:block">{index + 1}</span>
                <div className="grid gap-2 sm:contents">
                  <select aria-label={`Field ${index + 1}`} value={field?.key} onChange={(event) => updateRow(index, { field: event.target.value })} className="crm-filter-control">
                    {fields.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                  <select aria-label={`Operator ${index + 1}`} value={row.operator} onChange={(event) => updateRow(index, { operator: event.target.value as Operator })} className="crm-filter-control">
                    {field?.operators.map((operator) => <option key={operator} value={operator}>{operatorText(operator, field.kind)}</option>)}
                  </select>
                  <LeadFilterValue field={field} users={users} operator={row.operator} value={row.value} onChange={(value) => updateRow(index, { value })} />
                </div>
                <button type="button" className="hidden h-9 w-9 items-center justify-center rounded-md border border-[#bae6fd] bg-white text-[#075d91] sm:inline-flex" aria-label={`Remove filter ${index + 1}`} onClick={() => onRows(rows.filter((_, rowIndex) => rowIndex !== index), true)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
        <Button type="button" variant="outline" size="sm" className="mt-2" disabled={rows.length >= 10} onClick={() => onRows([...rows, { field: fields[0]?.key || "", operator: fields[0]?.operators[0] || "equals", value: "" }], true)}>Add Filter</Button>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold text-[#1479a8]">Filter Logic</p>
        {logicOpen ? (
          <>
            <input value={filterLogic} onChange={(event) => { onClearWarning(); onLogic(event.target.value); }} placeholder="1 AND (2 OR 3)" className="crm-filter-control font-mono" aria-label="Filter logic" />
            <button type="button" className="text-xs font-semibold text-[#075d91] underline" onClick={() => { onLogicOpen(false); onLogic(""); onClearWarning(); }}>Clear Filter Logic</button>
          </>
        ) : (
          <button type="button" className="text-xs font-semibold text-[#075d91] underline disabled:text-slate-400" disabled={rows.length === 0} onClick={() => { onLogicOpen(true); onLogic(rows.map((_, index) => index + 1).join(" AND ")); onClearWarning(); }}>Add Filter Logic</button>
        )}
        {!logicOpen ? <p className="text-[11px] text-slate-500">Filters match with AND.</p> : null}
        {logicWarning ? <p className="text-[11px] text-amber-700">{logicWarning}</p> : null}
        {error ? <p role="alert" className="text-[11px] text-rose-700">{error}</p> : null}
      </div>
    </div>
  );
}

function LeadFilterValue({ field, users, operator, value, onChange }: { field?: FieldDef; users: { id: string; name: string }[]; operator: Operator; value: string; onChange: (value: string) => void }) {
  if (!rowNeedsValue(operator)) return <span className="crm-filter-control text-slate-400">No value</span>;
  if (operator === "between") {
    const [start, end] = value.split(",");
    return (
      <div className="grid grid-cols-2 gap-1">
        <input type="date" aria-label="Start date" value={start || ""} onChange={(event) => onChange(`${event.target.value},${end || ""}`)} className="crm-filter-control" />
        <input type="date" aria-label="End date" value={end || ""} onChange={(event) => onChange(`${start || ""},${event.target.value}`)} className="crm-filter-control" />
      </div>
    );
  }
  const selected = new Set(value.split(",").map((item) => item.trim()).filter(Boolean));
  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onChange([...next].join(","));
  };
  if ((operator === "in" || operator === "not_in") && (field?.options || field?.kind === "user")) {
    const choices = field.options || users.map((user) => ({ value: user.id, label: user.name }));
    return (
      <div className="max-h-24 space-y-1 overflow-y-auto rounded-md border border-[#bae6fd] bg-white p-2">
        {choices.map((choice) => (
          <label key={choice.value} className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={selected.has(choice.value)} onChange={(event) => toggle(choice.value, event.target.checked)} />
            {choice.label}
          </label>
        ))}
      </div>
    );
  }
  if (field?.kind === "date") return <input type="date" aria-label="Value" value={value} onChange={(event) => onChange(event.target.value)} className="crm-filter-control" />;
  if (field?.options) {
    return (
      <select aria-label="Value" value={value} onChange={(event) => onChange(event.target.value)} className="crm-filter-control">
        <option value="">Select</option>
        {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }
  if (field?.kind === "user") {
    return (
      <select aria-label="Value" value={value} onChange={(event) => onChange(event.target.value)} className="crm-filter-control">
        <option value="">Select user</option>
        {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
      </select>
    );
  }
  return <input aria-label="Value" value={value} onChange={(event) => onChange(event.target.value)} className="crm-filter-control" placeholder="Value" />;
}

function messageOf(error: unknown) {
  return (error as { response?: { data?: { error?: string } } })?.response?.data?.error || "Please try again.";
}
