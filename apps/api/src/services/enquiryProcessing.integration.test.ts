import 'dotenv/config';
import express from 'express';
import jwt from 'jsonwebtoken';
import { afterAll, describe, expect, it } from 'vitest';
import { leadCreateSchema } from '@dct-crm/shared';
import { prisma } from '@dct-crm/db';
import { processLeadEnquiry, processLeadEnquiryBatch } from './enquiryProcessing';
import { leadRoutes } from '../routes/leads';

const integrationEnabled = process.env.LEAD_DUPLICATE_INTEGRATION === '1';
const createdPhones: Array<{ tenantId: string; phone: string }> = [];
const createdAuditIds: string[] = [];
const servers: Array<import('http').Server> = [];

afterAll(async () => {
  if (!integrationEnabled) return;
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
  if (createdAuditIds.length) {
    await prisma.auditLog.deleteMany({ where: { id: { in: createdAuditIds } } });
  }
  for (const item of createdPhones) {
    const leads = await prisma.lead.findMany({
      where: { tenantId: item.tenantId, phone: item.phone },
      select: { id: true },
    });
    const leadIds = leads.map((lead) => lead.id);
    if (!leadIds.length) continue;
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { leadId: { in: leadIds } } });
      await tx.enquiry.deleteMany({ where: { leadId: { in: leadIds } } });
      await tx.lead.deleteMany({ where: { id: { in: leadIds } } });
    });
  }
  await prisma.$disconnect();
});

