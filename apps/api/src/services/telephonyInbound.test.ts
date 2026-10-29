import { describe, expect, it } from 'vitest';
import { ingestTelephonyCall, type TelephonyStore } from './telephonyInbound';

function memoryStore() {
  const tenants: string[] = [];
  const leads: Array<{ tenantId: string; id: string; leadNumber: string }> = [];
  const receipts: Array<{ tenantId: string; providerCallId: string; leadId: string; callDetailId: string }> = [];
  let calls = 0;
  const store: TelephonyStore = {
    async findReceipt(tenantId, providerCallId) {
      tenants.push(tenantId);
      const row = receipts.find((item) => item.tenantId === tenantId && item.providerCallId === providerCallId);
      return row ? { leadId: row.leadId, leadNumber: 'LN000010', callDetailId: row.callDetailId } : null;
    },
    async findLeadByPhone(tenantId) {
      tenants.push(tenantId);
      return null;
    },
    async createLead(input) {
      tenants.push(input.tenantId);
      const lead = { tenantId: input.tenantId, id: `lead-${leads.length + 1}`, leadNumber: 'LN000010' };
      leads.push(lead);
      return { id: lead.id, leadNumber: lead.leadNumber, created: true };
    },
    async createCall(input) {
      tenants.push(input.tenantId);
      calls += 1;
      return { id: `call-${calls}` };
    },
    async applyStatus(input) {
      tenants.push(input.tenantId);
    },
    async saveReceipt(input) {
      tenants.push(input.tenantId);
      receipts.push(input);
    },
  };
  return { store, tenants, leads, receipts, callCount: () => calls };
}

describe('generic telephony ingest', () => {
  it('writes only the integration company and ignores a tenant id in the body', async () => {
    const memory = memoryStore();
    const payload = {
      callerNumber: '9000000001',
      calledNumber: '8000000000',
      agent: 'Agent 1',
      callId: 'provider-call-1',
      callStatus: 'completed',
      duration: 42,
      tenantId: 'company-b',
    };
    const first = await ingestTelephonyCall({
      integration: { id: 'integration-a', tenantId: 'company-a', createdById: 'user-a' },
      payload,
      store: memory.store,
    });
    const second = await ingestTelephonyCall({
      integration: { id: 'integration-a', tenantId: 'company-a', createdById: 'user-a' },
      payload,
      store: memory.store,
    });

    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.createdLead).toBe(true);
      expect(first.leadNumber).toBe('LN000010');
    }
    expect(second.ok && second.duplicate).toBe(true);
    expect(memory.leads).toEqual([{ tenantId: 'company-a', id: 'lead-1', leadNumber: 'LN000010' }]);
    expect(memory.callCount()).toBe(1);
    expect(new Set(memory.tenants)).toEqual(new Set(['company-a']));
    expect(memory.tenants).not.toContain('company-b');
  });

  it('uses Unknown caller and the caller number when the provider sends no name', async () => {
    const created: Array<{ lastName: string; company: string; phone: string; tenantId: string }> = [];
    const store: TelephonyStore = {
      async findReceipt() { return null; },
      async findLeadByPhone() { return null; },
      async createLead(input) {
        created.push({ lastName: input.lastName, company: input.company, phone: input.phone, tenantId: input.tenantId });
        return { id: 'lead-1', leadNumber: 'LN000011', created: true };
      },
      async createCall() { return { id: 'call-1' }; },
      async applyStatus() {},
      async saveReceipt() {},
    };
    const result = await ingestTelephonyCall({
      integration: { id: 'integration-a', tenantId: 'company-a', createdById: 'user-a' },
      payload: { callerNumber: '+919000000000', callId: 'provider-call-2' },
      store,
    });
    expect(result.ok).toBe(true);
    expect(created).toEqual([{
      tenantId: 'company-a',
      lastName: 'Unknown caller',
      company: '+919000000000',
      phone: '+919000000000',
    }]);
  });
});
