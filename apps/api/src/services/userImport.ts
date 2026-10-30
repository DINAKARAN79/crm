import bcrypt from 'bcryptjs';
import { prisma } from '@dct-crm/db';
import { PHONE_REQUIRED_MESSAGE } from '@dct-crm/shared';
import { resolveUserPhoneChange } from './userPhone';

export type UserImportRowResult = {
  index: number;
  status: 'success' | 'failed';
  error?: string;
};

export function validateUserImportRow(
  row: Record<string, string>,
  country?: string | null,
): { email: string; firstName: string; lastName: string; phone: string; password?: string } | { error: string } {
  const email = String(row.email ?? '').trim().toLowerCase();
  const firstName = String(row.firstName ?? '').trim();
  const lastName = String(row.lastName ?? '').trim();
  const password = String(row.password ?? '').trim();
  if (['isLoggedIn', 'lastLoginAt', 'lastSeenAt', 'lastLogoutAt'].some((key) => key in row && String(row[key] ?? '').trim() !== '')) {
    return { error: 'System login fields cannot be imported' };
  }
  if (!email) return { error: 'Email is required' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Email is invalid' };
  if (!firstName) return { error: 'First name is required' };
  if (!String(row.phone ?? '').trim()) return { error: PHONE_REQUIRED_MESSAGE };
  const phone = resolveUserPhoneChange({
    mode: 'create',
    incomingPhone: row.phone,
    country,
  });
  if (!phone.ok || !phone.phone) return { error: phone.ok ? PHONE_REQUIRED_MESSAGE : phone.error };
  if (password && password.length < 8) return { error: 'Password must be at least 8 characters' };
  return { email, firstName, lastName, phone: phone.phone, ...(password ? { password } : {}) };
}

export async function importUserRows(input: {
  tenantId: string;
  actorId: string;
  rows: Record<string, string>[];
}) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: { country: true },
  });
  const importErrors: { index: number; error: string }[] = [];
  const rowResults: UserImportRowResult[] = [];
  let importedCount = 0;

  for (let index = 0; index < input.rows.length; index += 1) {
    const parsed = validateUserImportRow(input.rows[index], tenant?.country);
    if ('error' in parsed) {
      const error = `Import failed on row ${index + 2}: ${parsed.error}`;
      importErrors.push({ index, error });
      rowResults.push({ index, status: 'failed', error });
      continue;
    }
    try {
      const passwordHash = await bcrypt.hash(parsed.password || Math.random().toString(36).slice(-12), 12);
      const user = await prisma.user.create({
        data: {
          tenantId: input.tenantId,
          email: parsed.email,
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          phone: parsed.phone,
          passwordHash,
        },
        select: { id: true },
      });
      await prisma.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.actorId,
          action: 'CREATE',
          objectType: 'User',
          objectId: user.id,
          newValues: { email: parsed.email, firstName: parsed.firstName, phone: parsed.phone, source: 'import' },
        },
      });
      importedCount += 1;
      rowResults.push({ index, status: 'success' });
    } catch (error: any) {
      const duplicate = error?.code === 'P2002';
      const errorMessage = duplicate
        ? `Import failed on row ${index + 2}: This email is already being used in this company.`
        : `Import failed on row ${index + 2}: ${error?.message || 'Invalid row'}`;
      importErrors.push({ index, error: errorMessage });
      rowResults.push({ index, status: 'failed', error: errorMessage });
    }
  }

  return { importedCount, importErrors, rowResults };
}
