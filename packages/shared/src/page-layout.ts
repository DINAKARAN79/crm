export type LayoutColumn = 1 | 2;

export interface LayoutItem {
  id: string;
  type: 'field' | 'blank';
  fieldApiName?: string;
  column: LayoutColumn;
  row: number;
  readOnly: boolean;
  required: boolean;
}

export interface LayoutSection {
  id: string;
  title: string;
  columns: LayoutColumn;
  order: number;
  showOnEdit: boolean;
  showOnDetail: boolean;
  collapsed: boolean;
  tabOrder: 'top-down' | 'left-right';
  items: LayoutItem[];
}

export interface LayoutRelatedList {
  apiName: string;
  label: string;
  columns: string[];
}

export interface LayoutDocument {
  version: 2;
  apiName: string;
  description: string;
  isActive: boolean;
  sections: LayoutSection[];
  buttons: { standard: string[]; custom: string[] };
  quickActions: string[];
  relatedLists: LayoutRelatedList[];
}

export interface LayoutFieldRef {
  name: string;
  label?: string;
  required?: boolean;
  isSystemField?: boolean;
  editable?: boolean;
}

export interface LayoutFormSection {
  name: string;
  columns: LayoutColumn;
  showOnEdit: boolean;
  showOnDetail: boolean;
  fields: string[];
  readOnly: Record<string, boolean>;
  required: Record<string, boolean>;
}

export const LAYOUT_STANDARD_BUTTONS = ['Edit', 'Delete', 'Change Owner', 'Clone', 'Convert'] as const;

export const LAYOUT_QUICK_ACTIONS = ['Log a Call', 'New Task', 'New Follow-up', 'New Site Visit'] as const;

export const LAYOUT_RELATED_CATALOG: LayoutRelatedList[] = [
  { apiName: 'activities', label: 'Activities', columns: ['Subject', 'Date', 'Type'] },
  { apiName: 'follow_ups', label: 'Follow-ups', columns: ['Subject', 'Due Date', 'Status'] },
  { apiName: 'site_visits', label: 'Site Visits', columns: ['Visit Date', 'Status', 'Project'] },
  { apiName: 'bookings', label: 'Bookings', columns: ['Booking Number', 'Status', 'Unit'] },
];

const LARGE_SECTION_SIZE = 16;

export function layoutApiName(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return slug || 'layout';
}

export function newLayoutId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function cloneLayoutDocument<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function emptyLayoutDocument(name: string): LayoutDocument {
  return {
    version: 2,
    apiName: layoutApiName(name),
    description: '',
    isActive: true,
    sections: [emptySection('Information', 0)],
    buttons: { standard: ['Edit', 'Delete', 'Change Owner', 'Clone'], custom: [] },
    quickActions: [],
    relatedLists: [],
  };
}

function emptySection(title: string, order: number): LayoutSection {
  return {
    id: newLayoutId('sec'),
    title,
    columns: 2,
    order,
    showOnEdit: true,
    showOnDetail: true,
    collapsed: false,
    tabOrder: 'left-right',
    items: [],
  };
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asColumn(value: unknown): LayoutColumn {
  return value === 1 ? 1 : 2;
}

function normalizeItem(raw: any, index: number): LayoutItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type === 'blank' ? 'blank' : 'field';
  const fieldApiName = typeof raw.fieldApiName === 'string' ? raw.fieldApiName : undefined;
  if (type === 'field' && !fieldApiName) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newLayoutId('item'),
    type,
    fieldApiName,
    column: asColumn(raw.column),
    row: Number.isInteger(raw.row) ? raw.row : index,
    readOnly: raw.readOnly === true,
    required: raw.required === true,
  };
}

function normalizeSection(raw: any, index: number): LayoutSection {
  const items = Array.isArray(raw?.items)
    ? raw.items.map(normalizeItem).filter((item: LayoutItem | null): item is LayoutItem => !!item)
    : [];
  return reflowSection({
    id: typeof raw?.id === 'string' && raw.id ? raw.id : newLayoutId('sec'),
    title: typeof raw?.title === 'string' && raw.title.trim() ? raw.title.trim() : `Section ${index + 1}`,
    columns: raw?.columns === 1 ? 1 : 2,
    order: Number.isInteger(raw?.order) ? raw.order : index,
    showOnEdit: raw?.showOnEdit !== false,
    showOnDetail: raw?.showOnDetail !== false,
    collapsed: raw?.collapsed === true,
    tabOrder: raw?.tabOrder === 'top-down' ? 'top-down' : 'left-right',
    items,
  });
}

