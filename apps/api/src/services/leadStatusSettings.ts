import { prisma } from '@dct-crm/db';
import {
  getDefaultLeadStatusLabel,
  LEAD_STATUS_DEFINITIONS,
  leadStatusIdFromValue,
  leadStatusFromId,
} from '@dct-crm/shared';

export interface LeadStatusSettingValue {
  statusId: string;
  status: string;
  label: string;
  enabled: boolean;
}

export async function getLeadStatusSettings(tenantId: string): Promise<LeadStatusSettingValue[]> {
  await prisma.leadStatusSetting.createMany({
    data: LEAD_STATUS_DEFINITIONS.map((status) => ({
      tenantId,
      statusId: Number(status.id),
      label: status.defaultLabel,
    })),
    skipDuplicates: true,
  });

  const rows = await prisma.leadStatusSetting.findMany({
    where: { tenantId },
    orderBy: { statusId: 'asc' },
  });
  const rowById = new Map(rows.map((row) => [String(row.statusId), row]));

  return LEAD_STATUS_DEFINITIONS.map((definition) => {
    const row = rowById.get(definition.id);
    return {
      statusId: definition.id,
      status: definition.value,
      label: row?.label || getDefaultLeadStatusLabel(definition.value),
      enabled: row?.enabled ?? true,
    };
  });
}

export async function isLeadStatusEnabled(tenantId: string, status: string): Promise<boolean> {
  const statusId = leadStatusIdFromValue(status);
  if (!statusId) return false;
  const setting = await prisma.leadStatusSetting.findUnique({
    where: { tenantId_statusId: { tenantId, statusId: Number(statusId) } },
    select: { enabled: true },
  });
  return setting?.enabled ?? true;
}

export async function decorateLeadStatus<T extends { status: string }>(
  tenantId: string,
  lead: T,
): Promise<T & { statusId: string | null; statusLabel: string }> {
  const [decorated] = await decorateLeadStatuses(tenantId, [lead]);
  return decorated;
}

export async function decorateLeadStatuses<T extends { status: string }>(
  tenantId: string,
  leads: T[],
): Promise<Array<T & { statusId: string | null; statusLabel: string }>> {
  const settings = await getLeadStatusSettings(tenantId);
  const labelById = new Map(settings.map((item) => [item.statusId, item.label]));
  return leads.map((lead) => {
    const id = leadStatusIdFromValue(lead.status);
    return {
      ...lead,
      statusId: id || null,
      statusLabel: labelById.get(id || '') || getDefaultLeadStatusLabel(lead.status),
    };
  });
}

export async function decorateLeads<T extends { tenantId: string; status: string }>(
  leads: T[],
): Promise<Array<T & { statusId: string | null; statusLabel: string }>> {
  const tenantIds = [...new Set(leads.map((lead) => lead.tenantId))];
  const labelsByTenant = new Map<string, Map<string, string>>();
  await Promise.all(tenantIds.map(async (tenantId) => {
    const settings = await getLeadStatusSettings(tenantId);
    labelsByTenant.set(tenantId, new Map(settings.map((item) => [item.statusId, item.label])));
  }));
  return leads.map((lead) => {
    const statusId = leadStatusIdFromValue(lead.status);
    return {
      ...lead,
      statusId: statusId || null,
      statusLabel: labelsByTenant.get(lead.tenantId)?.get(statusId || '') || getDefaultLeadStatusLabel(lead.status),
    };
  });
}

export function resolveLeadStatus(statusId: string | number): string | undefined {
  return leadStatusFromId(statusId);
}
