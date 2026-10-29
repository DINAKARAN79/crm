import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  fieldFindMany: vi.fn(),
  objectFindFirst: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    fieldDefinition: {
      findMany: database.fieldFindMany,
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    objectDefinition: { findFirst: database.objectFindFirst },
  },
}));

import { getAllFieldDefinitions } from './metadata';

beforeEach(() => {
  vi.clearAllMocks();
  database.fieldFindMany.mockResolvedValue([
    { name: 'svc_call_summary_remarks', isActive: true, visible: true },
  ]);
  database.objectFindFirst.mockResolvedValue({ id: 'lead-object-a', name: 'Lead' });
});

describe('getAllFieldDefinitions', () => {
  it('includes virtual standard Lead fields alongside Prospect custom fields', async () => {
    const fields = await getAllFieldDefinitions('tenant-a', 'lead-object-a', 'Lead');
    const fieldNames = fields.map((field) => field.name);

    expect(fieldNames).toContain('svc_call_summary_remarks');
    expect(fieldNames).toContain('firstName');
    expect(fieldNames).toContain('status');
  });

  it('does not query the object again for non-Lead objects with configured fields', async () => {
    const configuredField = { name: 'name', isActive: true, visible: true };
    database.fieldFindMany.mockResolvedValueOnce([configuredField]);

    const fields = await getAllFieldDefinitions('tenant-a', 'project-object-a', 'Project');

    expect(fields).toEqual([configuredField]);
    expect(database.objectFindFirst).not.toHaveBeenCalled();
  });
});
