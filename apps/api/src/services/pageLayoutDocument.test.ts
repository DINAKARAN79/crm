import { describe, expect, it } from 'vitest';
import {
  ensureRequiredFields,
  parseLayoutDocument,
  placeLayoutItem,
  placedFieldNames,
  splitLargeSections,
  validateLayoutDocument,
  type LayoutItem,
} from '@dct-crm/shared';

const fields = [
  { name: 'lastName', label: 'Last Name', required: true, isSystemField: true },
  { name: 'company', label: 'Company', required: true, isSystemField: true },
  { name: 'email', label: 'Email', required: false, isSystemField: false },
  { name: 'phone', label: 'Phone', required: false, isSystemField: false },
];

describe('page layout documents', () => {
  it('turns a legacy field list into a two-column document', () => {
    const doc = parseLayoutDocument([{ name: 'Information', fields: ['email', 'phone', 'lastName'] }], 'Lead Layout');
    expect(doc.version).toBe(2);
    expect(doc.sections[0].title).toBe('Information');
    expect(doc.sections[0].items.find((item) => item.fieldApiName === 'phone')?.column).toBe(2);
    expect(validateLayoutDocument(doc, fields, 'Lead')).toBe('Company is required and cannot be removed from the layout');
  });

  it('keeps required system fields and rejects duplicates', () => {
    const doc = ensureRequiredFields(parseLayoutDocument([{ name: 'Information', fields: ['email'] }], 'Lead Layout'), fields, 'Lead');
    expect(placedFieldNames(doc).has('lastName')).toBe(true);
    expect(placedFieldNames(doc).has('company')).toBe(true);
    expect(validateLayoutDocument(doc, fields, 'Lead')).toBeNull();

    const duplicate = parseLayoutDocument(doc, 'Lead Layout');
    duplicate.sections[0].items.push({
      ...duplicate.sections[0].items[0],
      id: 'dup',
    } as LayoutItem);
    expect(validateLayoutDocument(duplicate, fields, 'Lead')).toMatch(/more than once/);
  });

  it('moves a field into another column without leaving a copy', () => {
    const doc = ensureRequiredFields(parseLayoutDocument([{ name: 'Information', fields: ['email', 'phone'] }], 'Lead'), fields, 'Lead');
    const email = doc.sections[0].items.find((item) => item.fieldApiName === 'email');
    expect(email).toBeTruthy();
    const moved = placeLayoutItem(doc, doc.sections[0].id, 2, 0, email as LayoutItem);
    const copies = moved.sections[0].items.filter((item) => item.fieldApiName === 'email');
    expect(copies).toHaveLength(1);
    expect(copies[0].column).toBe(2);
  });

  it('splits a huge section into manageable sections', () => {
    const names = Array.from({ length: 40 }, (_, index) => `field_${index}`);
    const doc = splitLargeSections(parseLayoutDocument([{ name: 'Information', fields: names }], 'Lead'));
    expect(doc.sections.length).toBeGreaterThan(1);
    expect(doc.sections.every((section) => section.items.length <= 16)).toBe(true);
  });
});
