import express from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bulkImportRecords, listRecords } from '../services/dynamicCrud';

const mocks = vi.hoisted(() => ({
  processLeadEnquiryBatch: vi.fn(),
  bulkImportRecords: vi.fn(),
  getObjectDefinition: vi.fn(),
  getFieldDefinitions: vi.fn(),
  findProject: vi.fn(),
  updateProject: vi.fn(),
  createUnit: vi.fn(),
  findUnit: vi.fn(),
  queryRaw: vi.fn(),
  findUser: vi.fn(),
  findLead: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    project: { findFirst: mocks.findProject, update: mocks.updateProject },
    unit: { create: mocks.createUnit, findFirst: mocks.findUnit },
    user: { findFirst: mocks.findUser },
    lead: { findFirst: mocks.findLead },
    $queryRaw: mocks.queryRaw,
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  },
  unitFieldTags: (unit: Record<string, unknown>) => ({
    Unit_Number__c: unit.number ?? null,
    Area__c: unit.areaField ?? null,
    Project__c: unit.projectId ?? null,
  }),
}));
vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'import-user', tenantId: 'tenant-a', profileName: 'Admin' };
    req.tenantId = 'tenant-a';
    next();
  },
}));
vi.mock('../middleware/permissions', () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../services/dynamicCrud', () => ({
  bulkImportRecords: mocks.bulkImportRecords,
  listRecords: vi.fn(),
}));
vi.mock('../services/metadata', () => ({
  getObjectDefinition: mocks.getObjectDefinition,
  getFieldDefinitions: mocks.getFieldDefinitions,
}));
vi.mock('../services/enquiryProcessing', () => ({
  processLeadEnquiry: vi.fn(),
  processLeadEnquiryBatch: mocks.processLeadEnquiryBatch,
  sourceEnumValue: (source: string) => source,
}));

import { dataAdministrationRoutes } from './dataAdministration';

const servers: Server[] = [];
const persistedCustomRecord = {
  id: 'custom-record',
  recordNumber: 'CU-00001',
  ownerId: 'import-user',
  data: { name: 'Persisted row' },
  isActive: true,
  createdBy: 'import-user',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedBy: 'import-user',
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

async function importLeads(csv: string, fields = ['firstName', 'lastName', 'phone', 'source']) {
  const app = express();
  app.use(express.json({ limit: '100mb' }));
  app.use('/api/data', dataAdministrationRoutes);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/data/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      objectName: 'Lead',
      fields,
      csv,
    }),
  });
}

async function importUnits(csv: string, fields: string[]) {
  const app = express();
  app.use(express.json({ limit: '100mb' }));
  app.use('/api/data', dataAdministrationRoutes);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/data/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectName: 'Unit', fields, csv }),
  });
}

async function importCustomObject(csv: string) {
  const app = express();
  app.use(express.json({ limit: '100mb' }));
  app.use('/api/data', dataAdministrationRoutes);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/data/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      objectName: 'CustomObject',
      fields: ['name'],
      csv,
    }),
  });
}

