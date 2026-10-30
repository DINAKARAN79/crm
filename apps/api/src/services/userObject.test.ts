import { describe, expect, it } from 'vitest';
import { ensureUserObject } from './userObject';

describe('ensureUserObject', () => {
  it('registers User once for a tenant and does not duplicate it', async () => {
    const objects: Array<{ id: string; name: string }> = [];
    const fields: Array<{ name: string; required: boolean }> = [];
    const audits: Array<{ newValues: unknown }> = [];
    let layouts = 0;
    const db = {
      objectDefinition: {
        findFirst: async ({ where }: { where: { name: string } }) => objects.find((object) => object.name === where.name) || null,
        create: async ({ data }: { data: { name: string } }) => {
          const created = { id: `object-${objects.length + 1}`, name: data.name };
          objects.push(created);
          return created;
        },
      },
      fieldDefinition: {
        findFirst: async ({ where }: { where: { name: string } }) => fields.find((field) => field.name === where.name) || null,
        createMany: async ({ data }: { data: Array<{ name: string; required: boolean }> }) => {
          for (const field of data) {
            if (!fields.some((existing) => existing.name === field.name)) fields.push({ name: field.name, required: field.required });
          }
          return { count: data.length };
        },
        deleteMany: async () => ({ count: 0 }),
        updateMany: async ({ where, data }: { where: { name: string }; data: { required?: boolean } }) => {
          const field = fields.find((item) => item.name === where.name);
          if (field && data.required !== undefined) field.required = data.required;
          return { count: field ? 1 : 0 };
        },
      },
      auditLog: {
        create: async ({ data }: { data: { newValues: unknown } }) => {
          audits.push(data);
          return { id: 'audit' };
        },
      },
      pageLayout: {
        findFirst: async () => (layouts ? { id: 'layout' } : null),
        create: async () => {
          layouts += 1;
          return { id: 'layout' };
        },
      },
      profile: { findMany: async () => [{ id: 'admin-profile' }] },
      role: { findFirst: async () => ({ id: 'admin-role' }) },
      profileObjectPermission: { createMany: async () => ({ count: 1 }) },
      objectPermission: { createMany: async () => ({ count: 1 }) },
    };

    await ensureUserObject(db as never, 'tenant-1', 'system');
    await ensureUserObject(db as never, 'tenant-1', 'system');

    expect(objects.map((object) => object.name)).toEqual(['User']);
    expect(fields.filter((field) => field.name === 'phone')).toEqual([{ name: 'phone', required: true }]);
    expect(fields.some((field) => field.name === 'passwordHash')).toBe(false);
    expect(layouts).toBe(1);
    expect(audits).toHaveLength(1);
    expect(audits[0].newValues).toMatchObject({ name: 'phone', required: true });
  });
});
