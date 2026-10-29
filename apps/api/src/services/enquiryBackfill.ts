import { prisma } from '@dct-crm/db';
import { enquiryBackfillKey, extractEnquiryAttributes, mergeEnquiryAttributes } from './enquiryFieldMap';
import { createEnquiryInTransaction } from './enquiryService';

export interface EnquiryBackfillReport {
  scanned: number;
  updated: number;
  created: number;
  skipped: number;
  failed: { leadId: string; error: string }[];
}

export async function backfillEnquiryAttributes(tenantId?: string): Promise<EnquiryBackfillReport> {
  const report: EnquiryBackfillReport = { scanned: 0, updated: 0, created: 0, skipped: 0, failed: [] };
  const batchSize = 100;
  let cursor: string | undefined;

  for (;;) {
    const leads = await prisma.lead.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        tenantId: true,
        ownerId: true,
        creatorId: true,
        source: true,
        customFields: true,
      },
    });
    if (!leads.length) break;
    cursor = leads[leads.length - 1].id;

    for (const lead of leads) {
      report.scanned += 1;
      const incoming = extractEnquiryAttributes(lead.customFields);
      try {
        const existing = await prisma.enquiry.findFirst({
          where: { tenantId: lead.tenantId, leadId: lead.id },
          orderBy: { createdAt: 'asc' },
          select: { id: true, attributes: true, ownerId: true },
        });
        if (existing) {
          const merged = mergeEnquiryAttributes(existing.attributes, incoming);
          const changed = JSON.stringify(merged) !== JSON.stringify(existing.attributes || {});
          const ownerMissing = !existing.ownerId && lead.ownerId;
          if (!changed && !ownerMissing) {
            report.skipped += 1;
            continue;
          }
          await prisma.enquiry.update({
            where: { id: existing.id },
            data: {
              ...(changed ? { attributes: merged } : {}),
              ...(ownerMissing ? { ownerId: lead.ownerId } : {}),
            },
          });
          report.updated += 1;
          continue;
        }

        if (!Object.keys(incoming).length) {
          report.skipped += 1;
          continue;
        }
        await prisma.$transaction((tx) => createEnquiryInTransaction(tx, {
          tenantId: lead.tenantId,
          leadId: lead.id,
          leadType: 'ORIGINAL',
          enquiryType: 'ORIGINAL',
          source: lead.source || 'OTHER',
          originalSubmissionId: enquiryBackfillKey(lead.id),
          attributes: incoming,
          ownerId: lead.ownerId,
          userId: lead.creatorId,
        }));
        report.created += 1;
      } catch (error) {
        report.failed.push({
          leadId: lead.id,
          error: error instanceof Error ? error.message : 'Backfill failed',
        });
      }
    }
    if (leads.length < batchSize) break;
  }

  return report;
}
