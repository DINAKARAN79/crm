import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@dct-crm/db';
import { normalizeLeadPhone } from './leadDuplicateDetection';
import { applyCallLogStatusRule } from './callLogStatus';
import { canAccessLead, type AuthUserLike } from './recordAccess';
import { EffectivePermissionService } from './effectivePermissions';
import { auditLog } from '../middleware/audit';
import { decryptTelephonyToken, TelephonyCredentialError } from './telephonyCredentials';
import { assertClickToCallUrl, TelephonyUrlError } from './telephonyUrl';

/** Bizcall payload keys. Rename a field here and nowhere else. */
export const CLICK_TO_CALL_PAYLOAD_KEYS = {
  userId: 'userId',
  customerNumber: 'customerNumber',
  recordId: 'recordId',
  leadName: 'leadName',
  callerId: 'callerId',
} as const;

const DIAL_TIMEOUT_MS = 10_000;
const REPEAT_WINDOW_MS = 10_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 10;
const SECRET_KEY = /token|secret|password|authorization|credential|api[-_]?key/i;

export type ClickToCallPhoneField = 'phone' | 'mobile' | 'secondaryPhone';

export type ClickToCallLead = {
  id: string;
  tenantId: string;
  ownerId: string | null;
  creatorId: string | null;
  firstName: string | null;
  lastName: string;
  company: string | null;
  phone: string | null;
  mobile: string | null;
  secondaryPhone: string | null;
  countryCode: string | null;
  secondaryCountryCode: string | null;
  status: string;
  leadNumber: string | null;
};

export type ClickToCallSettings = {
  clickToCallUrl: string;
  authHeaderName: string;
  callerId?: string | null;
  useBearerPrefix: boolean;
  noAuthRequired: boolean;
  allowTestUrl: boolean;
  callIdFieldPath: string;
  isActive: boolean;
  encryptedCredentials: string | null;
  encryptedExtraHeaders: string | null;
  duplicateGuardSeconds?: number;
  callsPerMinute?: number;
  blockDnc?: boolean;
  dncNumbers?: string;
  callMethod?: string;
};

export type ClickToCallStep = 'blocked_before_send' | 'sent_to_provider';

export type ClickToCallResult = {
  ok: boolean;
  httpStatus: number;
  code: string;
  message: string;
  step: ClickToCallStep;
  providerStatus?: number | null;
  ignored?: boolean;
  callDetailId?: string;
  leadStatus?: string;
  statusChanged?: boolean;
  leadName?: string;
  redactedRequest?: { url: string; headers: Record<string, string>; body: Record<string, string> };
  providerResponse?: unknown;
};

type SaveAttemptInput = {
  tenantId: string;
  userId: string;
  leadId: string;
  leadNumber: string | null;
  currentStatus: string;
  customerPhone: string;
  outcome: 'Initiated' | 'Failed';
  notes: string | null;
  providerCallId: string | null;
  providerResponse: Prisma.InputJsonValue | null;
};

type ClickToCallDeps = {
  now: () => number;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  hasPermission: (userId: string) => Promise<boolean>;
  findLead: (tenantId: string, leadId: string) => Promise<ClickToCallLead | null>;
  canAccess: (user: AuthUserLike, lead: ClickToCallLead) => Promise<boolean>;
  loadSettings: (tenantId: string) => Promise<ClickToCallSettings | null>;
  decrypt: (payload: string) => string;
  saveAttempt: (input: SaveAttemptInput) => Promise<{ callDetailId: string; leadStatus: string; statusChanged: boolean }>;
  audit: (entry: { tenantId: string; userId: string; leadId: string; maskedNumber: string; at: string; outcome: string }) => Promise<void>;
  logProviderError: (details: unknown) => void;
  recordLog: (entry: {
    tenantId: string;
    userId: string;
    leadId?: string | null;
    maskedNumber?: string | null;
    step: ClickToCallStep;
    code: string;
    httpStatus?: number | null;
    durationMs: number;
    reason: string;
  }) => Promise<void>;
};

