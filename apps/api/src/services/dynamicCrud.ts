import { prisma } from '@dct-crm/db';
import {
  getObjectDefinition,
  getFieldDefinitions,
  validateFieldValue,
  generateRecordNumber,
  applyFieldDefaults,
  invalidateCache,
} from './metadata';

interface ListOptions {
  page?: number;
  limit?: number;
  search?: string;
  filters?: Record<string, any>;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  userId?: string;
  ownerIds?: string[];
}

interface DynamicRecord {
  id: string;
  recordNumber: string | null;
  ownerId: string | null;
  data: Record<string, any>;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedBy: string | null;
  updatedAt: Date;
}

function parseJsonData(record: any): DynamicRecord {
  return {
    ...record,
    data: typeof record.data === 'string' ? JSON.parse(record.data) : record.data,
  };
}

export async function listRecords(tenantId: string, objectName: string, options: ListOptions) {
  const { page = 1, limit = 20, search, filters, sortBy = 'createdAt', sortOrder = 'desc' } = options;

  const object = await getObjectDefinition(tenantId, objectName);
  if (!object) throw new Error('Object not found');

  const skip = (Number(page) - 1) * Number(limit);

  const where: any = {
    tenantId,
    objectId: object.id,
    isActive: true,
  };

  if (options.ownerIds) {
    where.ownerId = { in: options.ownerIds };
  }

  if (filters && Object.keys(filters).length > 0) {
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        where.data = {
          ...where.data,
          path: [key],
          equals: value,
        };
      }
    }
  }

  if (search) {
    const fields = await getFieldDefinitions(tenantId, object.id);
    const searchableFields = fields.filter((f: any) => f.searchable);

    if (searchableFields.length > 0) {
      const searchConditions = searchableFields.map((f: any) => ({
        data: { path: [f.name], string_contains: search },
      }));

      where.OR = [
        { recordNumber: { contains: search, mode: 'insensitive' } },
        ...searchConditions,
      ];
    } else {
      where.recordNumber = { contains: search, mode: 'insensitive' };
    }
  }

  const orderBy: any = {};
  if (sortBy === 'createdAt' || sortBy === 'updatedAt' || sortBy === 'recordNumber') {
    orderBy[sortBy] = sortOrder;
  } else {
    orderBy.data = { path: [sortBy], sort: sortOrder };
  }

  const [records, total] = await Promise.all([
    prisma.customRecord.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy,
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    }),
    prisma.customRecord.count({ where }),
  ]);

  return {
    data: records.map(parseJsonData),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    },
  };
}

export async function getRecord(tenantId: string, objectName: string, recordId: string) {
  const object = await getObjectDefinition(tenantId, objectName);
  if (!object) throw new Error('Object not found');

  const record = await prisma.customRecord.findFirst({
    where: { id: recordId, tenantId, objectId: object.id },
    include: {
      owner: {
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      },
    },
  });

  if (!record) return null;
  return parseJsonData(record);
}

export async function getRecordByNumber(tenantId: string, objectName: string, recordNumber: string) {
  const object = await getObjectDefinition(tenantId, objectName);
  if (!object) throw new Error('Object not found');

  const record = await prisma.customRecord.findFirst({
    where: { tenantId, objectId: object.id, recordNumber },
    include: {
      owner: {
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      },
    },
  });

  if (!record) return null;
  return parseJsonData(record);
}

export async function createRecord(
  tenantId: string,
  objectName: string,
  data: Record<string, any>,
  userId: string
) {
  const object = await getObjectDefinition(tenantId, objectName);
  if (!object) throw new Error('Object not found');

  const fields = await getFieldDefinitions(tenantId, object.id);

  const processedData = await applyFieldDefaults(fields, data);

  for (const field of fields) {
    if (field.isSystemField) continue;
    const value = processedData[field.name];
    const validation = validateFieldValue(field, value);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
  }

  const recordNumber = await generateRecordNumber(tenantId, objectName);

  const record = await prisma.customRecord.create({
    data: {
      tenantId,
      objectId: object.id,
      recordNumber,
      ownerId: data.ownerId || userId,
      data: processedData,
      createdBy: userId,
      updatedBy: userId,
    },
    include: {
      owner: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: 'CREATE',
      objectType: `Custom:${objectName}`,
      objectId: record.id,
      newValues: processedData,
    },
  });

  invalidateCache(tenantId, objectName);
  return parseJsonData(record);
}

