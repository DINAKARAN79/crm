import { LeadStatus } from '@prisma/client';

export const VALID_LEAD_STATUSES: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.INCOMING,
  LeadStatus.PROSPECT,
  LeadStatus.SITE_VISIT_SCHEDULED,
  LeadStatus.SITE_VISIT_HAPPENED,
  LeadStatus.BOOKED,
  LeadStatus.LOST,
];

export const PROFILE_STATUS_ACCESS: Record<string, LeadStatus[]> = {
  Marketing: [LeadStatus.NEW, LeadStatus.INCOMING],
  Presales: [LeadStatus.NEW, LeadStatus.INCOMING],
  'Sales Executive': [...VALID_LEAD_STATUSES],
  SVC: [LeadStatus.PROSPECT, LeadStatus.SITE_VISIT_SCHEDULED],
  GRE: [LeadStatus.SITE_VISIT_SCHEDULED, LeadStatus.SITE_VISIT_HAPPENED],
  Sales: [LeadStatus.SITE_VISIT_SCHEDULED, LeadStatus.SITE_VISIT_HAPPENED],
  CRM: [LeadStatus.SITE_VISIT_HAPPENED, LeadStatus.LOST],
  Recovery: [LeadStatus.LOST],
  Manager: [...VALID_LEAD_STATUSES],
  Admin: [...VALID_LEAD_STATUSES],
  'CRM Admin': [...VALID_LEAD_STATUSES],
};

export const STATUS_TRANSITIONS: Record<string, { next: LeadStatus; profiles: string[] }[]> = {
  [LeadStatus.NEW]: [
    { next: LeadStatus.INCOMING, profiles: ['Marketing', 'Presales', 'Sales Executive', 'Admin', 'CRM Admin', 'Manager'] },
    { next: LeadStatus.LOST, profiles: ['Marketing', 'Presales', 'Sales Executive', 'Recovery', 'Admin', 'CRM Admin', 'Manager'] },
  ],
  [LeadStatus.INCOMING]: [
    { next: LeadStatus.PROSPECT, profiles: ['Presales', 'Sales Executive', 'Admin', 'CRM Admin', 'Manager'] },
    { next: LeadStatus.LOST, profiles: ['Presales', 'Sales Executive', 'Recovery', 'Admin', 'CRM Admin', 'Manager'] },
  ],
  [LeadStatus.PROSPECT]: [
    { next: LeadStatus.SITE_VISIT_SCHEDULED, profiles: ['SVC', 'Presales', 'Sales Executive', 'Admin', 'CRM Admin', 'Manager'] },
  ],
  [LeadStatus.SITE_VISIT_SCHEDULED]: [
    { next: LeadStatus.SITE_VISIT_HAPPENED, profiles: ['GRE', 'SVC', 'Sales', 'Sales Executive', 'Admin', 'CRM Admin', 'Manager'] },
    { next: LeadStatus.PROSPECT, profiles: ['SVC', 'Sales Executive', 'Admin', 'CRM Admin', 'Manager'] },
  ],
  [LeadStatus.SITE_VISIT_HAPPENED]: [
    { next: LeadStatus.LOST, profiles: ['CRM', 'Sales', 'Sales Executive', 'Admin', 'CRM Admin', 'Manager'] },
  ],
  [LeadStatus.LOST]: [
    { next: LeadStatus.INCOMING, profiles: ['Recovery', 'Admin', 'CRM Admin', 'Manager'] },
  ],
};

const PROFILE_ALIASES: Record<string, string> = {
  presales: 'Presales',
  presalesexecutive: 'Presales',
  systemadministrator: 'Admin',
};

export function canonicalProfileName(profileName: string): string {
  const key = profileName.trim().toLowerCase().replace(/[\s_-]+/g, '');
  return PROFILE_ALIASES[key] || profileName;
}

export function canAccessStatus(profileName: string, status: string): boolean {
  const allowedStatuses = PROFILE_STATUS_ACCESS[canonicalProfileName(profileName)];
  if (!allowedStatuses) return false;
  return allowedStatuses.includes(status as LeadStatus);
}

export function canScheduleSiteVisit(profileName: string, leadStatus: string): boolean {
  const profile = canonicalProfileName(profileName);
  const status = String(leadStatus || '').trim().toUpperCase();
  if (profile === 'Presales' && (status === 'NEW' || status === 'INCOMING')) return true;
  if (profile === 'Admin' || profile === 'Manager' || profile === 'CRM Admin') return status === 'PROSPECT';
  return status === 'PROSPECT' && canTransitionStatus(profile, 'PROSPECT', 'SITE_VISIT_SCHEDULED');
}

export function canTransitionStatus(
  profileName: string,
  currentStatus: string,
  targetStatus: string
): boolean {
  const transitions = STATUS_TRANSITIONS[currentStatus];
  if (!transitions) return false;
  const transition = transitions.find((t) => t.next === targetStatus);
  if (!transition) return false;
  return transition.profiles.includes(canonicalProfileName(profileName));
}

export function getAllowedStatuses(profileName: string): string[] {
  const allowedStatuses = PROFILE_STATUS_ACCESS[canonicalProfileName(profileName)];
  if (!allowedStatuses) return [];
  return allowedStatuses.map((status) => status as string);
}

export function getAvailableTransitions(profileName: string, currentStatus: string): string[] {
  const transitions = STATUS_TRANSITIONS[currentStatus];
  if (!transitions) return [];
  const canonicalName = canonicalProfileName(profileName);
  return transitions
    .filter((t) => t.profiles.includes(canonicalName))
    .map((t) => t.next as string);
}

export function isValidStatus(status: string): boolean {
  return VALID_LEAD_STATUSES.includes(status as LeadStatus);
}