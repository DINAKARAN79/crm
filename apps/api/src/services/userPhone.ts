import { normalizeUserPhone, PHONE_REQUIRED_MESSAGE } from '@dct-crm/shared';

export function resolveUserPhoneChange(input: {
  mode: 'create' | 'update';
  existingPhone?: string | null;
  incomingPhone: string | null | undefined;
  country?: string | null;
}): { ok: true; phone?: string } | { ok: false; error: string } {
  const incoming = input.incomingPhone;
  const provided = incoming !== undefined && incoming !== null;
  if (!provided) {
    if (input.mode === 'create' || !input.existingPhone?.trim()) {
      return { ok: false, error: PHONE_REQUIRED_MESSAGE };
    }
    return { ok: true };
  }

  const normalized = normalizeUserPhone(incoming, input.country);
  if ('error' in normalized) return { ok: false, error: normalized.error };
  return { ok: true, phone: normalized.e164 };
}
