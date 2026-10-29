import type { Prisma } from '@prisma/client';
import {
  PROSPECT_BEDROOM_OPTIONS,
  PROSPECT_BUDGET_OPTIONS,
  PROSPECT_PROPERTY_TYPE_OPTIONS,
  SITE_VISIT_RATING_OPTIONS,
} from '@dct-crm/shared';

/** Stored site-visit status. Quote Builder lists visits where status === this value. */
export const COMPLETED_SITE_VISIT_STATUS = 'COMPLETED' as const;

export const RESCHEDULED_REASON_PREFIX = 'Rescheduled to ';

const EARLIER_LEAD_STATUSES = new Set(['NEW', 'INCOMING', 'PROSPECT', 'SITE_VISIT_SCHEDULED']);

export class CompleteSiteVisitError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function leadStatusAfterCompletedVisit(status: string | null | undefined): 'SITE_VISIT_HAPPENED' | null {
  if (status && EARLIER_LEAD_STATUSES.has(status)) return 'SITE_VISIT_HAPPENED';
  return null;
}

export function parseCompletedAt(value: string, now = Date.now()): Date {
  const completedAt = new Date(value);
  if (Number.isNaN(completedAt.getTime())) {
    throw new CompleteSiteVisitError(400, 'Completed date and time are invalid');
  }
  if (completedAt.getTime() > now) {
    throw new CompleteSiteVisitError(400, 'Completed date and time cannot be in the future');
  }
  return completedAt;
}

export function assertVisitCanBeCompleted(
  visit: { status: string; cancellationReason?: string | null },
  rescheduled: boolean,
) {
  if (visit.status === 'COMPLETED') {
    throw new CompleteSiteVisitError(409, 'Site visit is already Completed');
  }
  const shownAsRescheduled = rescheduled || (
    visit.status === 'CANCELLED' &&
    (visit.cancellationReason || '').startsWith(RESCHEDULED_REASON_PREFIX)
  );
  if (visit.status === 'CANCELLED' && !shownAsRescheduled) {
    throw new CompleteSiteVisitError(409, 'Cancelled visits cannot be completed');
  }
  if (visit.status !== 'SCHEDULED' && !shownAsRescheduled) {
    throw new CompleteSiteVisitError(409, 'Only scheduled or rescheduled site visits can be completed');
  }
}

function optionList(
  value: string | string[] | undefined,
  allowed: readonly string[],
  label: string,
): string[] | undefined {
  if (value === undefined) return undefined;
  const items = (Array.isArray(value) ? value : [value]).map((item) => item.trim()).filter(Boolean);
  const invalid = items.find((item) => !allowed.includes(item));
  if (invalid) throw new CompleteSiteVisitError(400, `${label} is not a valid option`);
  return items;
}

function budgetValue(value: string | undefined, label: string): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!(PROSPECT_BUDGET_OPTIONS as readonly string[]).includes(trimmed)) {
    throw new CompleteSiteVisitError(400, `${label} is not a valid option`);
  }
  return trimmed;
}

type CompletionDb = {
  siteVisit: {
    updateMany: (args: any) => Promise<{ count: number }>;
    findFirst: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  };
  lead: {
    update: (args: any) => Promise<any>;
  };
  auditLog: {
    create: (args: any) => Promise<any>;
  };
};

export type CompleteSiteVisitCommand = {
  tenantId: string;
  siteVisitId: string;
  userId: string;
  actorName: string;
  profileName: string;
  completedAt: Date;
  rating: (typeof SITE_VISIT_RATING_OPTIONS)[number];
  feedback: string;
  minimumBudget?: string;
  maximumBudget?: string;
  propertyType?: string | string[];
  bedroomPreference?: string | string[];
  rescheduled: boolean;
};

const visitInclude = {
  lead: { select: { id: true, status: true, customFields: true } },
  project: { select: { id: true, name: true, allowedRadiusMeters: true } },
  assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
  creator: { select: { id: true, firstName: true, lastName: true, email: true, profile: { select: { name: true } } } },
  completedBy: { select: { id: true, firstName: true, lastName: true, email: true, profile: { select: { name: true } } } },
  cancelledBy: { select: { id: true, firstName: true, lastName: true, email: true, profile: { select: { name: true } } } },
  previousSiteVisit: { select: { id: true, siteVisitNumber: true, status: true, scheduledAt: true } },
};

