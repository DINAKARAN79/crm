import { describe, expect, it } from 'vitest';
import { resolveUnitLocation } from '@dct-crm/shared';
import { buildCompanyApiCatalog, catalogChecks, validateCatalogBody } from './companyApiCatalog';
import { omitPath } from './zodCatalog';

describe('company API catalog examples', () => {
  for (const check of catalogChecks()) {
    it(`${check.objectName} required example passes, and dropping a required field fails`, () => {
      const parsed = check.schema.safeParse(check.requiredExample);
      expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues, null, 2)).toBe(true);
      if (check.afterParse) {
        expect(check.afterParse(check.requiredExample)).toBeNull();
      }
      for (const path of check.requiredFieldPaths) {
        const withoutField = omitPath(check.requiredExample, path);
        const failed = check.schema.safeParse(withoutField);
        expect(failed.success, `${check.objectName} ${path}`).toBe(false);
      }
    });
  }

  it('unit required example is the smallest plot payload and the full example is an apartment', () => {
    const catalog = buildCompanyApiCatalog();
    const unit = catalog.topics.find((topic) => topic.objectName === 'Unit');
    const create = unit?.operations.find((operation) => operation.id === 'post-create');
    expect(create?.body?.requiredExample).toMatchObject({
      projectId: 'cmexampleproject000000000001',
      number: 'A-101',
      type: 'Plot',
      price: 3200000,
    });
    expect(create?.body?.requiredExample).not.toHaveProperty('block');
    const lead = catalog.topics.find((topic) => topic.objectName === 'Lead');
    const leadCreate = lead?.operations.find((operation) => operation.id === 'post-create');
    expect(leadCreate?.body?.requiredExample).toEqual({
      lastName: 'Kumar',
      phone: '+919000000000',
      company: 'Test Co',
    });
    expect(leadCreate?.queryExample).toBeNull();
    expect(lead?.operations.find((operation) => operation.id === 'get-list')?.queryExample).toBe('?page=1&limit=20&status=INCOMING');
    expect(lead?.operations.find((operation) => operation.id === 'put-update')?.body?.requiredExample).toEqual({ status: 'PROSPECT' });
    expect(validateCatalogBody('Lead', 'post-create', leadCreate?.body?.requiredExample).valid).toBe(true);
    expect(validateCatalogBody('Lead', 'put-update', { status: 'PROSPECT' }).valid).toBe(true);
    expect(create?.body?.fullExample).toMatchObject({
      type: 'Apartment',
      block: 'Block 1',
      floor: 2,
      price: 7500000,
    });
    const full = create?.body?.fullExample || {};
    const location = resolveUnitLocation({
      type: String(full.type),
      block: String(full.block),
      floor: Number(full.floor),
    });
    expect(location.ok).toBe(true);
    const missingBlock = resolveUnitLocation({ type: 'Apartment', floor: 2 });
    expect(missingBlock.ok).toBe(false);
    expect(validateCatalogBody('Unit', 'post-create', create?.body?.fullExample).valid).toBe(true);
  });

  it('full examples pass the same validation as required examples', () => {
    const catalog = buildCompanyApiCatalog();
    for (const topic of catalog.topics) {
      for (const operation of topic.operations) {
        if (!operation.body) continue;
        const result = validateCatalogBody(topic.objectName, operation.id, operation.body.fullExample);
        expect(result.valid, `${topic.objectName} ${operation.id} ${JSON.stringify(result.fieldErrors)}`).toBe(true);
      }
    }
  });
});
