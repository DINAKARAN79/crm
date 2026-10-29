import { randomBytes } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@dct-crm/db';
import { leadCreateSchema } from '@dct-crm/shared';
import { hashApiKey } from './apiKeys';
import { applyCallLogStatusRule } from './callLogStatus';
import { processLeadEnquiry } from './enquiryProcessing';
import { ingestTelephonyCall, type TelephonyStore } from './telephonyInbound';

export function generateTelephonySecret() {
  const integrationKey = `tel_${randomBytes(32).toString('base64url')}`;
  return { integrationKey, keyPrefix: integrationKey.slice(0, 12), keyHash: hashApiKey(integrationKey) };
}

export function publicTelephonyIntegration(record: {
  id: string;
  name: string;
  keyPrefix: string;
  ipAllowlist: string[];
  rateLimitPerMinute: number;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: record.id,
    name: record.name,
    keyPrefix: record.keyPrefix,
    ipAllowlist: record.ipAllowlist,
    rateLimitPerMinute: record.rateLimitPerMinute,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
    createdAt: record.createdAt,
  };
}

export async function listTelephonyIntegrations(tenantId: string) {
  const rows = await prisma.telephonyIntegration.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(publicTelephonyIntegration);
}

export async function createTelephonyIntegration(input: {
  tenantId: string;
  name: string;
  ipAllowlist: string[];
  rateLimitPerMinute: number;
  createdById: string;
}) {
  const active = await prisma.telephonyIntegration.findFirst({
    where: { tenantId: input.tenantId, revokedAt: null },
    select: { id: true },
  });
  if (active) {
    throw Object.assign(new Error('Rotate the existing connection or revoke it first.'), { status: 409 });
  }
  const secret = generateTelephonySecret();
  const record = await prisma.telephonyIntegration.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      keyPrefix: secret.keyPrefix,
      keyHash: secret.keyHash,
      ipAllowlist: input.ipAllowlist,
      rateLimitPerMinute: input.rateLimitPerMinute,
      createdById: input.createdById,
    },
  });
  return { record: publicTelephonyIntegration(record), integrationKey: secret.integrationKey };
}

export async function rotateTelephonyIntegration(tenantId: string, integrationId: string) {
  const existing = await prisma.telephonyIntegration.findFirst({ where: { id: integrationId, tenantId } });
  if (!existing || existing.revokedAt) {
    throw Object.assign(new Error('Telephony connection not found.'), { status: 404 });
  }
  const secret = generateTelephonySecret();
  const record = await prisma.telephonyIntegration.update({
    where: { id: existing.id },
    data: { keyPrefix: secret.keyPrefix, keyHash: secret.keyHash, lastUsedAt: null },
  });
  return { record: publicTelephonyIntegration(record), integrationKey: secret.integrationKey };
}

export async function revokeTelephonyIntegration(tenantId: string, integrationId: string) {
  const existing = await prisma.telephonyIntegration.findFirst({ where: { id: integrationId, tenantId } });
  if (!existing || existing.revokedAt) {
    throw Object.assign(new Error('Telephony connection not found.'), { status: 404 });
  }
  const record = await prisma.telephonyIntegration.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
  return publicTelephonyIntegration(record);
}