export async function applySiteVisitCompletion(
  tx: CompletionDb,
  visit: {
    id: string;
    tenantId: string;
    leadId: string;
    status: string;
    cancellationReason?: string | null;
    customFields?: unknown;
    lead?: { id: string; status: string } | null;
  },
  command: CompleteSiteVisitCommand,
): Promise<{ siteVisit: any; leadStatus: string | null; idempotent: boolean }> {
  assertVisitCanBeCompleted(visit, command.rescheduled);
  const feedback = command.feedback.trim();
  if (!feedback) throw new CompleteSiteVisitError(400, 'Feedback is required');
  if (feedback.length > 2000) throw new CompleteSiteVisitError(400, 'Feedback must be 2000 characters or fewer');
  if (!(SITE_VISIT_RATING_OPTIONS as readonly string[]).includes(command.rating)) {
    throw new CompleteSiteVisitError(400, 'Rating is not a valid option');
  }

  const storedFields = visit.customFields && typeof visit.customFields === 'object' && !Array.isArray(visit.customFields)
    ? { ...(visit.customFields as Record<string, unknown>) }
    : {};
  const minimumBudget = budgetValue(command.minimumBudget, 'Minimum budget');
  const maximumBudget = budgetValue(command.maximumBudget, 'Maximum budget');
  const propertyType = optionList(command.propertyType, PROSPECT_PROPERTY_TYPE_OPTIONS, 'Property type');
  const bedroomPreference = optionList(command.bedroomPreference, PROSPECT_BEDROOM_OPTIONS, 'Bedroom preference');
  const customFields: Record<string, unknown> = {
    ...storedFields,
    schedule_rating: command.rating,
  };
  if (minimumBudget !== undefined) customFields.schedule_minimum_budget = minimumBudget;
  if (maximumBudget !== undefined) customFields.schedule_maximum_budget = maximumBudget;
  if (propertyType !== undefined) customFields.schedule_property_type = propertyType;
  if (bedroomPreference !== undefined) customFields.schedule_bedroom_preference = bedroomPreference;

  const updated = await tx.siteVisit.updateMany({
    where: {
      id: command.siteVisitId,
      tenantId: command.tenantId,
      OR: [
        { status: 'SCHEDULED' },
        { status: 'CANCELLED', cancellationReason: { startsWith: RESCHEDULED_REASON_PREFIX } },
      ],
    },
    data: {
      status: COMPLETED_SITE_VISIT_STATUS,
      completedAt: command.completedAt,
      completedById: command.userId,
      feedback,
      cancellationReason: null,
      cancelledAt: null,
      cancelledById: null,
      customFields: customFields as Prisma.InputJsonObject,
    },
  });

  if (updated.count !== 1) {
    const current = await tx.siteVisit.findFirst({
      where: { id: command.siteVisitId, tenantId: command.tenantId },
      include: visitInclude,
    });
    if (current?.status === 'COMPLETED') {
      return { siteVisit: current, leadStatus: current.lead?.status || null, idempotent: true };
    }
    throw new CompleteSiteVisitError(409, 'Site visit is already Completed');
  }

  const nextLeadStatus = leadStatusAfterCompletedVisit(visit.lead?.status);
  if (visit.lead && nextLeadStatus) {
    await tx.lead.update({
      where: { id: visit.lead.id },
      data: { status: nextLeadStatus },
    });
    await tx.auditLog.create({
      data: {
        tenantId: command.tenantId,
        userId: command.userId,
        leadId: visit.lead.id,
        action: 'STATUS_CHANGE',
        objectType: 'Lead',
        objectId: visit.lead.id,
        oldValues: { status: visit.lead.status },
        newValues: {
          status: nextLeadStatus,
          siteVisitId: visit.id,
          reason: 'Site visit completed',
        },
      },
    });
  }

  await tx.auditLog.create({
    data: {
      tenantId: command.tenantId,
      userId: command.userId,
      leadId: visit.leadId,
      action: 'SITE_VISIT_COMPLETED',
      objectType: 'SiteVisit',
      objectId: visit.id,
      oldValues: { status: visit.status },
      newValues: {
        status: COMPLETED_SITE_VISIT_STATUS,
        completedAt: command.completedAt.toISOString(),
        completedById: command.userId,
        rating: command.rating,
        feedback,
        summary: `${command.profileName || command.actorName} marked this visit as completed`,
      },
    },
  });

  const siteVisit = await tx.siteVisit.findFirst({
    where: { id: command.siteVisitId, tenantId: command.tenantId },
    include: visitInclude,
  });
  if (!siteVisit) throw new CompleteSiteVisitError(404, 'Site visit not found');
  return { siteVisit, leadStatus: nextLeadStatus || visit.lead?.status || null, idempotent: false };
}