const recentClicks = new Map<string, number>();
const rateHits = new Map<string, number[]>();

export function resetClickToCallGuards() {
  recentClicks.clear();
  rateHits.clear();
}

export function clickToCallLeadName(lead: { firstName?: string | null; lastName?: string | null; company?: string | null }) {
  const person = [lead.firstName, lead.lastName].map((part) => part?.trim()).filter(Boolean).join(' ');
  return (person || lead.company?.trim() || 'Unknown').slice(0, 200);
}

export function buildClickToCallPayload(input: {
  userId: string;
  customerNumber: string;
  recordId: string;
  leadName: string;
  callerId?: string | null;
}) {
  return {
    [CLICK_TO_CALL_PAYLOAD_KEYS.userId]: input.userId,
    [CLICK_TO_CALL_PAYLOAD_KEYS.customerNumber]: input.customerNumber,
    [CLICK_TO_CALL_PAYLOAD_KEYS.recordId]: input.recordId,
    [CLICK_TO_CALL_PAYLOAD_KEYS.leadName]: input.leadName,
    ...(input.callerId?.trim() ? { [CLICK_TO_CALL_PAYLOAD_KEYS.callerId]: input.callerId.trim() } : {}),
  };
}

export function maskPhone(e164: string) {
  if (e164.length <= 6) return '******';
  return `${e164.slice(0, 3)}${'*'.repeat(Math.max(4, e164.length - 7))}${e164.slice(-4)}`;
}

export function readCallIdPath(body: unknown, path: string) {
  const trimmed = path.trim();
  if (!trimmed) return null;
  let current: unknown = body;
  for (const part of trimmed.split('.')) {
    if (!part || !current || typeof current !== 'object' || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current === 'string' && current.trim()) return current.trim().slice(0, 255);
  if (typeof current === 'number' && Number.isFinite(current)) return String(current).slice(0, 255);
  return null;
}

export function sanitizeProviderBody(body: unknown, secrets: string[], depth = 0): Prisma.InputJsonValue | null {
  if (body === null || body === undefined) return null;
  if (depth > 6) return null;
  if (typeof body === 'string') {
    return redactText(body, secrets).slice(0, 500);
  }
  if (typeof body === 'number') return Number.isFinite(body) ? body : null;
  if (typeof body === 'boolean') return body;
  if (Array.isArray(body)) {
    return body.slice(0, 20).map((item) => sanitizeProviderBody(item, secrets, depth + 1));
  }
  if (typeof body === 'object') {
    const out: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, value] of Object.entries(body).slice(0, 40)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = sanitizeProviderBody(value, secrets, depth + 1);
    }
    return out;
  }
  return null;
}

function redactText(value: string, secrets: string[]) {
  let next = value;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) next = next.split(secret).join('[redacted]');
  }
  return next;
}

function phoneValue(lead: ClickToCallLead, field: ClickToCallPhoneField) {
  if (field === 'mobile') return { value: lead.mobile, countryCode: lead.countryCode };
  if (field === 'secondaryPhone') return { value: lead.secondaryPhone, countryCode: lead.secondaryCountryCode };
  return { value: lead.phone, countryCode: lead.countryCode };
}

function takeRateSlot(userId: string, now: number, limit = RATE_LIMIT) {
  const recent = (rateHits.get(userId) || []).filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
  if (recent.length >= limit) {
    rateHits.set(userId, recent);
    return false;
  }
  recent.push(now);
  rateHits.set(userId, recent);
  return true;
}

function repeatBlocked(userId: string, leadId: string, now: number, windowMs = REPEAT_WINDOW_MS) {
  const key = `${userId}:${leadId}`;
  const previous = recentClicks.get(key);
  return previous !== undefined && now - previous < windowMs;
}

function rememberClick(userId: string, leadId: string, now: number) {
  recentClicks.set(`${userId}:${leadId}`, now);
}