describe.skipIf(!integrationEnabled)('live Lead duplicate integration', () => {
  async function getSalesUser() {
    const salesUser = await prisma.user.findFirst({
      where: {
        isActive: true,
        profile: { name: { equals: 'Sales', mode: 'insensitive' } },
        tenant: { isActive: true },
      },
      select: { id: true, tenantId: true, profile: { select: { name: true } } },
    });
    expect(salesUser).not.toBeNull();
    if (!salesUser) throw new Error('Integration test requires an active Sales user');
    return salesUser;
  }

  function createInput(
    salesUser: { id: string; tenantId: string; profile: { name: string } | null },
    suffix: string,
    source: 'WEBSITE' | 'REFERRAL',
    phone: string,
    email: string,
    projectId?: string,
  ) {
    return {
      tenantId: salesUser.tenantId,
      userId: salesUser.id,
      salesUserId: salesUser.id,
      profileName: salesUser.profile?.name,
      lead: leadCreateSchema.parse({
        firstName: 'Integration',
        lastName: `Integration-${suffix}`,
        company: `Integration-${suffix}`,
        phone,
        email,
        source,
        projectId,
      }),
      enquiry: {
        source,
        countryCode: '91',
        campaign: `integration-${source}`,
      },
    };
  }

  async function checkDuplicatesAs(user: {
    id: string;
    email: string;
    tenantId: string;
    isSuperAdmin: boolean;
  }, phone: string) {
    const app = express();
    app.use(express.json());
    app.use('/api/leads', leadRoutes);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
    const token = jwt.sign(user, process.env.JWT_SECRET!);
    return fetch(`http://127.0.0.1:${address.port}/api/leads/duplicates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ phone, countryCode: '91' }),
    });
  }

  async function createLeadAs(
    user: { id: string; email: string; tenantId: string; isSuperAdmin: boolean },
    body: Record<string, unknown>,
  ) {
    const app = express();
    app.use(express.json());
    app.use('/api/leads', leadRoutes);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
    const token = jwt.sign(user, process.env.JWT_SECRET!);
    return fetch(`http://127.0.0.1:${address.port}/api/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  }

  async function getLeadAs(
    user: { id: string; email: string; tenantId: string; isSuperAdmin: boolean },
    leadId: string,
  ) {
    const app = express();
    app.use(express.json());
    app.use('/api/leads', leadRoutes);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
    const token = jwt.sign(user, process.env.JWT_SECRET!);
    return fetch(`http://127.0.0.1:${address.port}/api/leads/${leadId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async function updateLeadAs(
    user: { id: string; email: string; tenantId: string; isSuperAdmin: boolean },
    leadId: string,
    body: Record<string, unknown>,
  ) {
    const app = express();
    app.use(express.json());
    app.use('/api/leads', leadRoutes);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
    const token = jwt.sign(user, process.env.JWT_SECRET!);
    return fetch(`http://127.0.0.1:${address.port}/api/leads/${leadId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  }

  it('serializes simultaneous duplicate enquiries and retains one Main Lead', async () => {
    const salesUser = await getSalesUser();

    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-10);
    const localPhone = `9${suffix.slice(1)}`;
    const phone = `+91${localPhone}`;
    const email = `duplicate-integration-${suffix}@example.invalid`;
    createdPhones.push({ tenantId: salesUser.tenantId, phone });
    const results = await Promise.all([
      processLeadEnquiry(createInput(salesUser, suffix, 'WEBSITE', localPhone, email)),
      processLeadEnquiry(createInput(salesUser, suffix, 'REFERRAL', localPhone, email)),
    ]);
    expect(results.map((result) => result.action).sort()).toEqual(['EXISTING_ACTIVE', 'NEW_LEAD']);
    expect(new Set(results.map((result) => result.leadId)).size).toBe(1);

    const persistedLeads = await prisma.lead.findMany({
      where: { tenantId: salesUser.tenantId, phone },
      select: { id: true, ownerId: true, projectId: true },
    });
    expect(persistedLeads).toHaveLength(1);
    expect(persistedLeads[0].ownerId).toBe(salesUser.id);
    expect(persistedLeads[0].projectId).toBeNull();
    expect(await prisma.enquiry.count({ where: { leadId: persistedLeads[0].id } })).toBeGreaterThanOrEqual(2);
  }, 30000);

  it('preserves the Main Lead project and links an enquiry for a different project', async () => {
    const salesUser = await getSalesUser();
    const projects = await prisma.project.findMany({
      where: { tenantId: salesUser.tenantId },
      select: { id: true },
      take: 2,
    });
    expect(projects).toHaveLength(2);
    if (projects.length < 2) throw new Error('Integration test requires two projects in the Sales user tenant');

    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-10);
    const localPhone = `9${suffix.slice(1)}`;
    const phone = `+91${localPhone}`;
    createdPhones.push({ tenantId: salesUser.tenantId, phone });
    const original = await processLeadEnquiry(createInput(
      salesUser,
      suffix,
      'WEBSITE',
      localPhone,
      `project-original-${suffix}@example.invalid`,
      projects[0].id,
    ));
    const followUp = await processLeadEnquiry(createInput(
      salesUser,
      `${suffix}-follow-up`,
      'REFERRAL',
      localPhone,
      `project-follow-up-${suffix}@example.invalid`,
      projects[1].id,
    ));
    await processLeadEnquiry(createInput(
      salesUser,
      `${suffix}-follow-up`,
      'REFERRAL',
      localPhone,
      `project-follow-up-${suffix}@example.invalid`,
      projects[1].id,
    ));

    expect(followUp.action).toBe('EXISTING_ACTIVE');
    expect(followUp.leadId).toBe(original.leadId);
    const mainLead = await prisma.lead.findUnique({
      where: { id: original.leadId },
      select: { projectId: true },
    });
    expect(mainLead?.projectId).toBe(projects[0].id);
    expect(await prisma.enquiry.findFirst({
      where: { leadId: original.leadId, projectId: projects[1].id },
      select: { id: true },
    })).not.toBeNull();
    expect(await prisma.enquiry.count({
      where: { leadId: original.leadId, projectId: projects[1].id },
    })).toBe(1);
  }, 30000);

  it('imports unique and already-matching enquiries atomically in one batch', async () => {
    const salesUser = await getSalesUser();
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-10);
    const anchorPhone = `9${suffix.slice(1)}`;
    const anchorEmail = `batch-anchor-${suffix}@example.invalid`;
    const uniquePhone = `8${suffix.slice(1)}`;
    const uniqueEmail = `batch-unique-${suffix}@example.invalid`;
    const storedPhone = `+91${anchorPhone}`;
    createdPhones.push(
      { tenantId: salesUser.tenantId, phone: storedPhone },
      { tenantId: salesUser.tenantId, phone: `+91${uniquePhone}` },
    );
    const anchor = await processLeadEnquiry(
      createInput(salesUser, suffix, 'WEBSITE', anchorPhone, anchorEmail),
    );
    const results = await processLeadEnquiryBatch([
      createInput(salesUser, `${suffix}-unique`, 'WEBSITE', uniquePhone, uniqueEmail),
      createInput(salesUser, `${suffix}-linked`, 'REFERRAL', anchorPhone, anchorEmail),
    ]);

    expect(results.map((result) => result.action)).toEqual(['NEW_LEAD', 'EXISTING_ACTIVE']);
    expect(results[1].leadId).toBe(anchor.leadId);
    expect(await prisma.lead.count({
      where: { tenantId: salesUser.tenantId, phone: { in: [`+91${anchorPhone}`, `+91${uniquePhone}`] } },
    })).toBe(2);
    expect(await prisma.enquiry.count({ where: { leadId: anchor.leadId } })).toBeGreaterThanOrEqual(2);
  }, 30000);

  it('rolls back earlier import rows on ambiguity while persisting a review audit', async () => {
    const salesUser = await getSalesUser();
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-10);
    const firstPhone = `+919${suffix.slice(1)}`;
    const secondPhone = `+918${suffix.slice(1)}`;
    const uniquePhone = `+917${suffix.slice(1)}`;
    const sharedEmail = `ambiguous-${suffix}@example.invalid`;
    const uniqueEmail = `unique-${suffix}@example.invalid`;
    const startedAt = new Date();
    createdPhones.push(
      { tenantId: salesUser.tenantId, phone: firstPhone },
      { tenantId: salesUser.tenantId, phone: secondPhone },
      { tenantId: salesUser.tenantId, phone: uniquePhone },
    );
    const firstLead = await prisma.lead.create({
      data: {
        tenantId: salesUser.tenantId,
        creatorId: salesUser.id,
        lastName: `Ambiguous-A-${suffix}`,
        company: `Ambiguous-A-${suffix}`,
        phone: firstPhone,
        countryCode: '+91',
        email: sharedEmail,
      },
      select: { id: true },
    });
    const secondLead = await prisma.lead.create({
      data: {
        tenantId: salesUser.tenantId,
        creatorId: salesUser.id,
        lastName: `Ambiguous-B-${suffix}`,
        company: `Ambiguous-B-${suffix}`,
        phone: secondPhone,
        countryCode: '+91',
        email: sharedEmail,
      },
      select: { id: true },
    });

    await expect(processLeadEnquiryBatch([
      createInput(salesUser, `${suffix}-new`, 'WEBSITE', `7${suffix.slice(1)}`, uniqueEmail),
      createInput(salesUser, `${suffix}-ambiguous`, 'REFERRAL', `6${suffix.slice(1)}`, sharedEmail),
    ])).rejects.toMatchObject({ message: 'DUPLICATE_CONFLICT', rowIndex: 1 });

    expect(await prisma.lead.count({
      where: { tenantId: salesUser.tenantId, phone: uniquePhone },
    })).toBe(0);
    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId: salesUser.tenantId,
        action: 'DUPLICATE_MATCH_AMBIGUOUS',
        objectType: 'LeadDuplicate',
        createdAt: { gte: startedAt },
      },
      select: { id: true, newValues: true },
    });
    const audit = logs.find((log) => {
      const values = log.newValues;
      return Boolean(values && typeof values === 'object' && !Array.isArray(values)
        && 'leadIds' in values
        && Array.isArray(values.leadIds)
        && values.leadIds.includes(firstLead.id)
        && values.leadIds.includes(secondLead.id));
    });
    expect(audit).toBeDefined();
    if (audit) createdAuditIds.push(audit.id);
  }, 30000);

  it('enforces Lead-create permissions and record visibility for duplicate previews', async () => {
    const dataEntryUser = await prisma.user.findFirst({
      where: {
        isActive: true,
        profile: { name: { equals: 'PreSales', mode: 'insensitive' } },
        tenant: { isActive: true },
      },
      select: { id: true, email: true, tenantId: true, isSuperAdmin: true },
    });
    const restrictedSalesUser = await prisma.user.findFirst({
      where: {
        isActive: true,
        profile: { name: { equals: 'Sales', mode: 'insensitive' } },
        tenant: { isActive: true },
      },
      select: { id: true, email: true, tenantId: true, isSuperAdmin: true },
    });
    expect(dataEntryUser).not.toBeNull();
    expect(restrictedSalesUser).not.toBeNull();
    if (!dataEntryUser || !restrictedSalesUser) {
      throw new Error('Integration test requires active PreSales and Sales users');
    }

    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-10);
    const phone = `+919${suffix.slice(1)}`;
    createdPhones.push({ tenantId: dataEntryUser.tenantId, phone });
    const lead = await prisma.lead.create({
      data: {
        tenantId: dataEntryUser.tenantId,
        creatorId: dataEntryUser.id,
        ownerId: dataEntryUser.id,
        lastName: `Permission-${suffix}`,
        company: `Permission-${suffix}`,
        phone,
        countryCode: '+91',
      },
      select: { id: true },
    });

    const allowed = await checkDuplicatesAs(dataEntryUser, phone.slice(3));
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({
      hasDuplicates: true,
      candidates: [{ id: lead.id }],
    });

    const linked = await createLeadAs(dataEntryUser, {
      firstName: 'Second',
      lastName: `Enquiry-${suffix}`,
      company: `Enquiry-${suffix}`,
      phone: phone.slice(3),
      countryCode: '91',
      source: 'REFERRAL',
    });
    expect(linked.status).toBe(200);
    expect(await linked.json()).toMatchObject({
      success: true,
      action: 'EXISTING_ACTIVE',
      leadId: lead.id,
    });
    expect(await prisma.lead.count({
      where: { tenantId: dataEntryUser.tenantId, phone },
    })).toBe(1);
    expect(await prisma.enquiry.count({ where: { leadId: lead.id } })).toBe(1);

    const detail = await getLeadAs(dataEntryUser, lead.id);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      success: true,
      data: { id: lead.id },
    });

    const editField = await updateLeadAs(dataEntryUser, lead.id, { rating: 'HOT' });
    expect(editField.status).toBe(200);
    const editedLead = await prisma.lead.findUnique({
      where: { id: lead.id },
      select: { rating: true, customFields: true },
    });
    expect(editedLead?.rating).toBe('HOT');

    const adsetField = await prisma.fieldDefinition.findFirst({
      where: {
        tenantId: dataEntryUser.tenantId,
        name: 'sf_Adset_Name__c',
        isActive: true,
      },
      select: { name: true },
    });
    expect(adsetField).not.toBeNull();
    if (!adsetField) throw new Error('Integration test requires the imported Salesforce Adset Name field');
    const importedValue = `inline-edit-${suffix}`;
    const editImportedField = await updateLeadAs(dataEntryUser, lead.id, {
      customFields: { [adsetField.name]: importedValue },
    });
    expect(editImportedField.status).toBe(200);
    const editedCustomFields = await prisma.lead.findUnique({
      where: { id: lead.id },
      select: { customFields: true },
    });
    expect(editedCustomFields?.customFields).toMatchObject({ [adsetField.name]: importedValue });

    const denied = await checkDuplicatesAs(restrictedSalesUser, phone.slice(3));
    expect(denied.status).toBe(403);
    expect(await denied.json()).not.toHaveProperty('candidates');
  }, 30000);
});
