import { z } from 'zod';
import { normalizeLeadPhone } from './leadDuplicateDetection';

const inboundSchema = z.object({
  callerNumber: z.string().trim().min(3).max(40).optional(),
  caller: z.string().trim().min(3).max(40).optional(),
  from: z.string().trim().min(3).max(40).optional(),
  calledNumber: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
  agent: z.string().trim().max(120).optional(),
  callId: z.string().trim().min(1).max(180).optional(),
  call_id: z.string().trim().min(1).max(180).optional(),
  callStatus: z.string().trim().max(40).optional(),
  status: z.string().trim().max(40).optional(),
  duration: z.coerce.number().int().min(0).max(86_400).optional(),
  recordingUrl: z.string().trim().max(255).optional(),
  recording_url: z.string().trim().max(255).optional(),
  callerName: z.string().trim().max(80).optional(),
  name: z.string().trim().max(80).optional(),
}).strip();

export type CallDetailStatus = 'COMPLETED' | 'NO_ANSWER' | 'BUSY' | 'VOICEMAIL' | 'CANCELLED';

export interface NormalizedInboundCall {
  callerNumber: string;
  calledNumber?: string;
  agent?: string;
  callId: string;
  callStatus: CallDetailStatus;
  duration: number;
  recordingUrl?: string;
  callerName?: string;
}

export interface TelephonyIntegrationRef {
  id: string;
  tenantId: string;
  createdById: string;
}

export interface TelephonyStore {
  findReceipt(tenantId: string, providerCallId: string): Promise<{ leadId: string; leadNumber: string | null; callDetailId: string | null } | null>;
  findLeadByPhone(tenantId: string, values: string[]): Promise<{ id: string; leadNumber: string | null } | null>;
  createLead(input: { tenantId: string; userId: string; lastName: string; phone: string; company: string }): Promise<{ id: string; leadNumber: string | null; created: boolean }>;
  createCall(input: {
    tenantId: string;
    userId: string;
    leadId: string;
    providerCallId: string;
    callerNumber: string;
    calledNumber?: string;
    agent?: string;
    callStatus: CallDetailStatus;
    duration: number;
    recordingUrl?: string;
  }): Promise<{ id: string }>;
  applyStatus(input: { tenantId: string; userId: string; leadId: string; callLogId: string }): Promise<void>;
  saveReceipt(input: { tenantId: string; integrationId: string; providerCallId: string; leadId: string; callDetailId: string }): Promise<void>;
}

function callStatus(value?: string): CallDetailStatus {
  const key = (value || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (['no_answer', 'noanswer', 'missed', 'unanswered'].includes(key)) return 'NO_ANSWER';
  if (key === 'busy') return 'BUSY';
  if (key === 'voicemail') return 'VOICEMAIL';
  if (['cancelled', 'canceled', 'failed', 'failure'].includes(key)) return 'CANCELLED';
  return 'COMPLETED';
}

function recordingUrl(value?: string) {
  if (!value || value.length > 255 || !/^https?:\/\//i.test(value)) return undefined;
  return value;
}

export function parseInboundCall(body: unknown): { ok: true; call: NormalizedInboundCall } | { ok: false; error: string } {
  const parsed = inboundSchema.safeParse(body || {});
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid call payload.' };
  const callerNumber = parsed.data.callerNumber || parsed.data.caller || parsed.data.from;
  const callId = parsed.data.callId || parsed.data.call_id;
  if (!callerNumber) return { ok: false, error: 'callerNumber is required.' };
  if (!callId) return { ok: false, error: 'callId is required.' };
  return {
    ok: true,
    call: {
      callerNumber,
      calledNumber: parsed.data.calledNumber || parsed.data.to,
      agent: parsed.data.agent,
      callId,
      callStatus: callStatus(parsed.data.callStatus || parsed.data.status),
      duration: parsed.data.duration ?? 0,
      recordingUrl: recordingUrl(parsed.data.recordingUrl || parsed.data.recording_url),
      callerName: parsed.data.callerName || parsed.data.name,
    },
  };
}

export function phoneMatchValues(raw: string) {
  const values = new Set<string>();
  const trimmed = raw.trim();
  if (trimmed) values.add(trimmed);
  for (const normalized of [normalizeLeadPhone(trimmed), normalizeLeadPhone(trimmed, '91')]) {
    if (!normalized) continue;
    values.add(normalized.e164);
    values.add(normalized.digits);
    if (normalized.countryCode && normalized.digits.startsWith(normalized.countryCode)) {
      values.add(normalized.digits.slice(normalized.countryCode.length));
    }
  }
  return [...values];
}

export function telephonyLeadDraft(call: NormalizedInboundCall) {
  const phone = normalizeLeadPhone(call.callerNumber) || normalizeLeadPhone(call.callerNumber, '91');
  const name = call.callerName?.trim();
  return {
    phone,
    lastName: name || 'Unknown caller',
    company: name || phone?.e164 || call.callerNumber,
  };
}

export async function ingestTelephonyCall(input: {
  integration: TelephonyIntegrationRef;
  payload: unknown;
  store: TelephonyStore;
}) {
  const parsed = parseInboundCall(input.payload);
  if (!parsed.ok) return { ok: false as const, status: 400, error: parsed.error };
  const draft = telephonyLeadDraft(parsed.call);
  if (!draft.phone) return { ok: false as const, status: 400, error: 'callerNumber is not a valid phone number.' };

  const tenantId = input.integration.tenantId;
  const replay = await input.store.findReceipt(tenantId, parsed.call.callId);
  if (replay) {
    return {
      ok: true as const,
      duplicate: true,
      leadId: replay.leadId,
      leadNumber: replay.leadNumber,
      callDetailId: replay.callDetailId,
      createdLead: false,
    };
  }

  const existing = await input.store.findLeadByPhone(tenantId, phoneMatchValues(parsed.call.callerNumber));
  const lead = existing
    ? { id: existing.id, leadNumber: existing.leadNumber, created: false }
    : await input.store.createLead({
      tenantId,
      userId: input.integration.createdById,
      lastName: draft.lastName,
      phone: draft.phone.e164,
      company: draft.company,
    });
  const call = await input.store.createCall({
    tenantId,
    userId: input.integration.createdById,
    leadId: lead.id,
    providerCallId: parsed.call.callId,
    callerNumber: draft.phone.e164,
    calledNumber: parsed.call.calledNumber,
    agent: parsed.call.agent,
    callStatus: parsed.call.callStatus,
    duration: parsed.call.duration,
    recordingUrl: parsed.call.recordingUrl,
  });
  await input.store.applyStatus({
    tenantId,
    userId: input.integration.createdById,
    leadId: lead.id,
    callLogId: call.id,
  });
  await input.store.saveReceipt({
    tenantId,
    integrationId: input.integration.id,
    providerCallId: parsed.call.callId,
    leadId: lead.id,
    callDetailId: call.id,
  });
  return {
    ok: true as const,
    duplicate: false,
    leadId: lead.id,
    leadNumber: lead.leadNumber,
    callDetailId: call.id,
    createdLead: lead.created,
  };
}
