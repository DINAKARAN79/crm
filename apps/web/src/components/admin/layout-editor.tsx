"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  cloneLayoutDocument,
  columnItems,
  emptyLayoutDocument,
  ensureRequiredFields,
  isLockedLayoutField,
  LAYOUT_QUICK_ACTIONS,
  LAYOUT_RELATED_CATALOG,
  LAYOUT_STANDARD_BUTTONS,
  layoutApiName,
  newLayoutId,
  parseLayoutDocument,
  placeLayoutItem,
  placedFieldNames,
  removeLayoutItem,
  setSectionColumns,
  splitLargeSections,
  updateLayoutItems,
  validateLayoutDocument,
  moveLayoutSection,
  type LayoutColumn,
  type LayoutDocument,
  type LayoutItem,
  type LayoutSection,
} from "@dct-crm/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  GripVertical,
  Lock,
  Redo2,
  Save,
  Search,
  Settings,
  Trash2,
  Undo2,
  Wrench,
  X,
} from "lucide-react";

interface EditorField {
  name: string;
  label: string;
  fieldType: string;
  required?: boolean;
  editable?: boolean;
  isSystemField?: boolean;
}

interface LayoutEditorProps {
  objectName: string;
  layout: { id: string; name: string; sections: unknown };
  fields: EditorField[];
  onSave: (payload: { name: string; document: LayoutDocument }, options?: { stay?: boolean }) => Promise<void>;
  onCancel: () => void;
  onAssign: () => void;
}

type PaletteTab = "fields" | "buttons" | "links" | "actions" | "related";
type DragState =
  | { kind: "field"; fieldApiName: string }
  | { kind: "blank" }
  | { kind: "section" }
  | { kind: "button"; name: string }
  | { kind: "action"; name: string }
  | { kind: "related"; apiName: string }
  | { kind: "item"; itemId: string }
  | { kind: "move-section"; sectionId: string };

type Snapshot = { name: string; doc: LayoutDocument };

const PALETTE_TABS: { id: PaletteTab; label: string }[] = [
  { id: "fields", label: "Fields" },
  { id: "buttons", label: "Buttons" },
  { id: "links", label: "Custom Links" },
  { id: "actions", label: "Quick Actions" },
  { id: "related", label: "Related Lists" },
];

function sampleValue(field?: EditorField) {
  if (!field) return "Sample";
  if (field.fieldType === "email") return "sample@example.com";
  if (field.fieldType === "phone") return "9876543210";
  if (field.fieldType === "date" || field.fieldType === "datetime") return "28 Oct 2026";
  if (field.fieldType === "number" || field.fieldType === "integer" || field.fieldType === "decimal" || field.fieldType === "currency") return "100";
  if (field.fieldType === "checkbox" || field.fieldType === "boolean") return "Yes";
  return "Sample";
}

