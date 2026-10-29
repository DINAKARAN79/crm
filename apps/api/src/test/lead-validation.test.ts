import { describe, expect, it } from 'vitest';
import { leadCreateSchema } from '@dct-crm/shared';

const validLead = {
  lastName: 'Kumar',
  company: 'Acme',
  source: 'WEBSITE',
  phone: '+91-9876543210',
};

describe('lead creation required fields', () => {
  it.each([
    ['lastName', 'Last name is required'],
    ['company', 'Company is required'],
    ['source', 'Lead Source is required.'],
    ['phone', 'Phone number is required.'],
  ])('rejects missing %s', (field, message) => {
    const payload = { ...validLead } as Record<string, unknown>;
    delete payload[field];
    const result = leadCreateSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toContain(message);
  });

  it('accepts all required fields and normalizes phone', () => {
    const result = leadCreateSchema.safeParse(validLead);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe('+91-9876543210');
  });

  it('accepts the status sent by the lead creation form', () => {
    const result = leadCreateSchema.safeParse({ ...validLead, status: 'NEW' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe('NEW');
  });

  it('accepts Lead Interest values used by the new lead form', () => {
    const result = leadCreateSchema.safeParse({ ...validLead, leadInterest: 'UNABLE_TO_CONNECT' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.leadInterest).toBe('UNABLE_TO_CONNECT');
  });
});