export async function updateRecord(
  tenantId: string,
  objectName: string,
  recordId: string,
  data: Record<string, any>,
  userId: string
) {
  const object = await getObjectDefinition(tenantId, objectName);
  if (!object) throw new Error('Object not found');

  let existing = await prisma.customRecord.findFirst({
    where: { id: recordId, tenantId, objectId: object.id },
  });
  if (!existing) {
    existing = await prisma.customRecord.findFirst({
      where: { recordNumber: recordId, tenantId, objectId: object.id },
    });
  }
  if (!existing) return null;

  const fields = await getFieldDefinitions(tenantId, object.id);
  const existingData = typeof existing.data === 'string' ? JSON.parse(existing.data as string) : existing.data;

  const mergedData = { ...existingData, ...data };

  for (const field of fields) {
    if (field.isSystemField) continue;
    if (field.name in data) {
      const value = mergedData[field.name];
      const validation = validateFieldValue(field, value);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }
  }

  const record = await prisma.customRecord.update({
    where: { id: existing.id },
    data: {
      data: mergedData,
      ownerId: data.ownerId || existing.ownerId,
      updatedBy: userId,
    },
    include: {
      owner: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: 'UPDATE',
      objectType: `Custom:${objectName}`,
      objectId: record.id,
      oldValues: existingData,
      newValues: mergedData,
    },
  });

  invalidateCache(tenantId, objectName);
  return parseJsonData(record);
}

export async function deleteRecord(
  tenantId: string,
  objectName: string,
  recordId: string,
  userId: string
) {
  const object = await getObjectDefinition(tenantId, objectName);
  if (!object) throw new Error('Object not found');

  let existing = await prisma.customRecord.findFirst({
    where: { id: recordId, tenantId, objectId: object.id },
  });
  if (!existing) {
    existing = await prisma.customRecord.findFirst({
      where: { recordNumber: recordId, tenantId, objectId: object.id },
    });
  }
  if (!existing) return null;

  const existingData = typeof existing.data === 'string' ? JSON.parse(existing.data as string) : existing.data;

  await prisma.customRecord.delete({ where: { id: existing.id } });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: 'DELETE',
      objectType: `Custom:${objectName}`,
      objectId: recordId,
      oldValues: existingData,
    },
  });

  invalidateCache(tenantId, objectName);
  return true;
}

export async function bulkCreateRecords(
  tenantId: string,
  objectName: string,
  records: Record<string, any>[],
  userId: string
) {
  const results = [];
  const errors: { index: number; error: string }[] = [];

  for (let i = 0; i < records.length; i++) {
    try {
      const record = await createRecord(tenantId, objectName, records[i], userId);
      results.push(record);
    } catch (error: any) {
      errors.push({ index: i, error: error.message });
    }
  }

  return { created: results.length, errors, records: results };
}

export async function bulkImportRecords(
  tenantId: string,
  objectName: string,
  records: Record<string, any>[],
  userId: string,
) {
  const object = await getObjectDefinition(tenantId, objectName);
  if (!object) throw new Error('Object not found');
  const fields = await getFieldDefinitions(tenantId, object.id);
  const prepared: Array<{ index: number; data: Record<string, any>; ownerId: string }> = [];
  const errors: { index: number; error: string }[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const data = await applyFieldDefaults(fields, records[index]);
    let validationError: string | undefined;
    for (const field of fields) {
      if (field.isSystemField) continue;
      const validation = validateFieldValue(field, data[field.name]);
      if (!validation.valid) {
        validationError = validation.error;
        break;
      }
    }
    if (validationError) {
      errors.push({ index, error: validationError });
      continue;
    }
    prepared.push({ index, data, ownerId: data.ownerId || userId });
  }

  const existingCount = await prisma.customRecord.count({
    where: { tenantId, objectId: object.id },
  });
  const prefix = objectName.substring(0, 2).toUpperCase();
  let created = 0;
  const batchSize = 500;

  for (let start = 0; start < prepared.length; start += batchSize) {
    const batch = prepared.slice(start, start + batchSize);
    const customRecords = batch.map(({ data, ownerId }, offset) => ({
      tenantId,
      objectId: object.id,
      recordNumber: `${prefix}-${String(existingCount + created + offset + 1).padStart(5, '0')}`,
      ownerId,
      data,
      createdBy: userId,
      updatedBy: userId,
    }));
    const auditLogs = batch.map(({ data }) => ({
      tenantId,
      userId,
      action: 'CREATE',
      objectType: `Custom:${objectName}`,
      newValues: data,
    }));

    try {
      await prisma.$transaction(async (transaction) => {
        await transaction.customRecord.createMany({ data: customRecords });
        await transaction.auditLog.createMany({ data: auditLogs });
      });
      created += batch.length;
    } catch (batchError) {
      console.error('Batched custom-record import failed; retrying the affected rows individually:', batchError);
      for (const { index, data } of batch) {
        try {
          await createRecord(tenantId, objectName, data, userId);
          created += 1;
        } catch (error: any) {
          errors.push({ index, error: error.message || 'Invalid row' });
        }
      }
    }
  }

  if (created > 0) invalidateCache(tenantId, objectName);
  return { created, errors };
}