function transportKind(error: unknown) {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) return 'timeout';
  const code = typeof error === 'object' && error && 'cause' in error
    ? String((error as { cause?: { code?: string } }).cause?.code || '')
    : '';
  const message = error instanceof Error ? error.message : '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || /getaddrinfo|ENOTFOUND/i.test(message)) return 'dns';
  if (/CERT|TLS|UNABLE_TO_VERIFY/i.test(code + message)) return 'tls';
  return 'network';
}

async function postOnce(
  url: string,
  headers: Record<string, string>,
  payload: Record<string, string> | null,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  method: 'POST' = 'POST',
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method,
      headers,
      body: payload === null ? '' : JSON.stringify(payload),
      signal: controller.signal,
      redirect: 'manual',
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text.slice(0, 500) };
      }
    }
    return { status: response.status, body, redirected: response.status >= 300 && response.status < 400 };
  } catch (error) {
    const kind = transportKind(error);
    const failure = new Error(kind);
    failure.name = kind === 'timeout' ? 'ClickToCallTimeout' : kind === 'dns' ? 'ClickToCallDns' : kind === 'tls' ? 'ClickToCallTls' : 'ClickToCallNetwork';
    throw failure;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendClickToCall(input: {
  url: string;
  headers: Record<string, string>;
  payload: Record<string, string>;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}) {
  try {
    return await postOnce(input.url, input.headers, input.payload, input.fetchImpl, input.timeoutMs);
  } catch (error) {
    if (error instanceof Error && (error.name === 'ClickToCallNetwork' || error.name === 'ClickToCallDns' || error.name === 'ClickToCallTls')) {
      return postOnce(input.url, input.headers, input.payload, input.fetchImpl, input.timeoutMs);
    }
    throw error;
  }
}

export async function recordClickAttempt(
  tx: Prisma.TransactionClient,
  input: SaveAttemptInput,
) {
  const start = new Date();
  const call = await tx.callDetail.create({
    data: {
      tenantId: input.tenantId,
      leadId: input.leadId,
      name: `Click to call ${input.leadNumber || 'lead'} ${randomBytes(4).toString('hex')}`.slice(0, 255),
      callType: 'OUTBOUND',
      callTo: input.customerPhone.slice(0, 50),
      status: input.outcome,
      notes: input.notes,
      startAt: start,
      endAt: start,
      createdById: input.userId,
      ownerId: input.userId,
      providerCallId: input.providerCallId,
      source: 'server_api',
      ...(input.providerResponse ? { providerResponse: input.providerResponse } : {}),
      duration: 0,
    },
    select: { id: true },
  });
  const status = await applyCallLogStatusRule(input.leadId, tx, {
    tenantId: input.tenantId,
    userId: input.userId,
    callLogId: call.id,
  });
  return {
    callDetailId: call.id,
    leadStatus: status.status || input.currentStatus,
    statusChanged: status.changed,
  };
}

function defaultDeps(): ClickToCallDeps {
  return {
    now: () => Date.now(),
    fetchImpl: fetch,
    timeoutMs: DIAL_TIMEOUT_MS,
    hasPermission: (userId) => EffectivePermissionService.hasPermission(userId, 'TELEPHONY_CALL'),
    findLead: (tenantId, leadId) => prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      select: {
        id: true,
        tenantId: true,
        ownerId: true,
        creatorId: true,
        firstName: true,
        lastName: true,
        company: true,
        phone: true,
        mobile: true,
        secondaryPhone: true,
        countryCode: true,
        secondaryCountryCode: true,
        status: true,
        leadNumber: true,
      },
    }),
    canAccess: (user, lead) => canAccessLead(user, lead),
    loadSettings: (tenantId) => prisma.telephonySetting.findUnique({ where: { tenantId } }),
    decrypt: decryptTelephonyToken,
    saveAttempt: (input) => prisma.$transaction((tx) => recordClickAttempt(tx, input)),
    audit: async (entry) => {
      await auditLog(entry.tenantId, entry.userId, 'CLICK_TO_CALL', 'Lead', entry.leadId, undefined, {
        maskedNumber: entry.maskedNumber,
        outcome: entry.outcome,
        at: entry.at,
      });
    },
    logProviderError: (details) => {
      console.error('Click-to-call provider error', details);
    },
    recordLog: async (entry) => {
      const reason = entry.reason.slice(0, 180);
      console.info(`click-to-call user=${entry.userId} lead=${entry.leadId || '-'} step=${entry.step} status=${entry.httpStatus ?? '-'} duration=${entry.durationMs} code=${entry.code}`);
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await prisma.telephonyRequestLog.deleteMany({ where: { tenantId: entry.tenantId, createdAt: { lt: cutoff } } });
      await prisma.telephonyRequestLog.create({
        data: {
          tenantId: entry.tenantId,
          userId: entry.userId,
          leadId: entry.leadId || null,
          maskedNumber: entry.maskedNumber || null,
          step: entry.step,
          code: entry.code,
          httpStatus: entry.httpStatus ?? null,
          durationMs: entry.durationMs,
          reason,
        },
      });
    },
  };
}

