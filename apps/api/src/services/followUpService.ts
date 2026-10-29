import type { Prisma, PrismaClient } from '@prisma/client';

type Db = Prisma.TransactionClient | PrismaClient;

export function futureFollowUpError(dueDate: string, now = Date.now()): string | null {
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 'Follow-up date and time are invalid.';
  if (due.getTime() <= now) return 'Follow-up can only be scheduled for a future date and time.';
  return null;
}

export async function getNextFollowUpNumber(db: Db, tenantId: string): Promise<string> {
  const sequence = await db.sequence.upsert({
    where: { tenantId_type: { tenantId, type: 'FOLLOW_UP' } },
    update: { nextValue: { increment: 1 } },
    create: { tenantId, type: 'FOLLOW_UP', nextValue: 1 },
  });

  return `FU-${String(sequence.nextValue).padStart(6, '0')}`;
}

export async function resolveFollowUpLinks(
  db: Db,
  tenantId: string,
  input: { leadId?: string | null; enquiryId?: string | null; bookingId?: string | null },
) {
  let leadId = input.leadId || null;
  const enquiryId = input.enquiryId || null;
  const bookingId = input.bookingId || null;

  if (enquiryId) {
    const enquiry = await db.enquiry.findFirst({
      where: { id: enquiryId, tenantId },
      select: { leadId: true },
    });
    if (!enquiry) return { error: 'Enquiry not found' as const };
    if (leadId && leadId !== enquiry.leadId) {
      return { error: 'The selected Lead does not match the Enquiry' as const };
    }
    leadId = enquiry.leadId;
  }

  if (bookingId) {
    const booking = await db.booking.findFirst({
      where: { id: bookingId, tenantId },
      select: { leadId: true },
    });
    if (!booking) return { error: 'Booking not found' as const };
    if (leadId && leadId !== booking.leadId) {
      return { error: 'The selected Lead does not match the Booking' as const };
    }
    leadId = leadId || booking.leadId;
  }

  return { leadId, enquiryId, bookingId };
}

export function followUpStatus(input: { isCompleted: boolean; isMissed: boolean; status?: string | null }) {
  if (input.status === 'CANCELLED') return 'CANCELLED';
  if (input.isCompleted) return 'COMPLETED';
  if (input.isMissed) return 'MISSED';
  return 'SCHEDULED';
}

export function presentFollowUp<T extends {
  dueDate: Date | string;
  isCompleted: boolean;
  isMissed: boolean;
  status?: string | null;
  lead?: { createdAt?: Date | string | null; phone?: string | null; mobile?: string | null; source?: string | null; status?: string | null } | null;
  owner?: { profile?: { name?: string | null } | null } | null;
}>(row: T, context?: { followupDateBefore?: Date | null; pastScheduleFollowUps?: string | null }) {
  const profileName = row.owner?.profile?.name || null;
  return {
    ...row,
    status: followUpStatus(row),
    scheduledDate: row.dueDate,
    followUpConducted: row.isCompleted,
    isMissedFollowup: row.isMissed,
    leadCreatedDate: row.lead?.createdAt || null,
    leadPrimaryPhone: row.lead?.phone || null,
    leadSource: row.lead?.source || null,
    leadStatus: row.lead?.status || null,
    secondaryMobile: row.lead?.mobile || null,
    ownerProfileName: profileName,
    isOwnerPreSale: Boolean(profileName && /pre[\s-]*sale/i.test(profileName)),
    followupDateBefore: context?.followupDateBefore || null,
    pastScheduleFollowUps: context?.pastScheduleFollowUps || null,
  };
}
