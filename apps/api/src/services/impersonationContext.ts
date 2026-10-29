import { AsyncLocalStorage } from 'node:async_hooks';
import { prisma } from '@dct-crm/db';

export const impersonationStore = new AsyncLocalStorage<{ impersonatedById: string }>();

const globalStamp = globalThis as { __impersonationAuditStamp?: boolean };

export function installImpersonationAuditStamp() {
  const client = prisma as typeof prisma & {
    $use?: (middleware: (params: any, next: (params: any) => Promise<unknown>) => Promise<unknown>) => void;
  };
  if (globalStamp.__impersonationAuditStamp || typeof client.$use !== 'function') return;
  globalStamp.__impersonationAuditStamp = true;
  client.$use(async (params, next) => {
    const actor = impersonationStore.getStore();
    if (actor && params.model === 'AuditLog' && params.action === 'create' && params.args?.data && !params.args.data.impersonatedById) {
      params.args.data = { ...params.args.data, impersonatedById: actor.impersonatedById };
    }
    if (actor && params.model === 'AuditLog' && params.action === 'createMany' && Array.isArray(params.args?.data)) {
      params.args.data = params.args.data.map((row: { impersonatedById?: string }) => (
        row?.impersonatedById ? row : { ...row, impersonatedById: actor.impersonatedById }
      ));
    }
    return next(params);
  });
}