function credentialFailure(error: unknown, user: AuthUserLike): ClickToCallResult {
  const missing = error instanceof TelephonyCredentialError && error.code === 'CREDENTIALS_KEY_MISSING';
  if (missing) {
    return {
      ok: false,
      httpStatus: 500,
      code: 'CREDENTIALS_KEY_MISSING',
      step: 'blocked_before_send',
      message: user.isAdmin || user.isSuperAdmin
        ? 'The API server is missing API_KEY_ENCRYPTION_SECRET. Set it and save the token again.'
        : 'Telephony credentials are not available. Ask an administrator.',
    };
  }
  return {
    ok: false,
    httpStatus: 500,
    code: 'CREDENTIALS_UNREADABLE',
    step: 'blocked_before_send',
    message: 'Telephony credentials could not be read. Save the auth token again.',
  };
}

function providerText(body: unknown) {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.message === 'string') return record.message;
    if (typeof record.error === 'string') return record.error;
  }
  return '';
}

function redactHeaders(headers: Record<string, string>) {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [
    name,
    name === 'Content-Type' || name === 'Accept' ? value : '••••••',
  ]));
}

function buildOutboundHeaders(settings: ClickToCallSettings, token: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers[settings.authHeaderName || 'X-API-KEY'] = token;
  return headers;
}

