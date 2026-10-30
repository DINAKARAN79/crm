import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./leadNotes', () => ({ appendLeadProcessNote: vi.fn() }));

import {
  CLICK_TO_CALL_PAYLOAD_KEYS,
  buildClickToCallPayload,
  placeClickToCall,
  probeTelephonyConnection,
  readCallIdPath,
  recordClickAttempt,
  resetClickToCallGuards,
  sanitizeProviderBody,
  type ClickToCallLead,
} from './clickToCall';
import { readClickToCallRequest } from '../routes/telephonyClickToCall';
import { TelephonyCredentialError } from './telephonyCredentials';
import { assertClickToCallUrl, migrateClickToCallUrl } from './telephonyUrl';
import { publicTelephonySettings } from './telephonySettings';
import { decryptTelephonyToken, encryptTelephonyToken } from './telephonyCredentials';

const SECRET = 'super-secret-token';
const USER = { id: 'cmup3jc0m007ir1pnj1ic1a9u', tenantId: 'cmup3jbyv0000r1pndvbpn4my', isAdmin: false };

function lead(overrides: Partial<ClickToCallLead> = {}): ClickToCallLead {
  return {
    id: 'cmvtngb2g003q11l1lytc08n7',
    tenantId: USER.tenantId,
    ownerId: 'other-user',
    creatorId: USER.id,
    firstName: 'Pam',
    lastName: 'Beesly',
    company: 'Dunder Mifflin',
    phone: '9876543210',
    mobile: null,
    secondaryPhone: null,
    countryCode: '91',
    secondaryCountryCode: null,
    status: 'NEW',
    leadNumber: 'LN1',
    ...overrides,
  };
}

function okResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

function settings(overrides: Record<string, unknown> = {}) {
  return {
    clickToCallUrl: 'https://bizcall.cxteletech.com/api/integration/click2call',
    authHeaderName: 'X-API-KEY',
    useBearerPrefix: false,
    noAuthRequired: false,
    allowTestUrl: false,
    callIdFieldPath: 'originateUuid',
    isActive: true,
    encryptedCredentials: 'cipher',
    encryptedExtraHeaders: null,
    ...overrides,
  };
}

function harness(fetchImpl: ReturnType<typeof vi.fn>, extras: Record<string, unknown> = {}) {
  const saveAttempt = vi.fn().mockResolvedValue({ callDetailId: 'call-1', leadStatus: 'INCOMING', statusChanged: true });
  const audit = vi.fn().mockResolvedValue(undefined);
  const logProviderError = vi.fn();
  const recordLog = vi.fn().mockResolvedValue(undefined);
  const deps = {
    now: () => 1_700_000_000_000,
    fetchImpl,
    timeoutMs: 30,
    hasPermission: async () => true,
    findLead: async (_tenantId: string, leadId: string) => lead({ id: leadId }),
    canAccess: async () => true,
    loadSettings: async () => settings(),
    decrypt: () => SECRET,
    saveAttempt,
    audit,
    logProviderError,
    recordLog,
    ...extras,
  };
  return { deps, saveAttempt, audit, logProviderError, recordLog };
}

async function dial(deps: Record<string, unknown>, leadId = lead().id) {
  return placeClickToCall({
    user: USER,
    tenantId: USER.tenantId,
    leadId,
    phoneField: 'phone',
  }, deps as never);
}

beforeEach(() => {
  resetClickToCallGuards();
  process.env.API_KEY_ENCRYPTION_SECRET = Buffer.alloc(32, 4).toString('base64');
});