export function isVersion2Layout(raw: unknown): raw is LayoutDocument {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as { version?: unknown }).version === 2;
}

export function parseLayoutDocument(raw: unknown, name = 'Layout'): LayoutDocument {
  const value = typeof raw === 'string' ? safeParse(raw) : raw;
  if (isVersion2Layout(value)) {
    const source = value as LayoutDocument;
    const sections = Array.isArray(source.sections) && source.sections.length
      ? source.sections.map(normalizeSection)
      : [emptySection('Information', 0)];
    return {
      version: 2,
      apiName: typeof source.apiName === 'string' && source.apiName.trim() ? source.apiName.trim() : layoutApiName(name),
      description: typeof source.description === 'string' ? source.description : '',
      isActive: source.isActive !== false,
      sections: sections.map((section, index) => ({ ...section, order: index })),
      buttons: {
        standard: stringList(source.buttons?.standard),
        custom: stringList(source.buttons?.custom),
      },
      quickActions: stringList(source.quickActions),
      relatedLists: Array.isArray(source.relatedLists)
        ? source.relatedLists.filter((list) => list && typeof list.apiName === 'string' && typeof list.label === 'string').map((list) => ({
          apiName: list.apiName,
          label: list.label,
          columns: stringList(list.columns),
        }))
        : [],
    };
  }

  const legacy = Array.isArray(value) ? value : [];
  const doc = emptyLayoutDocument(name);
  const sections = legacy.map((section: any, index: number) => {
    const fields = Array.isArray(section?.fields) ? section.fields.filter((field: unknown) => typeof field === 'string') : [];
    return reflowSection({
      ...emptySection(typeof section?.name === 'string' && section.name.trim() ? section.name.trim() : `Section ${index + 1}`, index),
      items: fields.map((field: string, fieldIndex: number) => ({
        id: newLayoutId('item'),
        type: 'field' as const,
        fieldApiName: field,
        column: ((fieldIndex % 2) + 1) as LayoutColumn,
        row: Math.floor(fieldIndex / 2),
        readOnly: false,
        required: false,
      })),
    });
  });
  doc.sections = sections.length ? sections : [emptySection('Information', 0)];
  return doc;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function columnItems(section: LayoutSection, column: LayoutColumn): LayoutItem[] {
  if (section.columns === 1) {
    return section.items.slice().sort((a, b) => a.row - b.row || a.column - b.column);
  }
  return section.items.filter((item) => item.column === column).sort((a, b) => a.row - b.row);
}

export function reflowSection(section: LayoutSection): LayoutSection {
  if (section.columns === 1) {
    const ordered = section.items.slice().sort((a, b) => a.row - b.row || a.column - b.column);
    return {
      ...section,
      items: ordered.map((item, index) => ({ ...item, column: 1, row: index })),
    };
  }
  const left = section.items.filter((item) => item.column !== 2).sort((a, b) => a.row - b.row);
  const right = section.items.filter((item) => item.column === 2).sort((a, b) => a.row - b.row);
  return {
    ...section,
    items: [
      ...left.map((item, index) => ({ ...item, column: 1 as const, row: index })),
      ...right.map((item, index) => ({ ...item, column: 2 as const, row: index })),
    ],
  };
}

export function placedFieldNames(doc: LayoutDocument): Set<string> {
  const names = new Set<string>();
  for (const section of doc.sections) {
    for (const item of section.items) {
      if (item.type === 'field' && item.fieldApiName) names.add(item.fieldApiName);
    }
  }
  return names;
}

export function isLockedLayoutField(field: LayoutFieldRef, objectName: string): boolean {
  if (objectName.toLowerCase() === 'lead' && (field.name === 'lastName' || field.name === 'company')) return true;
  return Boolean(field.required && field.isSystemField);
}

export function lockedLayoutFields(fields: LayoutFieldRef[], objectName: string): Map<string, string> {
  const locked = new Map<string, string>();
  for (const field of fields) {
    if (isLockedLayoutField(field, objectName)) locked.set(field.name, field.label || field.name);
  }
  return locked;
}

export function ensureRequiredFields(doc: LayoutDocument, fields: LayoutFieldRef[], objectName: string): LayoutDocument {
  const next = cloneLayoutDocument(doc);
  const locked = lockedLayoutFields(fields, objectName);
  const readOnlyNames = new Set(fields.filter((field) => field.editable === false).map((field) => field.name));
  const requiredNames = new Set(fields.filter((field) => field.required).map((field) => field.name));
  for (const section of next.sections) {
    section.items = section.items.map((item) => {
      if (item.type !== 'field' || !item.fieldApiName) return item;
      return {
        ...item,
        readOnly: item.readOnly || readOnlyNames.has(item.fieldApiName),
        required: item.required || locked.has(item.fieldApiName) || requiredNames.has(item.fieldApiName) && locked.has(item.fieldApiName),
      };
    });
  }
  const placed = placedFieldNames(next);
  const missing = [...locked.keys()].filter((name) => !placed.has(name));
  if (missing.length) {
    const section = next.sections[0] || emptySection('Information', 0);
    if (!next.sections.length) next.sections = [section];
    const column = columnItems(section, 1);
    missing.forEach((name, index) => {
      section.items.push({
        id: newLayoutId('item'),
        type: 'field',
        fieldApiName: name,
        column: 1,
        row: column.length + index,
        readOnly: readOnlyNames.has(name),
        required: true,
      });
    });
    next.sections[0] = reflowSection(section);
  }
  return next;
}

export function splitLargeSections(doc: LayoutDocument, size = LARGE_SECTION_SIZE): LayoutDocument {
  const next = cloneLayoutDocument(doc);
  const sections: LayoutSection[] = [];
  for (const section of next.sections) {
    const ordered = section.items.slice().sort((a, b) => a.row - b.row || a.column - b.column);
    if (ordered.length <= size * 2) {
      sections.push(section);
      continue;
    }
    for (let start = 0; start < ordered.length; start += size) {
      const chunk = ordered.slice(start, start + size).map((item, index) => ({
        ...item,
        column: ((index % section.columns) + 1) as LayoutColumn,
        row: Math.floor(index / section.columns),
      }));
      sections.push(reflowSection({
        ...section,
        id: start === 0 ? section.id : newLayoutId('sec'),
        title: start === 0 ? section.title : `${section.title} ${Math.floor(start / size) + 1}`,
        order: sections.length,
        items: chunk,
      }));
    }
  }
  next.sections = sections.map((section, index) => ({ ...section, order: index }));
  return next.sections.length ? next : doc;
}

export function validateLayoutDocument(doc: LayoutDocument, fields: LayoutFieldRef[], objectName: string): string | null {
  const known = new Set(fields.map((field) => field.name));
  const seen = new Set<string>();
  for (const section of doc.sections) {
    if (!section.title.trim()) return 'Every section needs a name';
    for (const item of section.items) {
      if (item.type !== 'field' || !item.fieldApiName) continue;
      if (known.size > 0 && !known.has(item.fieldApiName)) return `Unknown field ${item.fieldApiName}`;
      if (seen.has(item.fieldApiName)) return `${item.fieldApiName} is placed more than once`;
      seen.add(item.fieldApiName);
    }
  }
  for (const [name, label] of lockedLayoutFields(fields, objectName)) {
    if (known.size > 0 && !known.has(name)) continue;
    if (!seen.has(name)) return `${label} is required and cannot be removed from the layout`;
  }
  return null;
}

export function layoutFieldRules(doc: LayoutDocument): Map<string, { readOnly: boolean; required: boolean }> {
  const rules = new Map<string, { readOnly: boolean; required: boolean }>();
  for (const section of doc.sections) {
    for (const item of section.items) {
      if (item.type === 'field' && item.fieldApiName) {
        rules.set(item.fieldApiName, { readOnly: item.readOnly, required: item.required });
      }
    }
  }
  return rules;
}

export function layoutSectionsForForm(raw: unknown, name = 'Layout'): LayoutFormSection[] {
  const doc = parseLayoutDocument(raw, name);
  return doc.sections
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((section) => {
      const fields = section.items
        .filter((item) => item.type === 'field' && item.fieldApiName)
        .sort((a, b) => a.row - b.row || a.column - b.column)
        .map((item) => item.fieldApiName as string);
      return {
        name: section.title,
        columns: section.columns,
        showOnEdit: section.showOnEdit,
        showOnDetail: section.showOnDetail,
        fields,
        readOnly: Object.fromEntries(section.items.filter((item) => item.type === 'field' && item.readOnly && item.fieldApiName).map((item) => [item.fieldApiName, true])),
        required: Object.fromEntries(section.items.filter((item) => item.type === 'field' && item.required && item.fieldApiName).map((item) => [item.fieldApiName, true])),
      };
    });
}

export function replaceLayoutSections(doc: LayoutDocument, sections: { name: string; fields: string[] }[]): LayoutDocument {
  const previous = new Map<string, LayoutItem>();
  for (const section of doc.sections) {
    for (const item of section.items) {
      if (item.type === 'field' && item.fieldApiName) previous.set(item.fieldApiName, item);
    }
  }
  const next = cloneLayoutDocument(doc);
  next.sections = sections.map((section, index) => reflowSection({
    ...emptySection(section.name || `Section ${index + 1}`, index),
    items: section.fields.filter((field) => typeof field === 'string' && field).map((field, fieldIndex) => {
      const existing = previous.get(field);
      return {
        id: existing?.id || newLayoutId('item'),
        type: 'field' as const,
        fieldApiName: field,
        column: ((fieldIndex % 2) + 1) as LayoutColumn,
        row: Math.floor(fieldIndex / 2),
        readOnly: existing?.readOnly === true,
        required: existing?.required === true,
      };
    }),
  }));
  return next;
}

function updateSection(doc: LayoutDocument, sectionId: string, update: (section: LayoutSection) => LayoutSection): LayoutDocument {
  const next = cloneLayoutDocument(doc);
  next.sections = next.sections.map((section) => section.id === sectionId ? reflowSection(update(section)) : section);
  return next;
}

export function placeLayoutItem(doc: LayoutDocument, sectionId: string, column: LayoutColumn, row: number, item: LayoutItem): LayoutDocument {
  const stripped = removeItemById(doc, item.id);
  return updateSection(stripped, sectionId, (section) => {
    const targetColumn: LayoutColumn = section.columns === 1 ? 1 : column;
    const current = columnItems(section, targetColumn).filter((existing) => existing.id !== item.id);
    const index = Math.max(0, Math.min(row, current.length));
    current.splice(index, 0, { ...item, column: targetColumn, row: index });
    const other = section.columns === 1
      ? []
      : columnItems(section, targetColumn === 1 ? 2 : 1).filter((existing) => existing.id !== item.id);
    return {
      ...section,
      items: [
        ...current.map((entry, entryIndex) => ({ ...entry, column: targetColumn, row: entryIndex })),
        ...other.map((entry, entryIndex) => ({ ...entry, row: entryIndex })),
      ],
    };
  });
}

function removeItemById(doc: LayoutDocument, itemId: string): LayoutDocument {
  const next = cloneLayoutDocument(doc);
  next.sections = next.sections.map((section) => reflowSection({
    ...section,
    items: section.items.filter((item) => item.id !== itemId),
  }));
  return next;
}

export function removeLayoutItem(doc: LayoutDocument, itemId: string): LayoutDocument {
  return removeItemById(doc, itemId);
}

export function moveLayoutSection(doc: LayoutDocument, sectionId: string, toIndex: number): LayoutDocument {
  const next = cloneLayoutDocument(doc);
  const currentIndex = next.sections.findIndex((section) => section.id === sectionId);
  if (currentIndex < 0) return doc;
  const [section] = next.sections.splice(currentIndex, 1);
  const index = Math.max(0, Math.min(toIndex, next.sections.length));
  next.sections.splice(index, 0, section);
  next.sections = next.sections.map((entry, order) => ({ ...entry, order }));
  return next;
}

export function setSectionColumns(doc: LayoutDocument, sectionId: string, columns: LayoutColumn): LayoutDocument {
  return updateSection(doc, sectionId, (section) => {
    if (columns === section.columns) return section;
    if (columns === 1) {
      const ordered = [...columnItems(section, 1), ...columnItems(section, 2)];
      return {
        ...section,
        columns,
        items: ordered.map((item, index) => ({ ...item, column: 1, row: index })),
      };
    }
    const ordered = columnItems({ ...section, columns: 1 }, 1);
    return {
      ...section,
      columns,
      items: ordered.map((item, index) => ({
        ...item,
        column: ((index % 2) + 1) as LayoutColumn,
        row: Math.floor(index / 2),
      })),
    };
  });
}

export function updateLayoutItems(
  doc: LayoutDocument,
  itemIds: string[],
  patch: Partial<Pick<LayoutItem, 'readOnly' | 'required'>>,
): LayoutDocument {
  const ids = new Set(itemIds);
  const next = cloneLayoutDocument(doc);
  next.sections = next.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ids.has(item.id) ? { ...item, ...patch } : item),
  }));
  return next;
}

export function blankLayoutValue(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}
