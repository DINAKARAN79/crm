import { NextFunction, Response } from 'express';
import { AuthRequest } from './auth';
import { authenticate } from './auth';
import {
  ApiKeyAuthError,
  apiKeyErrorBody,
  attachApiKeyRequestLog,
  authenticatePresentedApiKey,
  presentedApiKey,
} from '../services/apiKeys';

function queryCarriesKey(req: AuthRequest) {
  const names = ['apiKey', 'api_key', 'key', 'token'];
  return names.some((name) => {
    const value = req.query[name];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

export function requireApiKey(req: AuthRequest, res: Response, next: NextFunction) {
  if (queryCarriesKey(req)) {
    return res.status(401).json({
      ok: false,
      code: 'API_KEY_INVALID',
      message: 'API key is invalid.',
    });
  }

  const apiKey = presentedApiKey(req);
  if (apiKey) {
    return authenticatePresentedApiKey(req, apiKey)
      .then((authenticated) => {
        req.user = authenticated.user;
        req.tenantId = authenticated.record.tenantId;
        req.apiKey = {
          id: authenticated.record.id,
          tenantId: authenticated.record.tenantId,
          scopes: authenticated.record.scopes,
        };
        attachApiKeyRequestLog(req, res, authenticated.record);
        return next();
      })
      .catch((error: unknown) => {
        if (error instanceof ApiKeyAuthError) {
          if (error.status === 429) res.setHeader('Retry-After', '60');
          return res.status(error.status).json(apiKeyErrorBody(error));
        }
        console.error('API key authentication error:', error);
        return res.status(500).json({ ok: false, code: 'API_KEY_INVALID', message: 'API key is invalid.' });
      });
  }

  const authorization = req.headers.authorization;
  const hasBrowserSession = Boolean(
    (authorization?.startsWith('Bearer ') && !authorization.slice('Bearer '.length).trim().startsWith('dct_'))
    || req.headers['x-session-auth'] === 'required'
    || req.cookies?.token,
  );
  if (hasBrowserSession) return authenticate(req, res, next);

  return res.status(401).json({
    ok: false,
    code: 'API_KEY_MISSING',
    message: 'An API key is required.',
  });
}

export const EXTERNAL_API_MOUNTS = [
  '/api/leads',
  '/api/enquiries',
  '/api/site-visits',
  '/api/bookings',
  '/api/projects',
  '/api/units',
  '/api/follow-ups',
  '/api/activities',
  '/api/call-details',
] as const;

export function mountExternalApi(app: { use: Function }, path: string, router: unknown) {
  app.use(path, requireApiKey, router);
}