describe('click-to-call payload', () => {
  it('sends the exact Bizcall contract without tenant or legacy field names', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => okResponse({ success: true, originateUuid: 'prov-1' }));
    const { deps } = harness(fetchImpl);
    const result = await dial(deps);

    expect(result.ok).toBe(true);
    expect(result.step).toBe('sent_to_provider');
    expect(result.code).toBe('INITIATED');
    expect(result.message).toBe('Calling Pam Beesly... your phone will ring shortly.');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://bizcall.cxteletech.com/api/integration/click2call');
    expect(JSON.parse(init.body)).toEqual({
      [CLICK_TO_CALL_PAYLOAD_KEYS.userId]: USER.id,
      [CLICK_TO_CALL_PAYLOAD_KEYS.customerNumber]: '+919876543210',
      [CLICK_TO_CALL_PAYLOAD_KEYS.recordId]: lead().id,
      [CLICK_TO_CALL_PAYLOAD_KEYS.leadName]: 'Pam Beesly',
    });
    expect(Object.keys(JSON.parse(init.body))).toEqual(['userId', 'customerNumber', 'recordId', 'leadName']);
    expect(init.headers['X-API-KEY']).toBe(SECRET);
    expect(Object.keys(init.headers)).toEqual(['Content-Type', 'X-API-KEY']);
    expect(new URL(url).search).toBe('');
    expect(buildClickToCallPayload({
      userId: USER.id,
      customerNumber: '+919876543210',
      leadName: 'Pam Beesly',
      recordId: lead().id,
    })).toEqual(JSON.parse(init.body));
  });

  it('uses a configured header name without a Bearer prefix', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => okResponse({ success: true }));
    const { deps, saveAttempt } = harness(fetchImpl, {
      loadSettings: async () => settings({
        authHeaderName: 'X-API-Key',
        useBearerPrefix: false,
        callIdFieldPath: '',
      }),
    });

    await dial(deps);
    expect(fetchImpl.mock.calls[0][1].headers['X-API-Key']).toBe(SECRET);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(saveAttempt.mock.calls[0][0].providerCallId).toBeNull();
    expect(saveAttempt.mock.calls[0][0].outcome).toBe('Initiated');
  });

  it('sends an optional caller id with the call request', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => okResponse({ success: true }));
    const { deps } = harness(fetchImpl, {
      loadSettings: async () => settings({ callerId: '+15551234567' }),
    });
    await dial(deps, 'lead-with-caller-id');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ callerId: '+15551234567' });
  });

  it('ignores agentId, tenantId and recordID sent by the browser', () => {
    expect(readClickToCallRequest({
      leadId: 'lead-1',
      phoneField: 'mobile',
      agentId: 'spoof-agent',
      tenantId: 'spoof-tenant',
      recordID: 'spoof-record',
    })).toEqual({ leadId: 'lead-1', phoneField: 'mobile' });
  });
});

