import { Router, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { listOrderBy, listViewConstraint, mergeListWhere } from '../services/listViewService';
import { authorize, authorizeEffectivePermission } from '../middleware/authorization';
import { auditLog } from '../middleware/audit';
import { canAccessLead } from '../services/recordAccess';
import { assignLeadToProjectRoundRobinInTransaction } from '../services/rrQueue';
import { quotationScheduleAmounts } from '@dct-crm/shared';

const router = Router();

const receiptInputSchema = z.object({
  bookingId: z.string().min(1),
  receiptDate: z.string().date(),
  receivedFrom: z.string().trim().min(1, 'Received from is required').max(200),
  amount: z.number().finite().positive('Amount must be greater than zero'),
  paymentMode: z.enum(['Cash', 'Cheque', 'Bank Transfer', 'UPI', 'Card', 'Other']),
  transactionId: z.string().trim().max(120).optional().nullable(),
  receivedDate: z.string().date(),
});

const dateAtNoonUtc = (value: string) => new Date(`${value}T12:00:00.000Z`);
const pdfDate = (value: Date) => value.toLocaleDateString('en-IN', { timeZone: 'UTC' });
const money = (amount: number) => `INR ${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
type InstallmentReceipt = {
  amount: number;
  kind: 'MIS_SUBMISSION' | 'CRM_PAYMENT';
  installmentIndex: number | null;
  receivedDate: Date;
};

const getInstallments = (paymentPlan: Prisma.JsonValue, totalPrice: number) => {
  if (!paymentPlan || typeof paymentPlan !== 'object' || Array.isArray(paymentPlan)) return [];
  const rawInstallments = paymentPlan.installments;
  if (!Array.isArray(rawInstallments)) return [];
  const parsed = rawInstallments.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const installment = value as Prisma.JsonObject;
    const percentage = Number(installment.percentage);
    if (!Number.isFinite(percentage) || percentage <= 0) return null;
    const dueDays = Number(installment.dueDays);
    return {
      index,
      milestone: typeof installment.milestone === 'string' ? installment.milestone : `Installment ${index + 1}`,
      percentage,
      dueMonths: Number(installment.dueMonths) || 0,
      ...(Number.isFinite(dueDays) ? { dueDays } : {}),
    };
  }).filter((installment): installment is NonNullable<typeof installment> => installment !== null);
  const amounts = quotationScheduleAmounts(totalPrice, parsed.map((installment) => installment.percentage));
  return parsed.map((installment, index) => ({ ...installment, amount: amounts[index] || 0 }));
};

const getInstallmentPaidAmounts = (
  installments: ReturnType<typeof getInstallments>,
  receipts: InstallmentReceipt[],
) => {
  const paid = installments.map(() => 0);
  for (const receipt of [...receipts].sort((a, b) => a.receivedDate.getTime() - b.receivedDate.getTime())) {
    if (receipt.kind === 'CRM_PAYMENT' && receipt.installmentIndex !== null) {
      const index = installments.findIndex((installment) => installment.index === receipt.installmentIndex);
      if (index >= 0) paid[index] += receipt.amount;
      continue;
    }
    let unallocated = receipt.amount;
    for (let index = 0; index < installments.length && unallocated > 0.005; index += 1) {
      const due = Math.max(0, installments[index].amount - paid[index]);
      const allocation = Math.min(due, unallocated);
      paid[index] += allocation;
      unallocated -= allocation;
    }
  }
  return paid;
};

const requireMISReviewer = (req: AuthRequest, res: Response, next: NextFunction) => {
  const isMIS = /^mis(?:\s|$)/i.test(req.user?.profileName?.trim() || '');
  if (req.user?.isSuperAdmin || req.user?.isAdmin || isMIS) return next();
  return res.status(403).json({ success: false, error: 'MIS profile access is required' });
};

const reviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().max(1000).optional(),
});

router.get(
  '/approvals',
  authenticate,
  requireMISReviewer,
  async (req: AuthRequest, res: Response) => {
    try {
      const where = { tenantId: req.user!.tenantId, kind: 'MIS_SUBMISSION' as const };
      const viewConstraint = await listViewConstraint(req, 'MIS_APPROVAL');
      if (!viewConstraint.ok) return res.status(viewConstraint.status).json({ success: false, error: viewConstraint.error });
      mergeListWhere(where, viewConstraint.where);
      const sorted = listOrderBy('MIS_APPROVAL', req.query.sortBy, req.query.sortOrder || 'desc');
      if (!sorted.ok) return res.status(400).json({ success: false, error: sorted.error });
      const receipts = await prisma.receipt.findMany({
        where,
        include: {
          lead: {
            select: {
              id: true,
              leadNumber: true,
              firstName: true,
              lastName: true,
              company: true,
              mobile: true,
              email: true,
              status: true,
              owner: { select: { id: true, firstName: true, lastName: true, profile: { select: { name: true } } } },
            },
          },
          booking: {
            include: {
              project: { select: { id: true, name: true, address: true, city: true } },
              unit: { select: { id: true, number: true, type: true, area: true, status: true } },
              quotation: {
                include: {
                  siteVisit: { select: { id: true, status: true, scheduledAt: true, completedAt: true } },
                },
              },
            },
          },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: (sorted.orderBy || { approvalSubmittedAt: 'desc' }) as { approvalSubmittedAt: 'desc' },
        take: 100,
      });
      return res.json({ success: true, data: receipts });
    } catch (error) {
      console.error('Failed to fetch MIS approval packets:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch approval packets' });
    }
  },
);

router.post(
  '/approvals/:receiptId/review',
  authenticate,
  requireMISReviewer,
  async (req: AuthRequest, res: Response) => {
    try {
      const input = reviewSchema.parse(req.body);
      const { tenantId, id: reviewerId } = req.user!;
      const result = await prisma.$transaction(async (tx) => {
        const receipt = await tx.receipt.findFirst({
          where: { id: req.params.receiptId, tenantId },
          include: {
            booking: { select: { id: true, leadId: true, projectId: true, unitId: true, status: true } },
          },
        });
        if (!receipt) throw new Error('RECEIPT_NOT_FOUND');
        if (receipt.kind !== 'MIS_SUBMISSION') throw new Error('NOT_MIS_SUBMISSION');
        if (receipt.approvalStatus !== 'PENDING_APPROVAL') throw new Error('RECEIPT_ALREADY_REVIEWED');

        const updated = await tx.receipt.updateMany({
          where: { id: receipt.id, tenantId, approvalStatus: 'PENDING_APPROVAL' },
          data: {
            approvalStatus: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            approvalReviewedAt: new Date(),
            reviewedById: reviewerId,
            approvalNote: input.note || null,
          },
        });
        if (updated.count !== 1) throw new Error('RECEIPT_ALREADY_REVIEWED');

        if (input.decision === 'APPROVE') {
          if (receipt.booking.status !== 'RESERVED') throw new Error('BOOKING_NOT_RESERVED');
          const assignment = await assignLeadToProjectRoundRobinInTransaction(tx, {
            tenantId,
            leadId: receipt.booking.leadId,
            projectId: receipt.booking.projectId,
            userType: 'CRM',
            actorId: reviewerId,
            reason: `MIS approved receipt ${receipt.receiptNumber}; assigned to CRM by round robin`,
            leadStatus: 'BOOKED',
          });
          const booked = await tx.booking.updateMany({
            where: { id: receipt.booking.id, tenantId, status: 'RESERVED' },
            data: { status: 'BOOKED', ownerId: assignment.assignedUserId },
          });
          if (booked.count !== 1) throw new Error('BOOKING_NOT_RESERVED');
          return { status: 'APPROVED' as const, assignment };
        }

        if (receipt.booking.status === 'RESERVED') {
          const cancelledBooking = await tx.booking.updateMany({
            where: { id: receipt.booking.id, tenantId, status: 'RESERVED' },
            data: { status: 'CANCELLED', bookingStage: 'CANCELLED' },
          });
          if (cancelledBooking.count === 1) {
            await tx.unit.updateMany({
              where: { id: receipt.booking.unitId, tenantId, status: 'RESERVED' },
              data: { status: 'AVAILABLE' },
            });
          }
        }
        return { status: 'REJECTED' as const, assignment: null };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      await auditLog(tenantId, reviewerId, 'UPDATE', 'Receipt', req.params.receiptId, undefined, {
        approvalStatus: result.status,
        note: input.note || null,
        assignedCRMUserId: result.assignment?.assignedUserId || null,
      }, req.ip);
      return res.json({ success: true, data: result });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Invalid review decision' });
      }
      if (error instanceof Error && error.message === 'RECEIPT_NOT_FOUND') {
        return res.status(404).json({ success: false, error: 'Approval packet not found' });
      }
      if (error instanceof Error && error.message === 'RECEIPT_ALREADY_REVIEWED') {
        return res.status(409).json({ success: false, error: 'This packet has already been reviewed' });
      }
      if (error instanceof Error && error.message === 'NOT_MIS_SUBMISSION') {
        return res.status(409).json({ success: false, error: 'Only MIS-submitted receipts can be reviewed' });
      }
      if (error instanceof Error && error.message === 'BOOKING_NOT_RESERVED') {
        return res.status(409).json({ success: false, error: 'This booking is no longer active and cannot be approved' });
      }
      if (error instanceof Error && (error.message.startsWith('RR_') || error.message.startsWith('NO_ELIGIBLE_RR_MEMBER:'))) {
        return res.status(409).json({ success: false, error: 'The CRM round-robin queue is not ready. Configure an active CRM queue before approving this packet.' });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        return res.status(409).json({ success: false, error: 'This packet changed while it was being reviewed. Refresh and try again.' });
      }
      console.error('Failed to review MIS approval packet:', error);
      return res.status(500).json({ success: false, error: 'Failed to review approval packet' });
    }
  },
);

router.get(
  '/lead/:leadId',
  authenticate,
  authorize('Lead', 'read'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.user!;
      const lead = await prisma.lead.findFirst({
        where: { id: req.params.leadId, tenantId },
        select: { id: true, tenantId: true, ownerId: true, creatorId: true },
      });
      if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
      if (!(await canAccessLead(req.user!, lead))) {
        return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
      }

      const receipts = await prisma.receipt.findMany({
        where: { tenantId, leadId: lead.id },
        include: {
          booking: {
            select: {
              id: true,
              bookingNumber: true,
              bookingAmount: true,
              quotation: { select: { quotationNumber: true, totalPrice: true } },
              project: { select: { name: true } },
              unit: { select: { number: true, area: true } },
            },
          },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: [{ receiptDate: 'desc' }, { createdAt: 'desc' }],
      });
      return res.json({ success: true, data: receipts });
    } catch (error) {
      console.error('Failed to fetch lead receipts:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch receipts' });
    }
  },
);

router.post(
  '/lead/:leadId',
  authenticate,
  authorize('Lead', 'edit'),
  async (req: AuthRequest, res: Response) => {
    try {
      const input = receiptInputSchema.parse(req.body);
      const { tenantId, id: userId } = req.user!;
      const lead = await prisma.lead.findFirst({
        where: { id: req.params.leadId, tenantId },
      });
      if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
      if (!(await canAccessLead(req.user!, lead))) {
        return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
      }

      const receipt = await prisma.$transaction(async (tx) => {
        const booking = await tx.booking.findFirst({
          where: { id: input.bookingId, tenantId, leadId: lead.id, status: 'RESERVED' },
          include: {
            quotation: { select: { totalPrice: true } },
          },
        });
        if (!booking) throw new Error('BOOKING_NOT_FOUND');
        const activeMisReceipt = await tx.receipt.findFirst({
          where: {
            tenantId,
            bookingId: booking.id,
            kind: 'MIS_SUBMISSION',
            approvalStatus: { in: ['PENDING_APPROVAL', 'APPROVED'] },
          },
          select: { id: true },
        });
        if (activeMisReceipt) throw new Error('INITIAL_RECEIPT_ALREADY_SENT');

        const [existingReceipts, sequence] = await Promise.all([
          tx.receipt.aggregate({
            where: { tenantId, bookingId: booking.id, approvalStatus: { in: ['PENDING_APPROVAL', 'APPROVED', 'ISSUED'] } },
            _sum: { amount: true },
          }),
          tx.sequence.upsert({
            where: { tenantId_type: { tenantId, type: 'RECEIPT' } },
            update: { nextValue: { increment: 1 } },
            create: { tenantId, type: 'RECEIPT', nextValue: 1 },
          }),
        ]);

        const alreadyReceived = existingReceipts._sum.amount || 0;
        if (alreadyReceived + input.amount > booking.quotation.totalPrice + 0.005) {
          throw new Error('RECEIPT_EXCEEDS_BALANCE');
        }

        const receiptNumber = `RC-${new Date().getFullYear()}-${String(sequence.nextValue).padStart(6, '0')}`;
        return tx.receipt.create({
          data: {
            tenantId,
            leadId: lead.id,
            bookingId: booking.id,
            createdById: userId,
            receiptNumber,
            receiptDate: dateAtNoonUtc(input.receiptDate),
            receivedFrom: input.receivedFrom,
            amount: input.amount,
            paymentMode: input.paymentMode,
            transactionId: input.transactionId || null,
            receivedDate: dateAtNoonUtc(input.receivedDate),
            kind: 'MIS_SUBMISSION',
            approvalStatus: 'PENDING_APPROVAL',
            approvalSubmittedAt: new Date(),
          },
          include: {
            booking: {
              select: {
                id: true,
                bookingNumber: true,
                project: { select: { name: true } },
                unit: { select: { number: true, area: true } },
              },
            },
            createdBy: { select: { id: true, firstName: true, lastName: true } },
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      await auditLog(tenantId, userId, 'CREATE', 'Receipt', receipt.id, undefined, {
        receiptNumber: receipt.receiptNumber,
        bookingId: receipt.bookingId,
        amount: receipt.amount,
        paymentMode: receipt.paymentMode,
      }, req.ip);
      return res.status(201).json({ success: true, data: receipt });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          field: error.issues[0]?.path.join('.'),
          error: error.issues[0]?.message || 'Invalid receipt details',
        });
      }
      if (error instanceof Error && error.message === 'BOOKING_NOT_FOUND') {
        return res.status(404).json({ success: false, error: 'A reserved booking is required to create a receipt' });
      }
      if (error instanceof Error && error.message === 'INITIAL_RECEIPT_ALREADY_SENT') {
        return res.status(409).json({ success: false, error: 'An initial receipt is already awaiting or has received MIS approval' });
      }
      if (error instanceof Error && error.message === 'RECEIPT_EXCEEDS_BALANCE') {
        return res.status(409).json({ success: false, error: 'Receipt amount exceeds the remaining quotation balance' });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        return res.status(409).json({ success: false, error: 'The payment balance changed. Refresh the receipt and try again.' });
      }
      console.error('Failed to create receipt:', error);
      return res.status(500).json({ success: false, error: 'Failed to create receipt' });
    }
  },
);

router.post(
  '/lead/:leadId/bookings/:bookingId/customer-receipt',
  authenticate,
  authorizeEffectivePermission('CRM_RECEIPT_CREATE'),
  async (req: AuthRequest, res: Response) => {
    try {
      const input = receiptInputSchema.omit({ bookingId: true, amount: true }).extend({
        amount: z.number().finite().positive('Amount must be greater than zero'),
        installmentIndex: z.number().int().min(0).optional(),
      }).parse(req.body);
      const { tenantId, id: userId } = req.user!;
      const lead = await prisma.lead.findFirst({
        where: { id: req.params.leadId, tenantId },
      });
      if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
      if (!(await canAccessLead(req.user!, lead))) {
        return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
      }

      const receipt = await prisma.$transaction(async (tx) => {
        const booking = await tx.booking.findFirst({
          where: { id: req.params.bookingId, tenantId, leadId: lead.id, status: { in: ['RESERVED', 'BOOKED'] } },
          include: { quotation: { select: { totalPrice: true, paymentPlan: true } } },
        });
        if (!booking) throw new Error('BOOKING_NOT_FOUND');

        const initialPayment = await tx.receipt.findFirst({
          where: {
            tenantId,
            bookingId: booking.id,
            kind: 'MIS_SUBMISSION',
            approvalStatus: 'APPROVED',
          },
          select: { id: true },
        });
        if (!initialPayment) throw new Error('MIS_RECEIPT_NOT_APPROVED');

        const paidReceipts = await tx.receipt.findMany({
          where: {
            tenantId,
            bookingId: booking.id,
            approvalStatus: { in: ['APPROVED', 'ISSUED'] },
          },
          select: { amount: true, kind: true, installmentIndex: true, receivedDate: true },
        });
        const alreadyPaid = paidReceipts.reduce((total, receipt) => total + receipt.amount, 0);
        const remainingBalance = Math.max(0, booking.quotation.totalPrice - alreadyPaid);
        if (remainingBalance <= 0.005) throw new Error('BALANCE_ALREADY_PAID');
        if (input.amount > remainingBalance + 0.005) throw new Error('RECEIPT_EXCEEDS_BALANCE');
        if (input.installmentIndex !== undefined) {
          const installments = getInstallments(booking.quotation.paymentPlan, booking.quotation.totalPrice);
          const installment = installments.find((item) => item.index === input.installmentIndex);
          if (!installment) throw new Error('INSTALLMENT_NOT_FOUND');
          const paidByInstallment = getInstallmentPaidAmounts(installments, paidReceipts);
          const installmentBalance = Math.max(0, installment.amount - (paidByInstallment[input.installmentIndex] || 0));
          if (installmentBalance <= 0.005) throw new Error('INSTALLMENT_ALREADY_PAID');
          if (input.amount > installmentBalance + 0.005) throw new Error('RECEIPT_EXCEEDS_INSTALLMENT');
        }

        const sequence = await tx.sequence.upsert({
          where: { tenantId_type: { tenantId, type: 'RECEIPT' } },
          update: { nextValue: { increment: 1 } },
          create: { tenantId, type: 'RECEIPT', nextValue: 1 },
        });
        const receiptNumber = `RC-${new Date().getFullYear()}-${String(sequence.nextValue).padStart(6, '0')}`;
        return tx.receipt.create({
          data: {
            tenantId,
            leadId: lead.id,
            bookingId: booking.id,
            createdById: userId,
            receiptNumber,
            receiptDate: dateAtNoonUtc(input.receiptDate),
            receivedFrom: input.receivedFrom,
            amount: input.amount,
            paymentMode: input.paymentMode,
            transactionId: input.transactionId || null,
            receivedDate: dateAtNoonUtc(input.receivedDate),
            kind: 'CRM_PAYMENT',
            approvalStatus: 'ISSUED',
            installmentIndex: input.installmentIndex ?? null,
          },
          include: {
            booking: {
              select: {
                id: true,
                bookingNumber: true,
                project: { select: { name: true } },
                unit: { select: { number: true, area: true } },
              },
            },
            createdBy: { select: { id: true, firstName: true, lastName: true } },
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      await auditLog(tenantId, userId, 'CREATE', 'Receipt', receipt.id, undefined, {
        receiptNumber: receipt.receiptNumber,
        bookingId: req.params.bookingId,
        kind: 'CRM_PAYMENT',
        amount: receipt.amount,
        paymentMode: receipt.paymentMode,
      }, req.ip);
      return res.status(201).json({ success: true, data: receipt });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Invalid receipt details' });
      }
      if (error instanceof Error && error.message === 'BOOKING_NOT_FOUND') {
        return res.status(404).json({ success: false, error: 'An active reserved booking is required' });
      }
      if (error instanceof Error && error.message === 'MIS_RECEIPT_NOT_APPROVED') {
        return res.status(409).json({ success: false, error: 'The initial receipt must be approved by MIS first' });
      }
      if (error instanceof Error && error.message === 'BALANCE_ALREADY_PAID') {
        return res.status(409).json({ success: false, error: 'The quotation balance is already paid' });
      }
      if (error instanceof Error && error.message === 'INSTALLMENT_NOT_FOUND') {
        return res.status(404).json({ success: false, error: 'The selected quotation installment was not found' });
      }
      if (error instanceof Error && error.message === 'INSTALLMENT_ALREADY_PAID') {
        return res.status(409).json({ success: false, error: 'The selected installment is already fully paid' });
      }
      if (error instanceof Error && error.message === 'RECEIPT_EXCEEDS_INSTALLMENT') {
        return res.status(409).json({ success: false, error: 'Payment exceeds the selected installment balance' });
      }
      if (error instanceof Error && error.message === 'RECEIPT_EXCEEDS_BALANCE') {
        return res.status(409).json({ success: false, error: 'Payment exceeds the remaining quotation balance' });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        return res.status(409).json({ success: false, error: 'The payment balance changed. Refresh and try again.' });
      }
      console.error('Failed to create CRM customer receipt:', error);
      return res.status(500).json({ success: false, error: 'Failed to create customer receipt' });
    }
  },
);

router.get(
  '/lead/:leadId/:receiptId/pdf',
  authenticate,
  authorize('Lead', 'read'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.user!;
      const lead = await prisma.lead.findFirst({
        where: { id: req.params.leadId, tenantId },
        select: { id: true, tenantId: true, ownerId: true, creatorId: true },
      });
      if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
      if (!(await canAccessLead(req.user!, lead))) {
        return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
      }

      const receipt = await prisma.receipt.findFirst({
        where: { id: req.params.receiptId, leadId: lead.id, tenantId },
        include: {
          booking: {
            include: {
              project: { select: { name: true, address: true, city: true } },
              unit: { select: { number: true, area: true, type: true } },
              quotation: { select: { pricePerSqFt: true, totalPrice: true, paymentPlan: true } },
            },
          },
        },
      });
      if (!receipt) return res.status(404).json({ success: false, error: 'Receipt not found' });
      if (receipt.approvalStatus !== 'APPROVED' && receipt.approvalStatus !== 'ISSUED') {
        return res.status(409).json({ success: false, error: 'This receipt is not approved for download' });
      }

      const linkedInstallment = receipt.installmentIndex === null
        ? null
        : getInstallments(receipt.booking.quotation.paymentPlan, receipt.booking.quotation.totalPrice)
          .find((installment) => installment.index === receipt.installmentIndex);
      const safeNumber = receipt.receiptNumber.replace(/[^A-Za-z0-9_-]/g, '-');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeNumber}.pdf"`);
      const document = new PDFDocument({ size: 'A4', margin: 50 });
      document.on('error', (error) => {
        console.error('Failed to generate receipt PDF:', error);
        if (!res.headersSent) res.status(500).end();
        else res.destroy(error);
      });
      document.pipe(res);

      document.font('Helvetica-Bold').fontSize(20).fillColor('#b42332')
        .text('PAYMENT RECEIPT', 55, 48, { align: 'center' });
      document.font('Helvetica').fontSize(9).fillColor('#475569')
        .text(receipt.booking.project.name, 55, 76, { align: 'center' });
      const address = [receipt.booking.project.address, receipt.booking.project.city].filter(Boolean).join(', ');
      if (address) document.text(address, 55, 90, { align: 'center' });
      document.moveTo(55, 115).lineTo(540, 115).strokeColor('#cbd5e1').stroke();

      const rows: Array<[string, string]> = [
        ['Receipt No.', receipt.receiptNumber],
        ['Booking No.', receipt.booking.bookingNumber],
        ['Date', pdfDate(receipt.receiptDate)],
        ['Project Name', receipt.booking.project.name],
        ['Received with thanks from', receipt.receivedFrom],
        ['Installment', linkedInstallment?.milestone || 'General payment'],
        ['For the sum of Rupees', `${money(receipt.amount)} (${receipt.amount.toLocaleString('en-IN')} only)`],
        ['Towards Plot No.', receipt.booking.unit.number],
        ['Area', receipt.booking.unit.area ? `${receipt.booking.unit.area.toLocaleString('en-IN')} sq ft` : '—'],
        ['Rate', money(receipt.booking.quotation.pricePerSqFt)],
        ['Amount', money(receipt.amount)],
        ['Mode', receipt.paymentMode],
        ['Transaction ID', receipt.transactionId || '—'],
        ['Received Date', pdfDate(receipt.receivedDate)],
      ];
      let y = 145;
      for (const [label, value] of rows) {
        if (y > 690) {
          document.addPage();
          y = 60;
        }
        document.font('Helvetica').fontSize(10).fillColor('#334155').text(label, 75, y, { width: 190 });
        document.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(value, 275, y, { width: 250 });
        document.moveTo(75, y + 22).lineTo(525, y + 22).strokeColor('#edf0f4').stroke();
        y += 37;
      }
      y += 16;
      document.font('Helvetica-Bold').fontSize(10).fillColor('#334155').text('Terms and Conditions', 75, y);
      document.font('Helvetica').fontSize(8).fillColor('#475569').text(
        'This is a computer-generated receipt and does not require a physical signature.\nPayment is non-refundable unless specified in the agreement.\nAll disputes are subject to local jurisdiction.\nPlease retain this receipt for your records.',
        75,
        y + 20,
        { width: 450, lineGap: 4 },
      );
      document.font('Helvetica').fontSize(9).fillColor('#334155')
        .text(`Receipt No: ${receipt.receiptNumber}`, 75, 745, { width: 450, align: 'right' });
      document.end();
      return;
    } catch (error) {
      console.error('Failed to export receipt PDF:', error);
      return res.status(500).json({ success: false, error: 'Failed to export receipt PDF' });
    }
  },
);

export default router;