async function exportCustomObject() {
  const app = express();
  app.use(express.json());
  app.use('/api/data', dataAdministrationRoutes);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/data/export/CustomObject?tenantId=tenant-a&fields=name`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getObjectDefinition.mockResolvedValue({ id: 'lead-object' });
  mocks.findProject.mockResolvedValue({ id: 'project-a' });
  mocks.getFieldDefinitions.mockResolvedValue(
    ['firstName', 'lastName', 'phone', 'source'].map((name) => ({
      name,
      required: false,
      isActive: true,
      isSystemField: false,
      fieldType: 'text',
    })),
  );
  mocks.processLeadEnquiryBatch.mockResolvedValue([
    { action: 'NEW_LEAD', leadId: 'lead-a', lead: { id: 'lead-a' }, enquiry: { id: 'enquiry-a' } },
    { action: 'EXISTING_ACTIVE', leadId: 'lead-b', lead: { id: 'lead-b' }, enquiry: { id: 'enquiry-b' } },
  ]);
  mocks.bulkImportRecords.mockResolvedValue({ created: 1, errors: [] });
  mocks.createUnit.mockResolvedValue({ id: 'unit-1' });
  mocks.updateProject.mockResolvedValue({ id: 'project-a' });
  mocks.findUnit.mockResolvedValue(null);
  mocks.queryRaw.mockResolvedValue([]);
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('POST /api/data/import Lead batching', () => {
  it('submits all rows to one transactional batch operation and reports linked enquiries', async () => {
    const response = await importLeads(
      'firstName,lastName,phone,source\nNew,Unique,9876543210,WEBSITE\nExisting,Duplicate,9876543211,REFERRAL',
    );

    expect(response.status).toBe(201);
    expect(mocks.processLeadEnquiryBatch).toHaveBeenCalledOnce();
    expect(mocks.processLeadEnquiryBatch.mock.calls[0][0]).toHaveLength(2);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        count: 1,
        linkedEnquiries: 1,
        rowResults: [
          { index: 0, status: 'success' },
          { index: 1, status: 'success' },
        ],
      },
    });
  });

  it('accepts 50,000 lead rows and processes them in bounded batches', async () => {
    mocks.processLeadEnquiryBatch.mockImplementation(async (inputs: unknown[]) =>
      inputs.map(() => ({ action: 'NEW_LEAD' })),
    );
    const csv = [
      'firstName,lastName,phone,source',
      ...Array.from({ length: 50_000 }, (_, index) =>
        `Lead${index},Upload,98765${String(index).padStart(5, '0')},WEBSITE`,
      ),
    ].join('\n');

    const response = await importLeads(csv);

    expect(response.status).toBe(201);
    expect(mocks.processLeadEnquiryBatch).toHaveBeenCalledTimes(200);
    expect(mocks.processLeadEnquiryBatch.mock.calls.every(([batch]) => batch.length <= 250)).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { count: 50_000, linkedEnquiries: 0 },
    });
  }, 30_000);

  it('normalizes display labels for lead statuses before validation and import', async () => {
    mocks.getFieldDefinitions.mockResolvedValue([
      ...['firstName', 'lastName', 'phone', 'source'].map((name) => ({
        name,
        required: false,
        isActive: true,
        isSystemField: false,
        fieldType: 'text',
      })),
      { name: 'status', required: false, isActive: true, isSystemField: false, fieldType: 'picklist' },
    ]);

    const response = await importLeads(
      'firstName,lastName,phone,source,status\nNew,Unique,9876543210,WEBSITE,New\nSecond,Unique,9876543211,WEBSITE,Site Visit Scheduled',
      ['firstName', 'lastName', 'phone', 'source', 'status'],
    );

    expect(response.status).toBe(201);
    expect(mocks.processLeadEnquiryBatch.mock.calls[0][0]).toMatchObject([
      { lead: { status: 'NEW' } },
      { lead: { status: 'SITE_VISIT_SCHEDULED' } },
    ]);
  });

  it('resolves Salesforce allocated-project names to tenant projects for RR assignment', async () => {
    mocks.getFieldDefinitions.mockResolvedValue([
      ...['firstName', 'lastName', 'phone', 'source'].map((name) => ({
        name,
        required: false,
        isActive: true,
        isSystemField: false,
        fieldType: 'text',
      })),
      { name: 'sf_allocated_project__c', label: 'Allocated Project', required: false, isActive: true, isSystemField: false, fieldType: 'text' },
    ]);

    const response = await importLeads(
      'firstName,lastName,phone,source,sf_allocated_project__c\nNew,Unique,9876543210,WEBSITE,DCT Valley',
      ['firstName', 'lastName', 'phone', 'source', 'sf_allocated_project__c'],
    );

    expect(response.status).toBe(201);
    expect(mocks.findProject).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        isActive: true,
        OR: [
          { id: 'DCT Valley' },
          { name: { equals: 'DCT Valley', mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    expect(mocks.processLeadEnquiryBatch.mock.calls[0][0]).toMatchObject([
      { lead: { projectId: 'project-a' } },
    ]);
  });

  it('rejects allocated-project values that do not belong to the authenticated tenant', async () => {
    mocks.getFieldDefinitions.mockResolvedValue([
      ...['firstName', 'lastName', 'phone', 'source'].map((name) => ({
        name,
        required: false,
        isActive: true,
        isSystemField: false,
        fieldType: 'text',
      })),
      { name: 'sf_allocated_project__c', label: 'Allocated Project', required: false, isActive: true, isSystemField: false, fieldType: 'text' },
    ]);
    mocks.findProject.mockResolvedValue(null);

    const response = await importLeads(
      'firstName,lastName,phone,source,sf_allocated_project__c\nNew,Unique,9876543210,WEBSITE,Other Company Project',
      ['firstName', 'lastName', 'phone', 'source', 'sf_allocated_project__c'],
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Import failed on row 2: Project "Other Company Project" was not found for this company.',
    });
    expect(mocks.processLeadEnquiryBatch).not.toHaveBeenCalled();
  });

  it('reports a conflicting row as rolled back rather than claiming earlier rows persisted', async () => {
    mocks.processLeadEnquiryBatch.mockRejectedValue(
      Object.assign(new Error('DUPLICATE_CONFLICT'), { rowIndex: 1, leadIds: ['lead-a', 'lead-b'] }),
    );
    const response = await importLeads(
      'firstName,lastName,phone,source\nFirst,Unique,9876543210,WEBSITE\nOther,Ambiguous,9876543211,REFERRAL',
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      action: 'DUPLICATE_CONFLICT',
      row: 3,
      importedCount: 0,
      data: {
        rowResults: [
          { index: 0, status: 'failed' },
          { index: 1, status: 'failed', error: 'Import stopped at row 3: Multiple or changed duplicate matches require review.' },
        ],
      },
    });
  });

  describe('POST /api/data/import Unit', () => {
    it('writes Unit API names onto the unit columns', async () => {
      mocks.getObjectDefinition.mockResolvedValue({ id: 'unit-object' });
      mocks.findProject.mockResolvedValue({ id: 'project-test', name: 'test', projectType: null });
      mocks.getFieldDefinitions.mockResolvedValue([
        ['Project__c', 'lookup'],
        ['Unit_Number__c', 'text'],
        ['Unit_Type__c', 'picklist'],
        ['Block__c', 'text'],
        ['Floor__c', 'number'],
        ['Unit_Price__c', 'currency'],
        ['Area__c', 'number'],
        ['Status__c', 'picklist'],
        ['Buildup_Area__c', 'number'],
        ['Allowed_Discountt__c', 'text'],
        ['Minimum_Booking_Amount__c', 'number'],
      ].map(([name, fieldType]) => ({
        name,
        fieldType,
        required: false,
        isActive: true,
        isSystemField: false,
      })));

      const fields = [
        'Project__c', 'Unit_Number__c', 'Unit_Type__c', 'Block__c', 'Floor__c', 'Unit_Price__c',
        'Area__c', 'Status__c', 'Buildup_Area__c', 'Allowed_Discountt__c', 'Minimum_Booking_Amount__c',
      ];
      const response = await importUnits(
        [
          fields.join(','),
          'test,A-101,Apartment,Block 1,1,5270000,850,AVAILABLE,720,50000,100000',
        ].join('\n'),
        fields,
      );

      expect(response.status).toBe(201);
      expect(mocks.createUnit).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          projectId: 'project-test',
          number: 'A-101',
          type: 'Apartment',
          block: 'Block 1',
          floor: 1,
          price: 5270000,
          status: 'AVAILABLE',
          buildupArea: 720,
          allowedDiscount: '50000',
          minimumBookingAmount: 100000,
          createdById: 'import-user',
          unitCode: 'U-0001',
          customFields: expect.objectContaining({ Area__c: 850, Unit_Number__c: 'A-101' }),
        }),
      });
      const created = mocks.createUnit.mock.calls[0][0].data;
      expect(created).not.toHaveProperty('Unit_Number__c');
      expect(created).not.toHaveProperty('creatorId');
      expect(created).not.toHaveProperty('Project__c');
    });
  });

  describe('POST /api/data/import custom objects', () => {
    it('returns row-specific required-field failures without importing any rows', async () => {
      mocks.getObjectDefinition.mockResolvedValue({ id: 'custom-object' });
      mocks.getFieldDefinitions.mockResolvedValue([
        { name: 'name', required: true, isActive: true, isSystemField: false, fieldType: 'text' },
      ]);

      const response = await importCustomObject('name\n""\nValid row');

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        data: {
          count: 0,
          errors: [{ index: 0, error: 'Import failed on row 2: Empty required fields: name' }],
          rowResults: [
            { index: 0, status: 'failed', error: 'Import failed on row 2: Empty required fields: name' },
            { index: 1, status: 'failed', error: 'Not imported because validation failed on row 2.' },
          ],
        },
      });
      expect(bulkImportRecords).not.toHaveBeenCalled();
    });

    it('persists custom rows in the authenticated tenant and returns the created count', async () => {
      mocks.getObjectDefinition.mockResolvedValue({ id: 'custom-object' });
      mocks.getFieldDefinitions.mockResolvedValue([
        { name: 'name', required: true, isActive: true, isSystemField: false, fieldType: 'text' },
      ]);
      vi.mocked(bulkImportRecords).mockResolvedValue({
        created: 1,
        errors: [],
      });

      const response = await importCustomObject('name\nPersisted row');

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({
        success: true,
        data: {
          created: 1,
          rowResults: [{ index: 0, status: 'success' }],
        },
      });
      expect(bulkImportRecords).toHaveBeenCalledWith(
        'tenant-a',
        'CustomObject',
        [{ name: 'Persisted row' }],
        'import-user',
      );
    });

    it('does not return a success response when every custom row failed', async () => {
      mocks.getObjectDefinition.mockResolvedValue({ id: 'custom-object' });
      mocks.getFieldDefinitions.mockResolvedValue([
        { name: 'name', required: true, isActive: true, isSystemField: false, fieldType: 'text' },
      ]);
      vi.mocked(bulkImportRecords).mockResolvedValue({
        created: 0,
        errors: [{ index: 0, error: 'Name is required' }],
      });

      const response = await importCustomObject('name\nAttempt');

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        success: false,
        error: 'No records were imported. Name is required',
        data: {
          created: 0,
          errors: [{ index: 0, error: 'Name is required' }],
          rowResults: [{ index: 0, status: 'failed', error: 'Name is required' }],
        },
      });
    });
  });

  describe('GET /api/data/export custom objects', () => {
    it('does not treat the selected tenant query as a record field filter', async () => {
      vi.mocked(listRecords).mockResolvedValue({
        data: [persistedCustomRecord],
        pagination: { page: 1, limit: 1000, total: 1, totalPages: 1 },
      });

      const response = await exportCustomObject();

      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toContain('Persisted row');
      expect(listRecords).toHaveBeenCalledWith('tenant-a', 'CustomObject', expect.objectContaining({
        filters: undefined,
      }));
    });
  });
});