describe('click-to-call guards', () => {
  it('does not call Bizcall when settings are missing, inactive, or the phone is invalid', async () => {
    const fetchImpl = vi.fn();
    const missing = harness(fetchImpl, { loadSettings: async () => null });
    await expect(dial(missing.deps)).resolves.toMatchObject({
      httpStatus: 409,
      code: 'TELEPHONY_NOT_CONFIGURED',
      step: 'blocked_before_send',
    });
    expect(missing.saveAttempt).not.toHaveBeenCalled();

    const inactive = harness(fetchImpl, { loadSettings: async () => settings({ isActive: false }) });
    await expect(dial(inactive.deps)).resolves.toMatchObject({
      httpStatus: 409,
      code: 'TELEPHONY_NOT_CONFIGURED',
      step: 'blocked_before_send',
      message: 'Telephony is not set up for this company.',
    });

    const noKey = harness(fetchImpl, { loadSettings: async () => settings({ encryptedCredentials: null }) });
    const missingKey = await placeClickToCall({
      user: { ...USER, isAdmin: true },
      tenantId: USER.tenantId,
      leadId: 'lead-missing-key',
      phoneField: 'phone',
    }, noKey.deps as never);
    expect(missingKey).toMatchObject({
      code: 'TELEPHONY_KEY_MISSING',
      step: 'blocked_before_send',
      message: 'Telephony key is missing. Ask an admin to add it in Setup > Integrations > Telephony.',
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    const invalid = harness(fetchImpl, { findLead: async () => lead({ phone: 'abc' }) });
    await expect(dial(invalid.deps)).resolves.toMatchObject({ httpStatus: 422, code: 'INVALID_PHONE' });
    const empty = harness(fetchImpl, { findLead: async () => lead({ phone: '' }) });
    await expect(dial(empty.deps)).resolves.toMatchObject({ httpStatus: 422, code: 'LEAD_HAS_NO_PHONE' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a user without telephony.call and a lead they cannot see', async () => {
    const fetchImpl = vi.fn();
    const denied = harness(fetchImpl, { hasPermission: async () => false });
    await expect(dial(denied.deps)).resolves.toMatchObject({ httpStatus: 403, code: 'NO_PERMISSION', step: 'blocked_before_send' });

    const hidden = harness(fetchImpl, { canAccess: async () => false });
    await expect(dial(hidden.deps)).resolves.toMatchObject({ httpStatus: 403, code: 'NO_PERMISSION', step: 'blocked_before_send' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns 404 for a lead from another tenant', async () => {
    const fetchImpl = vi.fn();
    const { deps } = harness(fetchImpl, { findLead: async () => null });
    await expect(dial(deps)).resolves.toMatchObject({ httpStatus: 404, code: 'LEAD_NOT_FOUND', step: 'blocked_before_send' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not use tenant A settings for tenant B', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => okResponse({ success: true }));
    const blocked = harness(fetchImpl, {
      findLead: async (tenantId: string, leadId: string) => lead({ id: leadId, tenantId }),
      loadSettings: async (tenantId: string) => tenantId === USER.tenantId ? settings() : null,
    });

    const result = await placeClickToCall({
      user: { ...USER, tenantId: 'tenant-b' },
      tenantId: 'tenant-b',
      leadId: 'lead-b',
      phoneField: 'phone',
    }, blocked.deps as never);
    expect(result).toMatchObject({ code: 'TELEPHONY_NOT_CONFIGURED', step: 'blocked_before_send' });
    expect(fetchImpl).not.toHaveBeenCalled();

    const other = harness(fetchImpl, {
      findLead: async (tenantId: string, leadId: string) => lead({ id: leadId, tenantId }),
      loadSettings: async (tenantId: string) => settings({
        clickToCallUrl: tenantId === USER.tenantId
          ? 'https://bizcall.cxteletech.com/api/integration/click2call'
          : 'https://other.example/api/dialer/click2call',
      }),
    });
    await placeClickToCall({
      user: { ...USER, tenantId: 'tenant-b' },
      tenantId: 'tenant-b',
      leadId: 'lead-b2',
      phoneField: 'phone',
    }, other.deps as never);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://other.example/api/dialer/click2call');
  });

  it('blocks DNC numbers before contacting Bizcall', async () => {
    const fetchImpl = vi.fn();
    const { deps, saveAttempt } = harness(fetchImpl, {
      loadSettings: async () => settings({ blockDnc: true, dncNumbers: '+919876543210' }),
    });
    const result = await dial(deps, 'lead-dnc');
    expect(result).toMatchObject({ code: 'DO_NOT_CALL', step: 'blocked_before_send' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(saveAttempt).not.toHaveBeenCalled();
  });

  it('does not send server API calls when dialpad messaging is selected', async () => {
    const fetchImpl = vi.fn();
    const { deps } = harness(fetchImpl, {
      loadSettings: async () => settings({ callMethod: 'DIALPAD_MESSAGE' }),
    });
    await expect(dial(deps, 'lead-dialpad-method')).resolves.toMatchObject({
      code: 'DIALPAD_MESSAGE_REQUIRED',
      step: 'blocked_before_send',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends one request for a double click and does not retry a timeout', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => okResponse({ success: true, originateUuid: 'once' }));
    const { deps } = harness(fetchImpl);
    await dial(deps);
    const second = await dial(deps);
    expect(second.ignored).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    resetClickToCallGuards();
    const hanging = vi.fn().mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }));
    const timeout = harness(hanging);
    const failed = await dial(timeout.deps);
    expect(hanging).toHaveBeenCalledTimes(1);
    expect(failed).toMatchObject({ httpStatus: 504, code: 'PROVIDER_TIMEOUT', step: 'blocked_before_send' });
    expect(timeout.saveAttempt).not.toHaveBeenCalled();
  });

  it('retries once on a network error and not after a response', async () => {
    let calls = 0;
    const fetchImpl = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls === 1) return Promise.reject(new TypeError('fetch failed'));
      return okResponse({ success: true, originateUuid: 'after-retry' });
    });
    const { deps, saveAttempt } = harness(fetchImpl);
    const result = await dial(deps);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(saveAttempt.mock.calls[0][0].providerCallId).toBe('after-retry');

    resetClickToCallGuards();
    const rejected = vi.fn().mockImplementation(() => okResponse({ error: 'no' }, 500));
    const rejectedDeps = harness(rejected);
    const failure = await dial(rejectedDeps.deps, 'lead-rejected');
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(failure).toMatchObject({ httpStatus: 502, code: 'PROVIDER_REJECTED', step: 'sent_to_provider' });
    expect(failure.message).toContain('500');
    expect(rejectedDeps.saveAttempt.mock.calls[0][0].outcome).toBe('Failed');

    resetClickToCallGuards();
    const dnsError = new TypeError('fetch failed');
    Object.assign(dnsError, { cause: { code: 'ENOTFOUND' } });
    const dns = vi.fn().mockRejectedValue(dnsError);
    const dnsDeps = harness(dns);
    const dnsResult = await dial(dnsDeps.deps, 'lead-dns');
    expect(dns).toHaveBeenCalledTimes(2);
    expect(dnsResult).toMatchObject({ httpStatus: 502, code: 'PROVIDER_UNREACHABLE', step: 'blocked_before_send' });
    expect(dnsResult.message).toMatch(/DNS/);
    expect(dnsDeps.saveAttempt).not.toHaveBeenCalled();

    resetClickToCallGuards();
    const redirect = vi.fn().mockImplementation(() => Promise.resolve(new Response(null, { status: 302, headers: { Location: 'https://evil.example/dial' } })));
    const redirectDeps = harness(redirect);
    const redirected = await dial(redirectDeps.deps, 'lead-redirect');
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirected).toMatchObject({ code: 'PROVIDER_REJECTED', step: 'sent_to_provider' });
    expect(redirected.message).toMatch(/not followed/);
    expect(JSON.stringify(redirected)).not.toContain('evil.example');
  });

  it('moves a New lead to Incoming and leaves Prospect unchanged', async () => {
    const txFor = (status: string) => ({
      callDetail: { create: vi.fn().mockResolvedValue({ id: 'call-1' }) },
      lead: {
        findFirst: vi.fn().mockResolvedValue({ id: 'lead-1', status }),
        update: vi.fn().mockResolvedValue({ id: 'lead-1', status: 'INCOMING' }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    });
    const created = txFor('NEW');
    const moved = await recordClickAttempt(created as never, {
      tenantId: USER.tenantId,
      userId: USER.id,
      leadId: 'lead-1',
      leadNumber: 'LN1',
      currentStatus: 'NEW',
      customerPhone: '+919876543210',
      outcome: 'Initiated',
      notes: null,
      providerCallId: null,
      providerResponse: null,
    });
    expect(moved.statusChanged).toBe(true);
    expect(moved.leadStatus).toBe('INCOMING');
    expect(created.lead.update).toHaveBeenCalled();

    const later = txFor('PROSPECT');
    const unchanged = await recordClickAttempt(later as never, {
      tenantId: USER.tenantId,
      userId: USER.id,
      leadId: 'lead-1',
      leadNumber: 'LN1',
      currentStatus: 'PROSPECT',
      customerPhone: '+919876543210',
      outcome: 'Initiated',
      notes: null,
      providerCallId: null,
      providerResponse: null,
    });
    expect(unchanged).toMatchObject({ statusChanged: false, leadStatus: 'PROSPECT' });
    expect(later.lead.update).not.toHaveBeenCalled();
  });

  it('keeps credentials out of the response, the saved body, and the log', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => okResponse({ token: SECRET, note: `failed ${SECRET}` }, 401));
    const { deps, saveAttempt, logProviderError, recordLog } = harness(fetchImpl);
    const result = await placeClickToCall({
      user: { ...USER, isAdmin: true },
      tenantId: USER.tenantId,
      leadId: lead().id,
      phoneField: 'phone',
      includeDiagnostics: true,
    }, deps as never);
    const packed = JSON.stringify({ result, saved: saveAttempt.mock.calls[0][0], logs: logProviderError.mock.calls, requestLog: recordLog.mock.calls });
    expect(packed).not.toContain(SECRET);
    expect(result.redactedRequest?.headers['X-API-KEY']).toBe('••••••');
    expect(saveAttempt.mock.calls[0][0].providerResponse).toEqual({ note: 'failed [redacted]' });
    expect(result).toMatchObject({ code: 'PROVIDER_REJECTED', step: 'sent_to_provider' });
    expect(result.message).toBe('Bizcall rejected the API key. Check whether it is missing, inactive or expired.');
    expect(publicTelephonySettings({
      clickToCallUrl: 'https://bizcall.cxteletech.com/api/integration/click2call',
      authHeaderName: 'X-API-KEY',
      useBearerPrefix: false,
      noAuthRequired: false,
      allowTestUrl: false,
      callIdFieldPath: 'data.callId',
      isActive: true,
      encryptedCredentials: encryptTelephonyToken(SECRET),
      keyLast4: 'oken',
      encryptedExtraHeaders: null,
    })).toMatchObject({
      clickToCallUrl: 'https://bizcall.cxteletech.com/api/integration/click2call',
      hasKey: true,
      keyLastFour: 'oken',
      status: 'active',
    });

    expect(JSON.stringify(publicTelephonySettings({
      clickToCallUrl: 'https://bizcall.cxteletech.com/api/integration/click2call',
      authHeaderName: 'X-API-Key',
      useBearerPrefix: false,
      noAuthRequired: false,
      allowTestUrl: false,
      callIdFieldPath: '',
      isActive: false,
      encryptedCredentials: encryptTelephonyToken(SECRET),
      encryptedExtraHeaders: encryptTelephonyToken(JSON.stringify([{ name: 'X-Trace', value: SECRET }])),
    }))).not.toContain(SECRET);
  });

  it('sends the saved key in a header on a bodyless connection test and reports HTTP reasons', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => okResponse({ error: 'Body required' }, 400));
    const result = await probeTelephonyConnection({
      ...settings({ encryptedCredentials: encryptTelephonyToken(SECRET) }),
    }, fetchImpl);
    expect(result).toMatchObject({
      reached: true,
      httpStatus: 400,
      reason: 'Bizcall was reached and accepted the API key, but rejected the empty request body.',
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://bizcall.cxteletech.com/api/integration/click2call');
    expect(new URL(url).search).toBe('');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('');
    expect(init.headers['X-API-KEY']).toBe(SECRET);
    expect(JSON.stringify({ url, init })).not.toContain('api_key');
    expect(JSON.stringify({ url, result })).not.toContain(SECRET);
  });

  it('hides Bizcall authentication failures from non-admin callers', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => okResponse({ message: 'invalid key' }, 401));
    const { deps } = harness(fetchImpl);
    const result = await dial(deps, 'lead-with-rejected-key');
    expect(result).toMatchObject({
      code: 'PROVIDER_REJECTED',
      step: 'sent_to_provider',
      message: 'Could not place the call.',
    });
  });

  it('gives admins the same clear message for a Bizcall 403 rejection', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => okResponse({ message: 'inactive' }, 403));
    const { deps } = harness(fetchImpl);
    const result = await placeClickToCall({
      user: { ...USER, isAdmin: true },
      tenantId: USER.tenantId,
      leadId: 'lead-with-forbidden-key',
      phoneField: 'phone',
    }, deps as never);
    expect(result).toMatchObject({
      code: 'PROVIDER_REJECTED',
      message: 'inactive',
    });
  });

  it.each([
    [401, 'Bizcall was reached, but the API key is missing or incorrect.'],
    [403, 'Bizcall was reached, but the API key is inactive or expired.'],
  ])('reports Bizcall authentication status %s clearly', async (status, reason) => {
    const fetchImpl = vi.fn().mockImplementation(() => okResponse({}, status));
    const result = await probeTelephonyConnection({
      ...settings({ encryptedCredentials: encryptTelephonyToken(SECRET) }),
    }, fetchImpl);
    expect(result).toMatchObject({ reached: true, httpStatus: status, reason });
  });

  it.each([
    ['timeout', 'Timeout', 'Timeout'],
    ['dns', 'DNS failure', 'DNS failure'],
  ])('reports a %s during connection testing', async (_label, errorKind, reason) => {
    const error = new TypeError('fetch failed');
    if (errorKind === 'Timeout') error.name = 'TimeoutError';
    else Object.assign(error, { cause: { code: 'ENOTFOUND' } });
    const fetchImpl = vi.fn().mockRejectedValue(error);
    const result = await probeTelephonyConnection({
      ...settings({ encryptedCredentials: encryptTelephonyToken(SECRET) }),
    }, fetchImpl);
    expect(result).toMatchObject({ reached: false, httpStatus: null, reason });
  });

  it('reports a missing encryption key without calling the setup message', async () => {
    const fetchImpl = vi.fn();
    const { deps } = harness(fetchImpl, {
      decrypt: () => {
        throw new TelephonyCredentialError('Telephony credential storage is not configured. Set API_KEY_ENCRYPTION_SECRET on the API server.', 'CREDENTIALS_KEY_MISSING');
      },
    });
    const hidden = await dial(deps);
    expect(hidden.code).toBe('CREDENTIALS_KEY_MISSING');
    expect(hidden.code).not.toBe('TELEPHONY_NOT_CONFIGURED');
    expect(hidden.message).not.toContain('API_KEY_ENCRYPTION_SECRET');
    const admin = await placeClickToCall({
      user: { ...USER, isAdmin: true },
      tenantId: USER.tenantId,
      leadId: 'lead-admin-key',
      phoneField: 'phone',
    }, deps as never);
    expect(admin.message).toContain('API_KEY_ENCRYPTION_SECRET');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('telephony helpers', () => {
  it('reads a nested call id and rejects private or non-https production URLs', () => {
    expect(readCallIdPath({ data: { callId: 'abc' } }, 'data.callId')).toBe('abc');
    expect(readCallIdPath({ ok: true }, '')).toBeNull();
    expect(readCallIdPath({ ok: true }, 'missing.id')).toBeNull();
    expect(() => assertClickToCallUrl('http://10.1.1.1/api/dialer/click2call', { env: 'development' })).toThrow(/private/);
    expect(assertClickToCallUrl('http://10.1.1.1/api/dialer/click2call', { env: 'development', allowTestUrl: true })).toContain('10.1.1.1');
    expect(() => assertClickToCallUrl('http://bizcall.example.com/api/dialer/click2call', { env: 'production' })).toThrow(/HTTPS/);
    expect(() => assertClickToCallUrl('https://bizcall.example.com/api/integration/click2call?api_key=secret', { env: 'production' })).toThrow(/API key in the URL/);
    expect(assertClickToCallUrl('https://bizcall.cxteletech.com/api/dialer/click2call', { env: 'production' })).toBe('https://bizcall.cxteletech.com/api/dialer/click2call');
    expect(migrateClickToCallUrl('https://bizcall.cxteletech.com')).toBe('https://bizcall.cxteletech.com/api/integration/click2call');
    expect(migrateClickToCallUrl('https://bizcall.cxteletech.com/api/dialer/click2call')).toBe('https://bizcall.cxteletech.com/api/dialer/click2call');
    const encrypted = encryptTelephonyToken(SECRET);
    expect(encrypted).not.toContain(SECRET);
    expect(decryptTelephonyToken(encrypted)).toBe(SECRET);
    expect(sanitizeProviderBody({ authorization: SECRET, nested: { apiKey: SECRET } }, [SECRET])).toEqual({ nested: {} });
  });
});
