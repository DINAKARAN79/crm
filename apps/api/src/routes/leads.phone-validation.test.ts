import { describe, expect, it } from 'vitest';
import { leadSchema, leadUpdateSchema, normalizePhone, PHONE_DUPLICATE_ERROR } from '@dct-crm/shared';
import { buildLeadDeletionPlan } from './leads';

const baseLead = {
  lastName: 'Dup',
  company: 'DupCo',
  source: 'WEBSITE' as const,
  phone: '+91-9876543210',
};

describe('normalizePhone', () => {
  it('strips whitespace only and keeps other characters', () => {
    expect(normalizePhone('+91 9876543210')).toBe('+919876543210');
    expect(normalizePhone(' +91-9876543210 ')).toBe('+91-9876543210');
    expect(normalizePhone('+91-9876543210')).toBe('+91-9876543210');
  });

  it('does not treat different formatted numbers as equal beyond whitespace', () => {
    expect(normalizePhone('+91 9876543210')).not.toBe(normalizePhone('+91-9876543210'));
    expect(normalizePhone('9876543210')).not.toBe(normalizePhone('+91 9876543210'));
  });
});

describe('leadSchema phone', () => {
  it('requires phone', () => {
    const result = leadSchema.safeParse({ ...baseLead, phone: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toBe('Phone number is required.');
    }
  });

  it('rejects empty/whitespace phone', () => {
    const result = leadSchema.safeParse({ ...baseLead, phone: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toBe('Phone number is required.');
    }
  });

  it('normalizes phone on parse', () => {
    const result = leadSchema.safeParse({ ...baseLead, phone: '+91 9876543210' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe('+919876543210');
    }
  });

  it('partial allows missing phone for edit without change', () => {
    const result = leadSchema.partial().safeParse({ lastName: 'Only' });
    expect(result.success).toBe(true);
  });

  it('partial still rejects empty phone when provided', () => {
    const result = leadSchema.partial().safeParse({ phone: '' });
    expect(result.success).toBe(false);
  });
});

describe('leadUpdateSchema', () => {
  it('strips server-managed and relation fields returned by the lead detail API', () => {
    const result = leadUpdateSchema.safeParse({
      status: 'NEW',
      lastName: 'Dup',
      tenantId: 'tenant-1',
      creatorId: 'creator-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      siteVisits: [],
      opportunities: [],
      activities: [],
      tasks: [],
      followUps: [],
      auditLogs: [],
      ownerHistory: [],
      lastModified: { at: new Date().toISOString() },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ status: 'NEW', lastName: 'Dup' });
    }
  });

  it('still rejects invalid values for editable fields', () => {
    const result = leadUpdateSchema.safeParse({ status: 'NOT_A_STATUS', tenantId: 'tenant-1' });
    expect(result.success).toBe(false);
  });
});

describe('PHONE_DUPLICATE_ERROR', () => {
  it('matches required message exactly', () => {
    expect(PHONE_DUPLICATE_ERROR).toBe('Phone number already exists for another lead.');
  });
});

describe('buildLeadDeletionPlan', () => {
  it('cleans remaining related lead records before the final lead delete', () => {
    const plan = buildLeadDeletionPlan('lead-123');

    expect(plan.map((step) => step.name)).toEqual([
      'activity',
      'followUp',
      'leadOwnerHistory',
      'callDetail',
      'siteVisit',
      'lead',
    ]);

    expect(plan.findIndex((step) => step.name === 'lead')).toBeGreaterThan(
      plan.findIndex((step) => step.name === 'siteVisit'),
    );
  });
});