async function placementFor(db: Prisma.TransactionClient | typeof prisma, tenantId: string) {
  const users = await db.user.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, profile: { select: { name: true } } },
    take: 50,
  });
  const salesUserId = users.find((user) => /^sales(?:\b|$)/i.test(user.profile?.name || ''))?.id;
  if (salesUserId) return { salesUserId, projectId: undefined as string | undefined };
  const project = await db.project.findFirst({
    where: { tenantId },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return { salesUserId: undefined, projectId: project?.id };
}

function asLeadError(error: unknown): never {
  if (error instanceof Error && error.message === 'RR_PROJECT_REQUIRED') {
    throw Object.assign(new Error('A project is required to assign this lead to Pre Sales.'), { status: 409 });
  }
  throw error;
}

async function leadInTenant(tx: Prisma.TransactionClient, tenantId: string, leadId: string) {
  return tx.lead.findFirst({
    where: { id: leadId, tenantId },
    select: { id: true, leadNumber: true },
  });
}

function storeFor(tx: Prisma.TransactionClient): TelephonyStore {
  return {
    async findReceipt(tenantId, providerCallId) {
      const row = await tx.telephonyCallReceipt.findUnique({
        where: { tenantId_providerCallId: { tenantId, providerCallId } },
      });
      if (!row || row.tenantId !== tenantId) return null;
      const lead = await leadInTenant(tx, tenantId, row.leadId);
      return { leadId: row.leadId, leadNumber: lead?.leadNumber || null, callDetailId: row.callDetailId };
    },
    async findLeadByPhone(tenantId, values) {
      if (!values.length) return null;
      return tx.lead.findFirst({
        where: {
          tenantId,
          OR: [
            { phone: { in: values } },
            { mobile: { in: values } },
            { secondaryPhone: { in: values } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, leadNumber: true },
      });
    },
    async createLead(input) {
      const placement = await placementFor(tx, input.tenantId);
      const data = leadCreateSchema.parse({
        lastName: input.lastName,
        phone: input.phone,
        company: input.company,
        source: 'OTHER',
        ...(placement.projectId ? { projectId: placement.projectId } : {}),
      });
      const result = await processLeadEnquiry({
        tenantId: input.tenantId,
        userId: input.userId,
        salesUserId: placement.salesUserId,
        lead: data,
        enquiry: {
          source: 'OTHER',
          description: 'Telephony / Inbound call',
          countryCode: '91',
        },
      }, { transaction: tx });
      const leadIds = result.action === 'DUPLICATE_CONFLICT' || result.action === 'LEAD_MISMATCH'
        ? result.leadIds
        : [result.leadId];
      const lead = await tx.lead.findFirst({
        where: { id: { in: leadIds }, tenantId: input.tenantId },
        select: { id: true, leadNumber: true },
      });
      if (!lead) throw new Error('Lead was not created in this company.');
      return { id: lead.id, leadNumber: lead.leadNumber, created: result.action === 'NEW_LEAD' };
    },
    async createCall(input) {
      const endAt = new Date();
      const startAt = new Date(endAt.getTime() - Math.max(input.duration, 1) * 1000);
      const created = await tx.callDetail.create({
        data: {
          tenantId: input.tenantId,
          name: `Inbound ${input.providerCallId}`.slice(0, 255),
          callId: `${input.tenantId}:${input.providerCallId}`.slice(0, 255),
          callFrom: input.callerNumber.slice(0, 255),
          callTo: input.calledNumber?.slice(0, 50),
          landingNumber: input.calledNumber?.slice(0, 255),
          callType: 'INBOUND',
          duration: input.duration,
          startAt,
          endAt,
          status: input.callStatus,
          recordingFile: input.recordingUrl,
          notes: input.agent ? `Agent: ${input.agent}` : 'Telephony / Inbound call',
          leadId: input.leadId,
          createdById: input.userId,
        },
        select: { id: true },
      });
      return created;
    },
    async applyStatus(input) {
      await applyCallLogStatusRule(input.leadId, tx, {
        tenantId: input.tenantId,
        userId: input.userId,
        callLogId: input.callLogId,
      });
    },
    async saveReceipt(input) {
      await tx.telephonyCallReceipt.create({ data: input });
    },
  };
}

export async function ingestTelephonyIntegration(integration: {
  id: string;
  tenantId: string;
  createdById: string;
}, payload: unknown) {
  try {
    return await prisma.$transaction((tx) => ingestTelephonyCall({
      integration,
      payload,
      store: storeFor(tx),
    }));
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code !== 'P2002') throw error;
    const parsedCallId = payload && typeof payload === 'object' && 'callId' in payload ? String(payload.callId || '') : '';
    const receipt = parsedCallId
      ? await prisma.telephonyCallReceipt.findUnique({
        where: { tenantId_providerCallId: { tenantId: integration.tenantId, providerCallId: parsedCallId } },
      })
      : null;
    if (!receipt || receipt.tenantId !== integration.tenantId) throw error;
    const lead = await prisma.lead.findFirst({
      where: { id: receipt.leadId, tenantId: integration.tenantId },
      select: { leadNumber: true },
    });
    return {
      ok: true as const,
      duplicate: true,
      leadId: receipt.leadId,
      leadNumber: lead?.leadNumber || null,
      callDetailId: receipt.callDetailId,
      createdLead: false,
    };
  }
}

export async function createSandboxLead(tenantId: string, userId: string) {
  const national = `9${String(Date.now()).slice(-9)}`;
  const placement = await placementFor(prisma, tenantId);
  const data = leadCreateSchema.parse({
    lastName: 'Kumar',
    phone: `+91${national}`,
    company: 'Test Co',
    source: 'OTHER',
    ...(placement.projectId ? { projectId: placement.projectId } : {}),
  });
  let result;
  try {
    result = await processLeadEnquiry({
      tenantId,
      userId,
      salesUserId: placement.salesUserId,
      lead: data,
      enquiry: {
        source: 'OTHER',
        description: 'Sandbox lead from the API connection page',
        countryCode: '91',
      },
    });
  } catch (error) {
    asLeadError(error);
  }
  const leadIds = result.action === 'DUPLICATE_CONFLICT' || result.action === 'LEAD_MISMATCH'
    ? result.leadIds
    : [result.leadId];
  const lead = await prisma.lead.findFirst({
    where: { id: { in: leadIds }, tenantId },
    select: { id: true, leadNumber: true },
  });
  if (!lead?.leadNumber) throw new Error('The test lead was not created in this company.');
  return { leadId: lead.id, leadNumber: lead.leadNumber };
}

export async function sendTelephonyTestLead(tenantId: string, userId: string) {
  const integration = await prisma.telephonyIntegration.findFirst({
    where: { tenantId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!integration) throw Object.assign(new Error('Create a URL token first.'), { status: 400 });
  const result = await ingestTelephonyIntegration({ ...integration, createdById: userId }, {
    callerNumber: `+919${String(Date.now()).slice(-9)}`,
    calledNumber: '+918000000000',
    agent: 'Connection test',
    callId: `sandbox-${tenantId}-${Date.now()}`,
    callStatus: 'completed',
    duration: 5,
  });
  if (!result.ok) throw Object.assign(new Error(result.error), { status: result.status });
  if (!result.leadNumber) throw new Error('The test lead was not created in this company.');
  return { leadId: result.leadId, leadNumber: result.leadNumber };
}