export default function LayoutEditor({ objectName, layout, fields, onSave, onCancel, onAssign }: LayoutEditorProps) {
  const { toast } = useToast();
  const opening = useMemo(() => {
    const parsed = parseLayoutDocument(layout.sections, layout.name || `${objectName} Layout`);
    const prepared = splitLargeSections(ensureRequiredFields(parsed, fields, objectName));
    const arranged = prepared.sections.length !== parsed.sections.length
      || [...placedFieldNames(prepared)].some((name) => !placedFieldNames(parsed).has(name));
    return { prepared, arranged };
  }, [fields, layout.name, layout.sections, objectName]);

  const [name, setName] = useState(layout.name || `${objectName} Layout`);
  const [doc, setDoc] = useState<LayoutDocument>(opening.prepared);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [saved, setSaved] = useState(() => JSON.stringify({ name: layout.name, doc: opening.arranged ? null : opening.prepared }));
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [tab, setTab] = useState<PaletteTab>("fields");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [layoutPropsOpen, setLayoutPropsOpen] = useState(false);
  const [sectionPropsId, setSectionPropsId] = useState<string | null>(null);
  const [fieldPropsId, setFieldPropsId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [previewProfileId, setPreviewProfileId] = useState("");
  const [previewPermissions, setPreviewPermissions] = useState<Record<string, { canRead: boolean; canEdit: boolean }>>({});
  const dragRef = useRef<DragState | null>(null);
  const docRef = useRef(doc);
  const nameRef = useRef(name);
  docRef.current = doc;
  nameRef.current = name;

  const fieldsByName = useMemo(() => new Map(fields.map((field) => [field.name, field])), [fields]);
  const placed = useMemo(() => placedFieldNames(doc), [doc]);
  const dirty = JSON.stringify({ name, doc }) !== saved;
  const filteredFields = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return fields.filter((field) => {
      if (!needle) return true;
      return field.label.toLowerCase().includes(needle) || field.name.toLowerCase().includes(needle) || field.fieldType.toLowerCase().includes(needle);
    });
  }, [fields, query]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const commit = (nextDoc: LayoutDocument, nextName = nameRef.current) => {
    setPast((current) => [...current.slice(-49), { name: nameRef.current, doc: cloneLayoutDocument(docRef.current) }]);
    setFuture([]);
    setDoc(nextDoc);
    setName(nextName);
  };

  const restore = (snapshot: Snapshot) => {
    setDoc(snapshot.doc);
    setName(snapshot.name);
  };

  const undo = () => {
    setPast((current) => {
      const previous = current[current.length - 1];
      if (!previous) return current;
      setFuture((items) => [{ name: nameRef.current, doc: cloneLayoutDocument(docRef.current) }, ...items]);
      restore(previous);
      return current.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture((current) => {
      const next = current[0];
      if (!next) return current;
      setPast((items) => [...items, { name: nameRef.current, doc: cloneLayoutDocument(docRef.current) }]);
      restore(next);
      return current.slice(1);
    });
  };

  const showError = (message: string) => {
    toast({ title: "Layout", description: message, variant: "destructive" as any });
  };

  const findItem = (itemId: string) => {
    for (const section of doc.sections) {
      const item = section.items.find((entry) => entry.id === itemId);
      if (item) return { section, item };
    }
    return null;
  };

  const locked = (fieldName?: string) => {
    const field = fieldName ? fieldsByName.get(fieldName) : undefined;
    return field ? isLockedLayoutField(field, objectName) : false;
  };

  const dropOn = (sectionId: string, column: LayoutColumn, row: number) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.kind === "field") {
      if (placed.has(drag.fieldApiName)) return;
      const field = fieldsByName.get(drag.fieldApiName);
      const item: LayoutItem = {
        id: newLayoutId("item"),
        type: "field",
        fieldApiName: drag.fieldApiName,
        column,
        row,
        readOnly: field?.editable === false,
        required: Boolean(field && isLockedLayoutField(field, objectName)),
      };
      commit(placeLayoutItem(doc, sectionId, column, row, item));
      return;
    }
    if (drag.kind === "blank") {
      commit(placeLayoutItem(doc, sectionId, column, row, {
        id: newLayoutId("item"),
        type: "blank",
        column,
        row,
        readOnly: false,
        required: false,
      }));
      return;
    }
    if (drag.kind === "item") {
      const found = findItem(drag.itemId);
      if (!found) return;
      commit(placeLayoutItem(doc, sectionId, column, row, found.item));
      return;
    }
    if (drag.kind === "section") {
      const next = cloneLayoutDocument(doc);
      next.sections.push({ ...emptyLayoutDocument(name).sections[0], id: newLayoutId("sec"), title: "New Section", order: next.sections.length });
      commit(next);
    }
  };

  const removeItem = (itemId: string) => {
    const found = findItem(itemId);
    if (!found) return;
    if (found.item.type === "field" && locked(found.item.fieldApiName)) {
      const field = fieldsByName.get(found.item.fieldApiName || "");
      showError(`${field?.label || found.item.fieldApiName} is required and cannot be removed from the layout`);
      return;
    }
    commit(removeLayoutItem(doc, itemId));
    setSelected((current) => current.filter((id) => id !== itemId));
  };

  const save = async (stay: boolean) => {
    const invalid = validateLayoutDocument(doc, fields, objectName);
    if (invalid) {
      showError(invalid);
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim() || layout.name, document: doc }, { stay });
      setSaved(JSON.stringify({ name: name.trim() || layout.name, doc }));
      if (!stay) return;
      toast({ title: "Layout saved", description: "Your changes are saved. You can keep editing." });
    } catch (error: any) {
      showError(error?.response?.data?.error || error?.message || "Failed to save layout");
    } finally {
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (dirty && !window.confirm("You have unsaved layout changes. Leave without saving?")) return;
    onCancel();
  };

  const toggleSelected = (itemId: string, additive: boolean) => {
    setSelected((current) => {
      if (!additive) return current.includes(itemId) && current.length === 1 ? [] : [itemId];
      return current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId];
    });
  };

  const applySelection = (patch: Partial<Pick<LayoutItem, "readOnly" | "required">>) => {
    const ids = selected.filter((id) => {
      const found = findItem(id);
      if (!found || found.item.type !== "field") return false;
      const field = fieldsByName.get(found.item.fieldApiName || "");
      if (!field) return true;
      if (patch.readOnly === false && field.editable === false) return false;
      if (patch.required === false && isLockedLayoutField(field, objectName)) return false;
      return true;
    });
    if (!ids.length) {
      showError("The selected fields cannot take that property.");
      return;
    }
    commit(updateLayoutItems(doc, ids, patch));
  };

  const loadPreview = async (profileId: string) => {
    setPreviewProfileId(profileId);
    if (!profileId) {
      setPreviewPermissions({});
      return;
    }
    try {
      const response = await api.get(`/api/page-layouts/${layout.id}/preview`, { params: { profileId } });
      setPreviewPermissions(response.data?.data?.permissions || {});
    } catch {
      setPreviewPermissions({});
    }
  };

  const openPreview = async () => {
    setPreviewOpen(true);
    if (profiles.length) return;
    try {
      const response = await api.get("/api/layout-assignments", { params: { object: objectName } });
      setProfiles(response.data?.data?.profiles || []);
    } catch {
      setProfiles([]);
    }
  };

  const sectionProps = doc.sections.find((section) => section.id === sectionPropsId) || null;
  const fieldProps = fieldPropsId ? findItem(fieldPropsId) : null;
  const fieldPropsField = fieldProps?.item.fieldApiName ? fieldsByName.get(fieldProps.item.fieldApiName) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="min-w-[12rem] flex-1">
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-xs text-muted-foreground">{objectName} page layout{dirty ? " · Unsaved changes" : ""}</p>
        </div>
        <Button size="sm" onClick={() => void save(false)} disabled={saving || !dirty}>
          <Save className="mr-1 h-4 w-4" />Save
        </Button>
        <Button size="sm" variant="outline" onClick={() => void save(true)} disabled={saving || !dirty}>Quick Save</Button>
        <Button size="sm" variant="outline" onClick={() => void openPreview()}><Eye className="mr-1 h-4 w-4" />Preview As...</Button>
        <Button size="sm" variant="outline" onClick={requestClose}>Cancel</Button>
        <Button size="sm" variant="outline" onClick={undo} disabled={!past.length} aria-label="Undo"><Undo2 className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={redo} disabled={!future.length} aria-label="Redo"><Redo2 className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={() => setLayoutPropsOpen(true)}><Settings className="mr-1 h-4 w-4" />Layout Properties</Button>
        <Button size="sm" variant="outline" onClick={onAssign}>Assign Layout</Button>
      </div>

      <div className="border-b bg-muted/20">
        <div className={`flex min-h-0 ${paletteOpen ? "h-64" : "h-10"}`}>
          <nav className="w-36 shrink-0 space-y-1 overflow-y-auto border-r p-2">
            {PALETTE_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { setTab(item.id); setPaletteOpen(true); }}
                className={`block w-full rounded px-2 py-1 text-left text-xs ${tab === item.id ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70"}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          {paletteOpen && (
            <div
              className="min-w-0 flex-1 overflow-y-auto p-3"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const drag = dragRef.current;
                dragRef.current = null;
                if (drag?.kind === "item") removeItem(drag.itemId);
              }}
            >
              {tab === "fields" && (
                <div className="space-y-2">
                  <div className="relative max-w-xs">
                    <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Quick Find" className="h-8 pl-8" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                    <PaletteTile label="Section" detail="Adds a section" onDragStart={() => { dragRef.current = { kind: "section" }; }} />
                    <PaletteTile label="Blank Space" detail="Empty slot" onDragStart={() => { dragRef.current = { kind: "blank" }; }} />
                    {filteredFields.map((field) => {
                      const used = placed.has(field.name);
                      return (
                        <PaletteTile
                          key={field.name}
                          label={field.label || field.name}
                          detail={`${field.label || field.name}\nAPI name: ${field.name}\nType: ${field.fieldType}`}
                          disabled={used}
                          onDragStart={() => { dragRef.current = { kind: "field", fieldApiName: field.name }; }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
              {tab === "buttons" && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                  {LAYOUT_STANDARD_BUTTONS.map((button) => (
                    <PaletteTile
                      key={button}
                      label={button}
                      disabled={doc.buttons.standard.includes(button)}
                      onDragStart={() => { dragRef.current = { kind: "button", name: button }; }}
                    />
                  ))}
                </div>
              )}
              {tab === "links" && <p className="py-8 text-center text-sm text-muted-foreground">No custom links are configured for {objectName}.</p>}
              {tab === "actions" && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                  {LAYOUT_QUICK_ACTIONS.map((action) => (
                    <PaletteTile
                      key={action}
                      label={action}
                      disabled={doc.quickActions.includes(action)}
                      onDragStart={() => { dragRef.current = { kind: "action", name: action }; }}
                    />
                  ))}
                </div>
              )}
              {tab === "related" && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                  {LAYOUT_RELATED_CATALOG.map((list) => (
                    <PaletteTile
                      key={list.apiName}
                      label={list.label}
                      detail={list.columns.join(", ")}
                      disabled={doc.relatedLists.some((item) => item.apiName === list.apiName)}
                      onDragStart={() => { dragRef.current = { kind: "related", apiName: list.apiName }; }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <button type="button" className="w-full border-t py-1 text-xs text-muted-foreground hover:bg-muted/40" onClick={() => setPaletteOpen((open) => !open)}>
          {paletteOpen ? "Collapse palette" : "Expand palette"}
        </button>
      </div>

      {opening.arranged && (
        <p className="border-b bg-sky-50 px-3 py-1.5 text-xs text-sky-900">Large sections were split into a two-column grid and required fields were kept on the layout. Save to keep this arrangement.</p>
      )}

      {selected.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2 text-xs">
          <span>{selected.length} fields selected</span>
          <Button size="sm" variant="outline" className="h-7" onClick={() => applySelection({ readOnly: true })}>Read-only</Button>
          <Button size="sm" variant="outline" className="h-7" onClick={() => applySelection({ readOnly: false })}>Editable</Button>
          <Button size="sm" variant="outline" className="h-7" onClick={() => applySelection({ required: true })}>Required</Button>
          <Button size="sm" variant="outline" className="h-7" onClick={() => applySelection({ required: false })}>Optional</Button>
          <Button size="sm" variant="outline" className="h-7" onClick={() => {
            let next = doc;
            const blocked: string[] = [];
            for (const itemId of selected) {
              const found = findItem(itemId);
              if (!found) continue;
              if (found.item.type === "field" && locked(found.item.fieldApiName)) {
                blocked.push(fieldsByName.get(found.item.fieldApiName || "")?.label || found.item.fieldApiName || "Field");
                continue;
              }
              next = removeLayoutItem(next, itemId);
            }
            if (blocked.length) showError(`${blocked.join(", ")} cannot be removed from the layout`);
            if (next !== doc) commit(next);
            setSelected([]);
          }}>Remove</Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setSelected([])}>Clear</Button>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <section className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">Highlights Panel</section>
        <DropBar
          title="Quick Actions"
          onDrop={() => {
            const drag = dragRef.current;
            dragRef.current = null;
            if (drag?.kind !== "action" || doc.quickActions.includes(drag.name)) return;
            const next = cloneLayoutDocument(doc);
            next.quickActions.push(drag.name);
            commit(next);
          }}
        >
          {doc.quickActions.map((action) => (
            <Chip key={action} label={action} onRemove={() => commit({ ...doc, quickActions: doc.quickActions.filter((item) => item !== action) })} />
          ))}
          {!doc.quickActions.length && <span className="text-xs text-muted-foreground">Drag quick actions here</span>}
        </DropBar>
        <DropBar
          title="Buttons"
          onDrop={() => {
            const drag = dragRef.current;
            dragRef.current = null;
            if (drag?.kind !== "button" || doc.buttons.standard.includes(drag.name)) return;
            const next = cloneLayoutDocument(doc);
            next.buttons.standard.push(drag.name);
            commit(next);
          }}
        >
          {doc.buttons.standard.map((button) => (
            <Chip key={button} label={button} onRemove={() => commit({ ...doc, buttons: { ...doc.buttons, standard: doc.buttons.standard.filter((item) => item !== button) } })} />
          ))}
          {!doc.buttons.standard.length && <span className="text-xs text-muted-foreground">Drag standard buttons here</span>}
        </DropBar>

        {doc.sections.map((section, index) => (
          <SectionCard
            key={section.id}
            section={section}
            fieldsByName={fieldsByName}
            selected={selected}
            objectName={objectName}
            onToggle={toggleSelected}
            onRemove={removeItem}
            onProperties={setFieldPropsId}
            onOpenSection={() => setSectionPropsId(section.id)}
            onCollapse={() => {
              const next = cloneLayoutDocument(doc);
              next.sections[index] = { ...next.sections[index], collapsed: !section.collapsed };
              commit(next);
            }}
            onRename={(title) => {
              const next = cloneLayoutDocument(doc);
              next.sections[index] = { ...next.sections[index], title };
              commit(next);
            }}
            onDelete={() => {
              if (doc.sections.length === 1) {
                showError("A layout needs at least one section");
                return;
              }
              if (section.items.some((item) => item.type === "field" && locked(item.fieldApiName))) {
                showError("Move the required fields out of this section before deleting it");
                return;
              }
              const next = cloneLayoutDocument(doc);
              next.sections = next.sections.filter((item) => item.id !== section.id).map((item, order) => ({ ...item, order }));
              commit(next);
            }}
            onDropSlot={(column, row) => dropOn(section.id, column, row)}
            onDragSection={() => { dragRef.current = { kind: "move-section", sectionId: section.id }; }}
            onDropSection={() => {
              const drag = dragRef.current;
              dragRef.current = null;
              if (drag?.kind === "move-section") commit(moveLayoutSection(doc, drag.sectionId, index));
              if (drag?.kind === "section") dropOn(section.id, 1, columnItems(section, 1).length);
            }}
            onDragItem={(itemId) => { dragRef.current = { kind: "item", itemId }; }}
          />
        ))}

        <DropBar
          title="Related Lists"
          onDrop={() => {
            const drag = dragRef.current;
            dragRef.current = null;
            if (drag?.kind !== "related") return;
            const catalog = LAYOUT_RELATED_CATALOG.find((list) => list.apiName === drag.apiName);
            if (!catalog || doc.relatedLists.some((list) => list.apiName === catalog.apiName)) return;
            const next = cloneLayoutDocument(doc);
            next.relatedLists.push({ ...catalog, columns: [...catalog.columns] });
            commit(next);
          }}
        >
          {doc.relatedLists.map((list, index) => (
            <div key={list.apiName} className="flex w-full items-center gap-2 rounded border bg-background px-2 py-1 text-xs">
              <span className="font-medium">{list.label}</span>
              <span className="text-muted-foreground">{list.columns.join(", ") || "No columns"}</span>
              <span className="ml-auto flex gap-1">
                <button type="button" aria-label={`Move ${list.label} up`} disabled={index === 0} onClick={() => {
                  const next = cloneLayoutDocument(doc);
                  const [row] = next.relatedLists.splice(index, 1);
                  next.relatedLists.splice(index - 1, 0, row);
                  commit(next);
                }}><ChevronUp className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label={`Move ${list.label} down`} disabled={index === doc.relatedLists.length - 1} onClick={() => {
                  const next = cloneLayoutDocument(doc);
                  const [row] = next.relatedLists.splice(index, 1);
                  next.relatedLists.splice(index + 1, 0, row);
                  commit(next);
                }}><ChevronDown className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label={`Remove ${list.label}`} onClick={() => commit({ ...doc, relatedLists: doc.relatedLists.filter((item) => item.apiName !== list.apiName) })}><X className="h-3.5 w-3.5" /></button>
              </span>
            </div>
          ))}
          {!doc.relatedLists.length && <span className="text-xs text-muted-foreground">Drag related lists here</span>}
        </DropBar>
      </div>

      <Dialog open={layoutPropsOpen} onOpenChange={setLayoutPropsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Layout Properties</DialogTitle>
            <DialogDescription>Name and describe this page layout.</DialogDescription>
          </DialogHeader>
          <LayoutPropertiesForm
            name={name}
            doc={doc}
            objectName={objectName}
            onSubmit={(nextName, nextDoc) => {
              commit(nextDoc, nextName);
              setLayoutPropsOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!sectionProps} onOpenChange={(open) => !open && setSectionPropsId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Section Properties</DialogTitle>
            <DialogDescription>Choose how this section appears on the record.</DialogDescription>
          </DialogHeader>
          {sectionProps && (
            <SectionPropertiesForm
              section={sectionProps}
              onSubmit={(next) => {
                const withColumns = setSectionColumns(doc, sectionProps.id, next.columns);
                const updated = cloneLayoutDocument(withColumns);
                updated.sections = updated.sections.map((section) => section.id === sectionProps.id ? {
                  ...section,
                  title: next.title,
                  showOnEdit: next.showOnEdit,
                  showOnDetail: next.showOnDetail,
                  tabOrder: next.tabOrder,
                } : section);
                commit(updated);
                setSectionPropsId(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!fieldProps} onOpenChange={(open) => !open && setFieldPropsId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Field Properties</DialogTitle>
            <DialogDescription>{fieldPropsField?.label || fieldProps?.item.fieldApiName}</DialogDescription>
          </DialogHeader>
          {fieldProps && (
            <FieldPropertiesForm
              item={fieldProps.item}
              field={fieldPropsField}
              objectName={objectName}
              onSubmit={(patch, hidden) => {
                if (hidden) removeItem(fieldProps.item.id);
                else commit(updateLayoutItems(doc, [fieldProps.item.id], patch));
                setFieldPropsId(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview As</DialogTitle>
            <DialogDescription>Read-only sample of this layout for the selected profile.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="preview-profile">Profile</Label>
          <select id="preview-profile" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={previewProfileId} onChange={(event) => void loadPreview(event.target.value)}>
            <option value="">Select a profile</option>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
          <div className="space-y-3">
            {doc.sections.filter((section) => section.showOnDetail).map((section) => (
              <div key={section.id} className="rounded-md border">
                <div className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">{section.title}</div>
                <div className={section.columns === 2 ? "grid gap-2 p-3 sm:grid-cols-2" : "grid gap-2 p-3"}>
                  {section.items.filter((item) => item.type === "field").map((item) => {
                    const permission = item.fieldApiName ? previewPermissions[item.fieldApiName] : undefined;
                    if (permission && permission.canRead === false) return null;
                    const field = item.fieldApiName ? fieldsByName.get(item.fieldApiName) : undefined;
                    const readOnly = item.readOnly || permission?.canEdit === false;
                    return (
                      <div key={item.id} className="grid grid-cols-[9rem_minmax(0,1fr)] items-center gap-2 text-sm">
                        <span className="truncate text-muted-foreground">{field?.label || item.fieldApiName}</span>
                        <span className="truncate rounded border bg-muted/30 px-2 py-1">{sampleValue(field)}{readOnly ? " · Read-only" : ""}{item.required ? " · Required" : ""}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaletteTile({ label, detail, disabled, onDragStart }: { label: string; detail?: string; disabled?: boolean; onDragStart: () => void }) {
  return (
    <button
      type="button"
      draggable={!disabled}
      title={detail || label}
      disabled={disabled}
      onDragStart={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", label);
        onDragStart();
      }}
      className={`h-8 truncate rounded border px-2 text-left text-xs ${disabled ? "cursor-not-allowed bg-muted text-muted-foreground opacity-50" : "bg-background hover:border-primary"}`}
      style={{ contentVisibility: "auto" }}
    >
      {label}
    </button>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-xs">
      {label}
      <button type="button" aria-label={`Remove ${label}`} onClick={onRemove}><X className="h-3 w-3" /></button>
    </span>
  );
}

function DropBar({ title, onDrop, children }: { title: string; onDrop: () => void; children: React.ReactNode }) {
  return (
    <section
      className="rounded-md border bg-card"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-2 px-3 py-2">{children}</div>
    </section>
  );
}

function SectionCard({
  section,
  fieldsByName,
  selected,
  objectName,
  onToggle,
  onRemove,
  onProperties,
  onOpenSection,
  onCollapse,
  onRename,
  onDelete,
  onDropSlot,
  onDragSection,
  onDropSection,
  onDragItem,
}: {
  section: LayoutSection;
  fieldsByName: Map<string, EditorField>;
  selected: string[];
  objectName: string;
  onToggle: (itemId: string, additive: boolean) => void;
  onRemove: (itemId: string) => void;
  onProperties: (itemId: string) => void;
  onOpenSection: () => void;
  onCollapse: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onDropSlot: (column: LayoutColumn, row: number) => void;
  onDragSection: () => void;
  onDropSection: () => void;
  onDragItem: (itemId: string) => void;
}) {
  const columns: LayoutColumn[] = section.columns === 1 ? [1] : [1, 2];
  return (
    <section
      className="rounded-md border bg-card"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDropSection();
      }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-2 py-1.5">
        <button
          type="button"
          aria-label={`Reorder ${section.title}`}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("text/plain", section.title);
            onDragSection();
          }}
          className="cursor-grab text-muted-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Input value={section.title} onChange={(event) => onRename(event.target.value)} className="h-8 max-w-xs" />
        <span className="text-xs text-muted-foreground">{section.columns === 1 ? "1 column" : "2 columns"}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={onOpenSection}>Section Properties</Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={onCollapse}>{section.collapsed ? "Expand" : "Collapse"}</Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={onDelete} aria-label={`Delete ${section.title}`}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      {!section.collapsed && (
        <div className={section.columns === 2 ? "grid max-h-[32rem] grid-cols-1 gap-px overflow-y-auto bg-border md:grid-cols-2" : "grid max-h-[32rem] gap-px overflow-y-auto bg-border"}>
          {columns.map((column) => {
            const items = columnItems(section, column);
            return (
              <div key={column} className="bg-card">
                {Array.from({ length: items.length + 1 }, (_, row) => {
                  const item = items[row];
                  return (
                    <div
                      key={item?.id || `empty-${column}-${row}`}
                      className="min-h-9 border-b bg-background"
                      style={{ contentVisibility: "auto", containIntrinsicSize: "36px" }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onDropSlot(column, row);
                      }}
                    >
                      {item ? (
                        <FieldSlot
                          item={item}
                          field={item.fieldApiName ? fieldsByName.get(item.fieldApiName) : undefined}
                          objectName={objectName}
                          selected={selected.includes(item.id)}
                          onToggle={onToggle}
                          onRemove={() => onRemove(item.id)}
                          onProperties={() => onProperties(item.id)}
                          onDragStart={() => onDragItem(item.id)}
                        />
                      ) : (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Drop a field here</div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FieldSlot({
  item,
  field,
  objectName,
  selected,
  onToggle,
  onRemove,
  onProperties,
  onDragStart,
}: {
  item: LayoutItem;
  field?: EditorField;
  objectName: string;
  selected: boolean;
  onToggle: (itemId: string, additive: boolean) => void;
  onRemove: () => void;
  onProperties: () => void;
  onDragStart: () => void;
}) {
  const isLocked = field ? isLockedLayoutField(field, objectName) : false;
  const label = item.type === "blank" ? "Blank Space" : field?.label || item.fieldApiName;
  return (
    <div
      draggable
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.setData("text/plain", label || "field");
        onDragStart();
      }}
      onClick={(event) => {
        if (item.type !== "field") return;
        onToggle(item.id, event.metaKey || event.ctrlKey);
      }}
      className={`flex items-center gap-2 px-2 py-1.5 text-sm ${selected ? "bg-sky-50" : ""}`}
    >
      {item.type === "field" && (
        <input
          type="checkbox"
          aria-label={`Select ${label}`}
          checked={selected}
          onChange={() => onToggle(item.id, true)}
          onClick={(event) => event.stopPropagation()}
        />
      )}
      <span className="w-40 shrink-0 truncate text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate">{item.type === "blank" ? "" : label}</span>
      {item.required && <span className="text-destructive" title="Required">*</span>}
      {(item.readOnly || isLocked) && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label={isLocked ? "System field" : "Read-only"} />}
      {item.type === "field" && (
        <button type="button" aria-label={`Properties for ${label}`} onClick={(event) => { event.stopPropagation(); onProperties(); }}>
          <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
      {!isLocked && (
        <button type="button" aria-label={`Remove ${label}`} onClick={(event) => { event.stopPropagation(); onRemove(); }}>
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

function LayoutPropertiesForm({ name, doc, objectName, onSubmit }: { name: string; doc: LayoutDocument; objectName: string; onSubmit: (name: string, doc: LayoutDocument) => void }) {
  const [draftName, setDraftName] = useState(name);
  const [apiName, setApiName] = useState(doc.apiName);
  const [description, setDescription] = useState(doc.description);
  const [isActive, setIsActive] = useState(doc.isActive);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const next = cloneLayoutDocument(doc);
        next.apiName = layoutApiName(apiName || draftName);
        next.description = description;
        next.isActive = isActive;
        onSubmit(draftName.trim() || name, next);
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="layout-name">Layout name</Label>
        <Input id="layout-name" value={draftName} onChange={(event) => setDraftName(event.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="layout-api">API name</Label>
        <Input id="layout-api" value={apiName} onChange={(event) => setApiName(event.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="layout-description">Description</Label>
        <Textarea id="layout-description" value={description} onChange={(event) => setDescription(event.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Object</Label>
        <Input value={objectName} disabled />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="layout-active">Active</Label>
        <Switch id="layout-active" checked={isActive} onCheckedChange={setIsActive} />
      </div>
      <DialogFooter>
        <Button type="submit">Done</Button>
      </DialogFooter>
    </form>
  );
}

function SectionPropertiesForm({ section, onSubmit }: { section: LayoutSection; onSubmit: (section: LayoutSection) => void }) {
  const [draft, setDraft] = useState(section);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ ...draft, title: draft.title.trim() || section.title });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="section-name">Section name</Label>
        <Input id="section-name" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="section-columns">Columns</Label>
        <select id="section-columns" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.columns} onChange={(event) => setDraft({ ...draft, columns: Number(event.target.value) === 1 ? 1 : 2 })}>
          <option value={1}>1 column</option>
          <option value={2}>2 columns</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="section-tab">Tab order</Label>
        <select id="section-tab" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.tabOrder} onChange={(event) => setDraft({ ...draft, tabOrder: event.target.value === "top-down" ? "top-down" : "left-right" })}>
          <option value="left-right">Left to right</option>
          <option value="top-down">Top to bottom</option>
        </select>
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="section-edit">Show on edit page</Label>
        <Switch id="section-edit" checked={draft.showOnEdit} onCheckedChange={(checked) => setDraft({ ...draft, showOnEdit: checked })} />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="section-detail">Show on detail page</Label>
        <Switch id="section-detail" checked={draft.showOnDetail} onCheckedChange={(checked) => setDraft({ ...draft, showOnDetail: checked })} />
      </div>
      <DialogFooter>
        <Button type="submit">Done</Button>
      </DialogFooter>
    </form>
  );
}

function FieldPropertiesForm({
  item,
  field,
  objectName,
  onSubmit,
}: {
  item: LayoutItem;
  field?: EditorField;
  objectName: string;
  onSubmit: (patch: Partial<Pick<LayoutItem, "readOnly" | "required">>, hidden: boolean) => void;
}) {
  const systemRequired = field ? isLockedLayoutField(field, objectName) : false;
  const systemReadOnly = field?.editable === false;
  const [readOnly, setReadOnly] = useState(item.readOnly || systemReadOnly);
  const [required, setRequired] = useState(item.required || systemRequired);
  const [hidden, setHidden] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ readOnly, required: required || systemRequired }, hidden);
      }}
    >
      <div className="flex items-center justify-between">
        <Label htmlFor="field-readonly">Read-only</Label>
        <Switch id="field-readonly" checked={readOnly} disabled={systemReadOnly} onCheckedChange={setReadOnly} />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="field-required">Required</Label>
        <Switch id="field-required" checked={required} disabled={systemRequired} onCheckedChange={setRequired} />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="field-hidden">Hidden on layout</Label>
        <Switch id="field-hidden" checked={hidden} disabled={systemRequired} onCheckedChange={setHidden} />
      </div>
      <DialogFooter>
        <Button type="submit">Done</Button>
      </DialogFooter>
    </form>
  );
}