export async function placeClickToCall(
  input: {
    user: AuthUserLike;
    tenantId: string;
    leadId: string;
    phoneField: ClickToCallPhoneField;
    includeDiagnostics?: boolean;
  },
  overrides: Partial<ClickToCallDeps> = {},
): Promise<ClickToCallResult> {
  const deps = { ...defaultDeps(), ...overrides };
  const started = deps.now();
  const userId = input.user.id;
  const finish = async (result: ClickToCallResult, extras: { leadId?: string; maskedNumber?: string | null; providerStatus?: number | null } = {}) => {
    const leadId = extras.leadId || input.leadId;
    const maskedNumber = extras.maskedNumber || null;
    try {
      await deps.recordLog({
        tenantId: input.tenantId,
        userId,
        leadId,
        maskedNumber,
        step: result.step,
        code: result.code,
        httpStatus: extras.providerStatus ?? null,
        durationMs: Math.max(0, deps.now() - started),
        reason: result.message,
      });
    } catch (error) {
      deps.logProviderError({ reason: 'request-log', name: error instanceof Error ? error.name : 'log' });
    }
    try {
      await deps.audit({
        tenantId: input.tenantId,
        userId,
        leadId,
        maskedNumber: maskedNumber || '',
        outcome: result.code,
        at: new Date(deps.now()).toISOString(),
      });
    } catch (error) {
      deps.logProviderError({ reason: 'audit', name: error instanceof Error ? error.name : 'audit' });
    }
    return result;
  };

  if (!(await deps.hasPermission(userId))) {
    return finish({
      ok: false,
      httpStatus: 403,
      code: 'NO_PERMISSION',
      step: 'blocked_before_send',
      message: 'Insufficient permissions for TELEPHONY_CALL',
    });
  }

  const lead = await deps.findLead(input.tenantId, input.leadId);
  if (!lead || lead.tenantId !== input.tenantId) {
    return finish({
      ok: false,
      httpStatus: 404,
      code: 'LEAD_NOT_FOUND',
      step: 'blocked_before_send',
      message: 'Lead not found',
    });
  }
  if (!(await deps.canAccess(input.user, lead))) {
    return finish({
      ok: false,
      httpStatus: 403,
      code: 'NO_PERMISSION',
      step: 'blocked_before_send',
      message: 'You do not have access to this lead',
    }, { leadId: lead.id });
  }

  const selected = phoneValue(lead, input.phoneField);
  const normalized = normalizeLeadPhone(selected.value, selected.countryCode);
  const maskedNumber = normalized ? maskPhone(normalized.e164) : null;
  const settings = await deps.loadSettings(input.tenantId);
  if (!settings || !settings.isActive) {
    return finish({
      ok: false,
      httpStatus: 409,
      code: 'TELEPHONY_NOT_CONFIGURED',
      step: 'blocked_before_send',
      message: 'Telephony is not set up for this company.',
    }, { leadId: lead.id, maskedNumber });
  }
  if (!settings.encryptedCredentials) {
    return finish({
      ok: false,
      httpStatus: 409,
      code: 'TELEPHONY_KEY_MISSING',
      step: 'blocked_before_send',
      message: 'Telephony key is missing. Ask an admin to add it in Setup > Integrations > Telephony.',
    }, { leadId: lead.id, maskedNumber });
  }
  if (settings.callMethod === 'DIALPAD_MESSAGE') {
    return finish({
      ok: false,
      httpStatus: 409,
      code: 'DIALPAD_MESSAGE_REQUIRED',
      step: 'blocked_before_send',
      message: 'Open the Bizcall dialpad before placing this call.',
    }, { leadId: lead.id, maskedNumber });
  }
  if (!normalized) {
    return finish({
      ok: false,
      httpStatus: 422,
      code: selected.value ? 'INVALID_PHONE' : 'LEAD_HAS_NO_PHONE',
      step: 'blocked_before_send',
      message: selected.value ? 'Enter a valid phone number.' : 'This lead has no phone number.',
    }, { leadId: lead.id });
  }
  const dncNumbers = (settings.dncNumbers || '').split(/[\s,;]+/).filter(Boolean);
  if (settings.blockDnc && dncNumbers.includes(normalized.e164)) {
    return finish({
      ok: false,
      httpStatus: 409,
      code: 'DO_NOT_CALL',
      step: 'blocked_before_send',
      message: 'This number is on the Do-Not-Call list.',
    }, { leadId: lead.id, maskedNumber });
  }

  let clickUrl = '';
  try {
    clickUrl = assertClickToCallUrl(settings.clickToCallUrl, { allowTestUrl: settings.allowTestUrl });
  } catch (error) {
    return finish({
      ok: false,
      httpStatus: 409,
      code: 'TELEPHONY_NOT_CONFIGURED',
      step: 'blocked_before_send',
      message: error instanceof TelephonyUrlError ? error.message : 'Enter the full click-to-call URL.',
    }, { leadId: lead.id, maskedNumber: maskPhone(normalized.e164) });
  }

  let token = '';
  try {
    token = deps.decrypt(settings.encryptedCredentials);
    if (!token) {
      return finish({
        ok: false,
        httpStatus: 409,
        code: 'TELEPHONY_KEY_MISSING',
        step: 'blocked_before_send',
        message: 'Telephony key is missing. Ask an admin to add it in Setup > Integrations > Telephony.',
      }, { leadId: lead.id, maskedNumber: maskPhone(normalized.e164) });
    }
  } catch (error) {
    return finish(credentialFailure(error, input.user), { leadId: lead.id, maskedNumber: maskPhone(normalized.e164) });
  }

  const now = deps.now();
  const leadName = clickToCallLeadName(lead);
  const duplicateWindowMs = (settings.duplicateGuardSeconds || 10) * 1000;
  if (repeatBlocked(userId, lead.id, now, duplicateWindowMs)) {
    return finish({
      ok: true,
      httpStatus: 200,
      code: 'DUPLICATE_CLICK',
      step: 'blocked_before_send',
      ignored: true,
      message: 'A call to this lead was just started.',
      leadName,
      leadStatus: lead.status,
      statusChanged: false,
    }, { leadId: lead.id, maskedNumber: maskPhone(normalized.e164) });
  }
  if (!takeRateSlot(userId, now, settings.callsPerMinute || RATE_LIMIT)) {
    return finish({
      ok: false,
      httpStatus: 429,
      code: 'RATE_LIMITED',
      step: 'blocked_before_send',
      message: 'Too many calls. Wait a minute and try again.',
    }, { leadId: lead.id, maskedNumber: maskPhone(normalized.e164) });
  }
  rememberClick(userId, lead.id, now);
  const payload = buildClickToCallPayload({
    userId,
    customerNumber: normalized.e164,
    leadName,
    recordId: lead.id,
    callerId: settings.callerId,
  });
  const headers = buildOutboundHeaders(settings, token);
  const secrets = [token].filter(Boolean);

  let providerStatus = 0;
  let providerBody: unknown = null;
  let failure: 'timeout' | 'dns' | 'tls' | 'network' | null = null;
  try {
    const response = await sendClickToCall({
      url: clickUrl,
      headers,
      payload,
      fetchImpl: deps.fetchImpl,
      timeoutMs: deps.timeoutMs,
    });
    providerStatus = response.status;
    providerBody = response.body;
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    failure = name === 'ClickToCallTimeout' ? 'timeout' : name === 'ClickToCallDns' ? 'dns' : name === 'ClickToCallTls' ? 'tls' : 'network';
    deps.logProviderError({ reason: failure });
  }

  const redirected = !failure && providerStatus >= 300 && providerStatus < 400;
  const reached = !failure;
  const providerSuccess = Boolean(providerBody && typeof providerBody === 'object' &&
    (providerBody as Record<string, unknown>).success === true);
  const initiated = reached && !redirected && providerStatus === 200 && providerSuccess;
  const authRejected = !failure && (providerStatus === 401 || providerStatus === 403);
  const code = failure === 'timeout'
    ? 'PROVIDER_TIMEOUT'
    : failure
      ? 'PROVIDER_UNREACHABLE'
      : authRejected
      ? 'PROVIDER_REJECTED'
      : initiated
        ? 'INITIATED'
        : 'PROVIDER_REJECTED';
  const sensitiveValues = [...secrets, normalized.e164];
  const detail = safeTrim(providerText(sanitizeProviderBody(providerBody, sensitiveValues)));
  const agentNotRegistered = !failure && /agent.{0,30}(unknown|not found|not registered)|not registered.{0,30}agent/i.test(detail);
  if (agentNotRegistered) {
    deps.logProviderError({ reason: 'agent-not-registered', providerMessage: redactText(detail, sensitiveValues).slice(0, 300) });
  }
  const message = initiated
    ? `Calling ${leadName}... your phone will ring shortly.`
    : failure === 'timeout'
      ? 'Bizcall did not answer in time.'
      : failure === 'dns'
        ? 'Bizcall could not be reached (DNS failure).'
        : failure === 'tls'
          ? 'Bizcall could not be reached (TLS error).'
          : failure
            ? 'Bizcall could not be reached.'
            : authRejected
              ? input.user.isAdmin || input.user.isSuperAdmin
                ? (detail || 'Bizcall rejected the API key. Check whether it is missing, inactive or expired.')
                : 'Could not place the call.'
            : agentNotRegistered
              ? 'Your agent is not set up in Bizcall. Ask an admin.'
            : redirected
              ? `Bizcall returned ${providerStatus}. The redirect was not followed.`
              : `Bizcall returned ${providerStatus}.${detail ? ` ${detail}` : ''}`;
  const httpStatus = initiated ? 200 : failure === 'timeout' ? 504 : 502;
  const sanitized = sanitizeProviderBody(providerBody, sensitiveValues);
  const saved = reached
    ? await deps.saveAttempt({
      tenantId: input.tenantId,
      userId,
      leadId: lead.id,
      leadNumber: lead.leadNumber,
      currentStatus: lead.status,
      customerPhone: normalized.e164,
      outcome: initiated ? 'Initiated' : 'Failed',
      notes: initiated ? null : message.slice(0, 180),
      providerCallId: initiated ? readCallIdPath(providerBody, settings.callIdFieldPath || 'originateUuid') : null,
      providerResponse: sanitized,
    })
    : null;

  return finish({
    ok: initiated,
    httpStatus,
    code,
    step: reached ? 'sent_to_provider' : 'blocked_before_send',
    message: redactText(message, sensitiveValues).slice(0, 220),
    providerStatus: reached ? providerStatus : null,
    callDetailId: saved?.callDetailId,
    leadStatus: saved?.leadStatus,
    statusChanged: saved?.statusChanged,
    leadName,
    ...(input.includeDiagnostics ? {
      redactedRequest: { url: clickUrl, headers: redactHeaders(headers), body: payload },
      providerResponse: sanitized,
    } : {}),
  }, { leadId: lead.id, maskedNumber: maskPhone(normalized.e164), providerStatus: reached ? providerStatus : null });
}

