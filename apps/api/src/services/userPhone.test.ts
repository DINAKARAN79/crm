import { describe, expect, it } from 'vitest';
import { normalizeUserPhone } from '@dct-crm/shared';
import { resolveUserPhoneChange } from './userPhone';
import { validateUserImportRow } from './userImport';
import { isHiddenUserField, omitHiddenUserFields } from './userObject';

describe('user phone', () => {
  it('stores a national number with the tenant country code', () => {
    expect(normalizeUserPhone('98765 43210', 'India')).toEqual({ e164: '+919876543210' });
    expect(normalizeUserPhone('(987) 654-3210', '91')).toEqual({ e164: '+919876543210' });
  });

  it('rejects a missing, lettered, or wrong-length phone', () => {
    expect(normalizeUserPhone('  ', '91')).toEqual({ error: 'Phone is required' });
    expect(normalizeUserPhone('98abc43210', '91')).toMatchObject({ error: expect.stringMatching(/10 to 15/) });
    expect(normalizeUserPhone('12345', '91')).toMatchObject({ error: expect.stringMatching(/10 to 15/) });
    expect(normalizeUserPhone('+1234567890123456', '91')).toMatchObject({ error: expect.stringMatching(/10 to 15/) });
  });

  it('requires a phone when creating or when an existing user has none', () => {
    expect(resolveUserPhoneChange({ mode: 'create', incomingPhone: undefined, country: '91' })).toEqual({
      ok: false,
      error: 'Phone is required',
    });
    expect(resolveUserPhoneChange({
      mode: 'update',
      existingPhone: null,
      incomingPhone: undefined,
      country: '91',
    })).toEqual({ ok: false, error: 'Phone is required' });
    expect(resolveUserPhoneChange({
      mode: 'update',
      existingPhone: '+919876543210',
      incomingPhone: undefined,
      country: '91',
    })).toEqual({ ok: true });
    expect(resolveUserPhoneChange({
      mode: 'create',
      incomingPhone: '98765 43210',
      country: 'India',
    })).toEqual({ ok: true, phone: '+919876543210' });
  });

  it('reports an import row without a phone', () => {
    expect(validateUserImportRow({ email: 'sam@example.com', firstName: 'Sam', phone: '' }, '91')).toEqual({
      error: 'Phone is required',
    });
    expect(validateUserImportRow({ email: 'sam@example.com', firstName: 'Sam', phone: '98765 43210' }, '91')).toMatchObject({
      phone: '+919876543210',
      email: 'sam@example.com',
    });
  });

  it('hides password and token fields from the User object', () => {
    expect(isHiddenUserField('passwordHash')).toBe(true);
    expect(isHiddenUserField('passwordResetToken')).toBe(true);
    expect(isHiddenUserField('phone')).toBe(false);
    expect(omitHiddenUserFields('User', [
      { name: 'phone' },
      { name: 'passwordHash' },
      { name: 'passwordResetExpires' },
    ]).map((field) => field.name)).toEqual(['phone']);
    expect(omitHiddenUserFields('Lead', [{ name: 'passwordHash' }])).toHaveLength(1);
  });
});