function safeTrim(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 180);
}

export async function probeTelephonyConnection(
  settings: ClickToCallSettings,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = DIAL_TIMEOUT_MS,
) {
  const started = Date.now();
  let token = '';
  try {
    if (settings.encryptedCredentials) token = decryptTelephonyToken(settings.encryptedCredentials);
  } catch (error) {
    const missing = error instanceof TelephonyCredentialError && error.code === 'CREDENTIALS_KEY_MISSING';
    return {
      reached: false,
      httpStatus: null as number | null,
      durationMs: Date.now() - started,
      reason: missing
        ? 'The API server is missing API_KEY_ENCRYPTION_SECRET.'
        : 'Saved credentials could not be read.',
    };
  }
  if (!token) {
    return {
      reached: false,
      httpStatus: null as number | null,
      durationMs: Date.now() - started,
      reason: 'Bizcall API key is missing. Save a key before testing the connection.',
    };
  }
  const url = assertClickToCallUrl(settings.clickToCallUrl, { allowTestUrl: settings.allowTestUrl });
  const headers = buildOutboundHeaders(settings, token);
  try {
    const response = await postOnce(url, headers, null, fetchImpl, timeoutMs);
    const status = response.status;
    const reason = status === 401
      ? 'Bizcall was reached, but the API key is missing or incorrect.'
      : status === 403
        ? 'Bizcall was reached, but the API key is inactive or expired.'
      : status === 404
        ? 'Wrong URL'
        : status === 400
          ? 'Bizcall was reached and accepted the API key, but rejected the empty request body.'
          : status >= 300 && status < 400
            ? 'Reached. The redirect was not followed'
            : status >= 200 && status < 300
              ? 'Reached'
              : `Reached. The server returned ${status}`;
    return { reached: true, httpStatus: status, durationMs: Date.now() - started, reason };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const reason = name === 'ClickToCallTimeout'
      ? 'Timeout'
      : name === 'ClickToCallDns'
        ? 'DNS failure'
        : name === 'ClickToCallTls'
          ? 'TLS error'
          : 'Connection failure';
    return { reached: false, httpStatus: null as number | null, durationMs: Date.now() - started, reason };
  }
}
