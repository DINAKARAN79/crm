import type { Prisma } from '@prisma/client';
import type { JsonValue } from '@dct-crm/shared';

type Db = Prisma.TransactionClient;

export const LOST_STATUSES = [
  'Abandoned',
  'Recovery - Pre Sales',
  'Recovery - Sales',
  'Recovery Followup',
] as const;

export function isConfiguredLostStatus(value: unknown): value is (typeof LOST_STATUSES)[number] {
  return typeof value === 'string' && LOST_STATUSES.some((status) => status === value);
}

export function classifyMatchedLeadLifecycle(
  operationalStatus: string,
  configuredStatus: unknown,
): 'Re-Engaged' | 'Re-Opened' {
  return operationalStatus === 'LOST' || isConfiguredLostStatus(configuredStatus)
    ? 'Re-Opened'
    : 'Re-Engaged';
}

export interface LeadTagMapping {
  object: 'Lead' | 'Enquiry' | 'FollowUp' | 'SiteVisit';
  salesforceField: string;
  crmField: string;
  source: string;
  events: string[];
  condition: string;
  updateBehavior: string;
  page: string;
  status: 'implemented' | 'unresolved';
}

export const FIELD_TAGGING_REGISTRY: LeadTagMapping[] = [
  {
    object: 'Lead',
    salesforceField: 'Lead_Type__c',
    crmField: 'customFields.sf_Lead_Type__c',
    source: 'Processed enquiry lifecycle classification',
    events: ['lead created', 'related enquiry created', 'lead re-opened', 'lead re-engaged'],
    condition: 'Set to one of the configured Fresh, Re-Opened, or Re-Engaged picklist values.',
    updateBehavior: 'Updated for a newly processed enquiry; first and last enquiry history remains on Related Sources.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Lead_source__c',
    crmField: 'customFields.sf_Lead_source__c',
    source: 'Current processed Enquiry.source',
    events: ['lead created', 'related enquiry created'],
    condition: 'Updated when an enquiry is successfully processed with a non-empty source.',
    updateBehavior: 'Last-touch source; updated without changing the Lead owner or project relation.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Sub_Source__c',
    crmField: 'customFields.sf_Sub_Source__c',
    source: 'Current processed Enquiry.subSource',
    events: ['lead created', 'related enquiry created'],
    condition: 'Updated when an enquiry is successfully processed with a non-empty sub-source.',
    updateBehavior: 'Last-touch sub-source; original Main Lead contact and assignment are preserved.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Country_Code__c',
    crmField: 'customFields.sf_Country_Code__c',
    source: 'Lead.countryCode on original Lead creation',
    events: ['lead created'],
    condition: 'Only tagged for a new Main Lead; duplicate-enquiry contact details remain on the Enquiry.',
    updateBehavior: 'Preserved after original creation.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Country__c',
    crmField: 'customFields.sf_Country__c',
    source: 'Lead.country on original Lead creation',
    events: ['lead created'],
    condition: 'Only tagged for a new Main Lead.',
    updateBehavior: 'Preserved after original creation.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Secondary_Phone__c',
    crmField: 'customFields.sf_Secondary_Phone__c',
    source: 'Enquiry.secondaryPhone on original Lead creation',
    events: ['lead created'],
    condition: 'Only tagged for a new Main Lead; duplicate-enquiry contact details remain on the Enquiry.',
    updateBehavior: 'Preserved after original creation.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Secondary_Country_Code__c',
    crmField: 'customFields.sf_Secondary_Country_Code__c',
    source: 'Enquiry.secondaryCountryCode on original Lead creation',
    events: ['lead created'],
    condition: 'Only tagged for a new Main Lead.',
    updateBehavior: 'Preserved after original creation.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Tertiary_Phone__c',
    crmField: 'customFields.sf_Tertiary_Phone__c',
    source: 'Enquiry.tertiaryPhone on original Lead creation',
    events: ['lead created'],
    condition: 'Only tagged for a new Main Lead; duplicate-enquiry contact details remain on the Enquiry.',
    updateBehavior: 'Preserved after original creation.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Email',
    crmField: 'Lead.email',
    source: 'Lead.email',
    events: ['lead created'],
    condition: 'The CRM standard Lead email field is the destination.',
    updateBehavior: 'Original Main Lead contact value is preserved on duplicate enquiries.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Secondary_Email__c',
    crmField: 'customFields.sf_Secondary_Email__c',
    source: 'Enquiry.secondaryEmail on original Lead creation',
    events: ['lead created'],
    condition: 'Only tagged for a new Main Lead.',
    updateBehavior: 'Preserved after original creation.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Campaign__c',
    crmField: 'customFields.sf_Campaign__c',
    source: 'Current processed Enquiry.campaignId',
    events: ['lead created', 'related enquiry created'],
    condition: 'Updated when a campaign ID is present.',
    updateBehavior: 'Updated with the incoming campaign ID.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Campaign_std__c',
    crmField: 'customFields.sf_Campaign_std__c',
    source: 'Current processed Enquiry.campaignId',
    events: ['lead created', 'related enquiry created'],
    condition: 'Updated when a campaign ID is present.',
    updateBehavior: 'Not set because CRM has no Campaign record/relationship to validate the incoming reference against.',
    page: 'Lead detail / Lead Information layout',
    status: 'unresolved',
  },
  {
    object: 'Lead',
    salesforceField: 'Sub_Campaign_ID__c',
    crmField: 'customFields.sf_Sub_Campaign_ID__c',
    source: 'Current processed Enquiry.subCampaignId',
    events: ['lead created', 'related enquiry created'],
    condition: 'Updated when a sub-campaign ID is present.',
    updateBehavior: 'Updated with the incoming sub-campaign ID.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Sub_Campaign__c',
    crmField: 'customFields.sf_Sub_Campaign__c',
    source: 'Current processed Enquiry.subCampaignId',
    events: ['lead created', 'related enquiry created'],
    condition: 'Updated when a sub-campaign ID is present.',
    updateBehavior: 'Not set because CRM has no Sub Campaign record/relationship to validate the incoming reference against.',
    page: 'Lead detail / Lead Information layout',
    status: 'unresolved',
  },
  {
    object: 'Lead',
    salesforceField: 'Allocated_Project__c',
    crmField: 'customFields.sf_Allocated_Project__c',
    source: 'Project associated with the incoming enquiry',
    events: ['lead created', 'related enquiry created'],
    condition: 'Written only when a validated incoming enquiry has a project.',
    updateBehavior: 'Tracks incoming enquiry attribution without changing the Main Lead project relation.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Channel_Partner__c',
    crmField: 'customFields.sf_Channel_Partner__c',
    source: 'Current processed Enquiry.channelPartner',
    events: ['lead created', 'related enquiry created'],
    condition: 'The CRM Enquiry field is a string; it is not known whether it contains a Channel Partner ID or display name.',
    updateBehavior: 'Not set on Lead until the source lookup semantics are confirmed; raw value remains on Enquiry.',
    page: 'Lead detail / Lead Information layout',
    status: 'unresolved',
  },
  {
    object: 'Lead',
    salesforceField: 'Secondary_Country__c',
    crmField: 'customFields.sf_Secondary_Country__c',
    source: 'No corresponding CRM Lead or Enquiry field exists.',
    events: ['unresolved'],
    condition: 'No country value can be derived safely from a country code without the source implementation.',
    updateBehavior: 'Not set.',
    page: 'Lead detail / Lead Information layout',
    status: 'unresolved',
  },
  {
    object: 'Lead',
    salesforceField: 'Followup_Count__c',
    crmField: 'customFields.sf_Followup_Count__c',
    source: 'Count of related FollowUp records',
    events: ['follow-up created', 'updated', 'deleted', 'completed', 'reopened', 'reassigned'],
    condition: 'Recalculated for the affected Lead after each persisted FollowUp change.',
    updateBehavior: 'Always recalculated; zero is retained when there are no related records.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Next_follow_up_Date__c',
    crmField: 'customFields.sf_Next_follow_up_Date__c',
    source: 'Earliest dueDate among incomplete related FollowUp records',
    events: ['follow-up created', 'updated', 'deleted', 'completed', 'reopened', 'reassigned'],
    condition: 'Incomplete FollowUp records are the CRM equivalent of scheduled FollowUps.',
    updateBehavior: 'Recalculated; cleared when no incomplete FollowUp remains.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Lead_Status__c',
    crmField: 'customFields.sf_Lead_Status__c',
    source: 'The existing Lead status plus the triggering workflow event',
    events: ['qualifying follow-up scheduled', 'site visit scheduled', 'site visit completed'],
    condition: 'Follow-up values change only from the specified legacy status labels; site-visit values change only when the existing CRM workflow transitions Lead status.',
    updateBehavior: 'Writes only on the specified transitions; unrelated Lead status values are preserved.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Site_Visit_Schedule_Date__c',
    crmField: 'customFields.sf_Site_Visit_Schedule_Date__c',
    source: 'The relevant scheduled SiteVisit.scheduledAt',
    events: ['site visit scheduled', 'rescheduled', 'cancelled', 'completed', 'reopened'],
    condition: 'Uses the triggering visit date when scheduled; on close, uses another remaining scheduled visit if present.',
    updateBehavior: 'Recalculated on site-visit lifecycle events; cleared when no scheduled visit remains.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Next_Site_visit_Date__c',
    crmField: 'customFields.sf_Next_Site_visit_Date__c',
    source: 'Earliest scheduled SiteVisit.scheduledAt for the Lead',
    events: ['site visit scheduled', 'rescheduled', 'cancelled', 'completed', 'reopened'],
    condition: 'Only SCHEDULED SiteVisit records are considered.',
    updateBehavior: 'Recalculated; cleared when no scheduled SiteVisit remains.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Site_visit_Project__c',
    crmField: 'customFields.sf_Site_visit_Project__c',
    source: 'Project name attached to a scheduled SiteVisit workflow',
    events: ['site visit scheduled', 'rescheduled to another project', 'revisit scheduled'],
    condition: 'Written only when the workflow has validated and established an active project.',
    updateBehavior: 'Updated when an applicable visit establishes a project; preserved on unrelated visits and cancellations.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Site_Visit_Feedback__c',
    crmField: 'customFields.sf_Site_Visit_Feedback__c',
    source: 'Completed SiteVisit.customerFeedback',
    events: ['site visit completed'],
    condition: 'Only written when completion supplies non-empty customer feedback.',
    updateBehavior: 'Preserved during schedule, reschedule, and cancellation; updated on completion with feedback.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'First_Source_Of_Enquiry__c',
    crmField: 'customFields.sf_First_Source_Of_Enquiry__c',
    source: 'First processed Enquiry.source',
    events: ['lead created', 'related enquiry created'],
    condition: 'Only populated if the first-touch value is blank.',
    updateBehavior: 'First-touch value is preserved.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Last_Source_Of_Enquiry__c',
    crmField: 'customFields.sf_Last_Source_Of_Enquiry__c',
    source: 'Current processed Enquiry.source',
    events: ['lead created', 'related enquiry created'],
    condition: 'Updated when an enquiry is successfully processed.',
    updateBehavior: 'Last-touch value is replaced by the current non-empty source.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'First_Sub_Source__c',
    crmField: 'customFields.sf_First_Sub_Source__c',
    source: 'First processed Enquiry.subSource',
    events: ['lead created', 'related enquiry created'],
    condition: 'Only populated when the incoming sub-source is non-empty and the first-touch value is blank.',
    updateBehavior: 'First-touch value is preserved.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Last_Sub_Source__c',
    crmField: 'customFields.sf_Last_Sub_Source__c',
    source: 'Current processed Enquiry.subSource',
    events: ['lead created', 'related enquiry created'],
    condition: 'Updated when an enquiry is successfully processed and contains a sub-source.',
    updateBehavior: 'Last-touch value is replaced when a non-empty sub-source is provided.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'First_Campaign__c',
    crmField: 'customFields.sf_First_Campaign__c',
    source: 'First processed Enquiry.campaign',
    events: ['lead created', 'related enquiry created'],
    condition: 'Only populated when the incoming campaign is non-empty and the first-touch value is blank.',
    updateBehavior: 'First-touch value is preserved.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Last_Campagin__c',
    crmField: 'customFields.sf_Last_Campagin__c',
    source: 'Current processed Enquiry.campaign',
    events: ['lead created', 'related enquiry created'],
    condition: 'Updated when an enquiry is successfully processed and contains a campaign.',
    updateBehavior: 'Last-touch value is replaced when a non-empty campaign is provided.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'First_Approach_On__c',
    crmField: 'customFields.sf_First_Approach_On__c',
    source: 'Lead creation time',
    events: ['lead created'],
    condition: 'The Salesforce source code must establish when a lead is first approached; creation time is not assumed to mean first approach.',
    updateBehavior: 'Not set without the source Apex rule.',
    page: 'Lead detail / Lead Information layout',
    status: 'unresolved',
  },
  {
    object: 'Lead',
    salesforceField: 'Type_of_lead__c',
    crmField: 'customFields.sf_Type_of_lead__c',
    source: 'Salesforce-specific Lead classification',
    events: ['lead created', 'duplicate detected', 'lead re-opened', 'lead re-engaged'],
    condition: 'No authoritative mapping from CRM Lead.leadType values to the Salesforce picklist is available.',
    updateBehavior: 'Not set until the Salesforce assignment branch is supplied.',
    page: 'Lead detail / Lead Information layout',
    status: 'unresolved',
  },
  {
    object: 'Lead',
    salesforceField: 'Last_Re_Engaged_Date__c',
    crmField: 'customFields.sf_Last_Re_Engaged_Date__c',
    source: 'Existing CRM RE_ENGAGED transition timestamp',
    events: ['lead re-engaged'],
    condition: 'Written once for each newly created qualifying re-engagement enquiry.',
    updateBehavior: 'Re-engagement count is incremented in the same transaction; retries that reuse a Related Source do not increment it.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Lead',
    salesforceField: 'Last_Re_Opened_Date__c',
    crmField: 'customFields.sf_Last_Re_Opened_Date__c',
    source: 'A newly processed enquiry matching a Lead with an exact configured lost status',
    events: ['lead re-opened'],
    condition: 'Only written when sf_Lead_Status__c exactly matches LOST_STATUSES.',
    updateBehavior: 'The current operational status is reset to New Enquiry; previous audit and enquiry history is preserved.',
    page: 'Lead detail / Lead Information layout',
    status: 'implemented',
  },
  {
    object: 'Enquiry',
    salesforceField: 'Lead__c',
    crmField: 'Enquiry.leadId',
    source: 'The existing Main Lead selected or matched by processLeadEnquiry',
    events: ['related source created'],
    condition: 'The Enquiry is created in the same transaction as the Lead/source workflow.',
    updateBehavior: 'Required relationship; the original Main Lead is preserved.',
    page: 'Lead detail / Enquiries related list',
    status: 'implemented',
  },
  {
    object: 'Enquiry',
    salesforceField: 'Source__c',
    crmField: 'Enquiry.source',
    source: 'Processed enquiry source',
    events: ['original enquiry created', 'related source created'],
    condition: 'Copied from the current incoming enquiry.',
    updateBehavior: 'Stored per enquiry; prior source records are preserved.',
    page: 'Lead detail / Enquiries related list',
    status: 'implemented',
  },
  {
    object: 'Enquiry',
    salesforceField: 'Sub_Source__c',
    crmField: 'Enquiry.subSource',
    source: 'Processed enquiry sub-source',
    events: ['original enquiry created', 'related source created'],
    condition: 'Copied when supplied.',
    updateBehavior: 'Stored per enquiry; prior source records are preserved.',
    page: 'Lead detail / Enquiries related list',
    status: 'implemented',
  },
  {
    object: 'Enquiry',
    salesforceField: 'Phone__c',
    crmField: 'Enquiry.phone',
    source: 'Normalized incoming primary phone',
    events: ['original enquiry created', 'related source created'],
    condition: 'Copied from the accepted enquiry input.',
    updateBehavior: 'Stored per enquiry, not used to overwrite the Main Lead contact.',
    page: 'Lead detail / Enquiries related list',
    status: 'implemented',
  },
  {
    object: 'Enquiry',
    salesforceField: 'Country_Code__c',
    crmField: 'Enquiry.countryCode',
    source: 'Normalized incoming primary country code',
    events: ['original enquiry created', 'related source created'],
    condition: 'Copied from the accepted enquiry input.',
    updateBehavior: 'Stored per enquiry.',
    page: 'Lead detail / Enquiries related list',
    status: 'implemented',
  },
  {
    object: 'Enquiry',
    salesforceField: 'Secondary_Phone__c',
    crmField: 'Enquiry.secondaryPhone',
    source: 'Normalized incoming secondary phone',
    events: ['original enquiry created', 'related source created'],
    condition: 'Copied when supplied.',
    updateBehavior: 'Stored per enquiry, not used to overwrite the Main Lead contact.',
    page: 'Lead detail / Enquiries related list',
    status: 'implemented',
  },
  {
    object: 'Enquiry',
    salesforceField: 'Tertiary_Phone__c',
    crmField: 'Enquiry.tertiaryPhone',
    source: 'Normalized incoming tertiary phone',
    events: ['original enquiry created', 'related source created'],
    condition: 'Copied when supplied.',
    updateBehavior: 'Stored per enquiry, not used to overwrite the Main Lead contact.',
    page: 'Lead detail / Enquiries related list',
    status: 'implemented',
  },
  {
    object: 'Enquiry',
    salesforceField: 'Secondary_Contry_Code__c',
    crmField: 'Enquiry.secondaryCountryCode',
    source: 'Incoming secondary country code',
    events: ['original enquiry created', 'related source created'],
    condition: 'Copied when supplied.',
    updateBehavior: 'Stored per enquiry.',
    page: 'Lead detail / Enquiries related list',
    status: 'implemented',
  },
  {
    object: 'Enquiry',
    salesforceField: 'Email__c',
    crmField: 'Enquiry.email',
    source: 'Normalized incoming primary email',
    events: ['original enquiry created', 'related source created'],
    condition: 'Copied when supplied.',
    updateBehavior: 'Stored per enquiry, not used to overwrite the Main Lead contact.',
    page: 'Lead detail / Enquiries related list',
    status: 'implemented',
  },
  {
    object: 'Enquiry',
    salesforceField: 'Secondary_Email__c',
    crmField: 'Enquiry.secondaryEmail',
    source: 'Normalized incoming secondary email',
    events: ['original enquiry created', 'related source created'],
    condition: 'Copied when supplied.',
    updateBehavior: 'Stored per enquiry.',
    page: 'Lead detail / Enquiries related list',
    status: 'implemented',
  },
  {
    object: 'Enquiry',
    salesforceField: 'Description__c',
    crmField: 'Enquiry.description',
    source: 'Incoming enquiry description',
    events: ['original enquiry created', 'related source created'],
    condition: 'Copied when supplied.',
    updateBehavior: 'Stored per enquiry.',
    page: 'Lead detail / Enquiries related list',
    status: 'implemented',
  },
  {
    object: 'Enquiry',
    salesforceField: 'Allocated_Project__c',
    crmField: 'Enquiry.projectId',
    source: 'Validated project attached to incoming enquiry',
    events: ['original enquiry created', 'related source created'],
    condition: 'Copied when a valid project is supplied.',
    updateBehavior: 'Stored on Enquiry without replacing the Main Lead project.',
    page: 'Lead detail / Enquiries related list',
    status: 'implemented',
  },
  {
    object: 'Enquiry',
    salesforceField: 'Campaign__c / Campaign_std__c',
    crmField: 'Enquiry.campaignId / Enquiry.campaign',
    source: 'Incoming campaign ID and display value',
    events: ['original enquiry created', 'related source created'],
    condition: 'Copied when supplied; CRM stores both as enquiry data and has no Campaign relation.',
    updateBehavior: 'Stored per enquiry; no campaign relationship is inferred.',
    page: 'Lead detail / Enquiries related list',
    status: 'implemented',
  },
  {
    object: 'Enquiry',
    salesforceField: 'Sub_Campaign_ID__c / Sub_Campaign_Name__c / Sub_Campaign__c',
    crmField: 'Enquiry.subCampaignId / Enquiry.subCampaign',
    source: 'Incoming sub-campaign ID and display value',
    events: ['original enquiry created', 'related source created'],
    condition: 'Copied when supplied; CRM stores values on the Enquiry.',
    updateBehavior: 'Stored per enquiry; no Sub Campaign relationship is inferred.',
    page: 'Lead detail / Enquiries related list',
    status: 'implemented',
  },
  {
    object: 'Enquiry',
    salesforceField: 'type_of_lead__c / Lead_Type__c',
    crmField: 'Enquiry.leadType',
    source: 'Existing processLeadEnquiry action: ORIGINAL, ADDITIONAL, or RE_ENGAGED',
    events: ['original enquiry created', 'duplicate enquiry linked', 'lead re-engaged'],
    condition: 'Copied from the existing CRM duplicate-policy branch.',
    updateBehavior: 'Stored per enquiry.',
    page: 'Lead detail / Enquiries related list',
    status: 'implemented',
  },
  {
    object: 'Enquiry',
    salesforceField: 'Channel_Partner__c',
    crmField: 'Enquiry.channelPartner',
    source: 'Incoming enquiry channelPartner string',
    events: ['original enquiry created', 'related source created'],
    condition: 'Stored as the CRM Enquiry string; whether the value is an ID or display name is unresolved.',
    updateBehavior: 'Original string is preserved on the Enquiry.',
    page: 'Lead detail / Enquiries related list',
    status: 'implemented',
  },
  {
    object: 'FollowUp',
    salesforceField: 'SLead__c',
    crmField: 'FollowUp.leadId',
    source: 'Selected Lead on FollowUp input',
    events: ['follow-up created', 'reassigned'],
    condition: 'Lead access is checked before linking.',
    updateBehavior: 'Old and new Leads are recalculated on reassignment.',
    page: 'Follow-up detail',
    status: 'implemented',
  },
  {
    object: 'FollowUp',
    salesforceField: 'Assigned_To__c / OwnerId',
    crmField: 'FollowUp.ownerId',
    source: 'Assigned user input or current user fallback',
    events: ['follow-up created', 'owner reassigned'],
    condition: 'Assigned user must be active in the same tenant.',
    updateBehavior: 'Saved to ownerId; no Lead owner change.',
    page: 'Follow-up detail',
    status: 'implemented',
  },
  {
    object: 'FollowUp',
    salesforceField: 'Scheduled_Date__c',
    crmField: 'FollowUp.dueDate',
    source: 'Scheduled date input',
    events: ['follow-up created', 'rescheduled'],
    condition: 'Saved from CRM dueDate.',
    updateBehavior: 'Next Lead follow-up date is recalculated.',
    page: 'Follow-up detail',
    status: 'implemented',
  },
  {
    object: 'FollowUp',
    salesforceField: 'Status__c',
    crmField: 'FollowUp.isCompleted / completedAt',
    source: 'CRM completion and reopen actions',
    events: ['follow-up completed', 'follow-up reopened'],
    condition: 'The CRM has Scheduled/Completed state only.',
    updateBehavior: 'Completion removes it from next-date selection; reopening makes it eligible again.',
    page: 'Follow-up detail',
    status: 'implemented',
  },
  {
    object: 'FollowUp',
    salesforceField: 'Owner_s_TL__c / Owner_s_Manager__c',
    crmField: 'No corresponding reporting hierarchy fields',
    source: 'Salesforce hierarchy helper not present in the repository.',
    events: ['follow-up completed'],
    condition: 'No reporting-manager relationship exists on the CRM User model.',
    updateBehavior: 'Not set.',
    page: 'Follow-up detail',
    status: 'unresolved',
  },
  {
    object: 'FollowUp',
    salesforceField: 'Is_System_Cancelled__c',
    crmField: 'No corresponding FollowUp field',
    source: 'Salesforce cancellation workflow not present in the repository.',
    events: ['follow-up status changed'],
    condition: 'No equivalent state is represented in the CRM FollowUp model.',
    updateBehavior: 'Not set.',
    page: 'Follow-up detail',
    status: 'unresolved',
  },
  {
    object: 'SiteVisit',
    salesforceField: 'Lead__c / Project__c / OwnerId / Date__c / Status__c',
    crmField: 'SiteVisit.leadId / projectId / assigneeId / scheduledAt / status',
    source: 'Existing SiteVisit create, reschedule, assignment, completion, cancellation, and revisit routes',
    events: ['site visit scheduled', 'rescheduled', 'completed', 'cancelled', 'reassigned', 'reopened'],
    condition: 'Existing validation and project SVC/Sales routing rules remain authoritative.',
    updateBehavior: 'Persisted to native SiteVisit relations and fields.',
    page: 'Site Visit detail',
    status: 'implemented',
  },
  {
    object: 'SiteVisit',
    salesforceField: 'Feedback__c / Comments__c / Canceled_Reason__c / Reschedule_Date__c / Cancelled_Date__c',
    crmField: 'SiteVisit.feedback / notes / cancellationReason / scheduledAt / cancelledAt',
    source: 'Existing SiteVisit user input and lifecycle routes',
    events: ['site visit scheduled', 'rescheduled', 'cancelled', 'completed'],
    condition: 'Only supplied values and explicit lifecycle transitions are written.',
    updateBehavior: 'Unrelated feedback and visit fields are preserved by partial updates.',
    page: 'Site Visit detail',
    status: 'implemented',
  },
  {
    object: 'SiteVisit',
    salesforceField: 'FLS_TL__c / FLS_Manager__c / Transfer_By_PreSales__c',
    crmField: 'No corresponding reporting or transfer fields',
    source: 'Salesforce hierarchy/transfer helpers not present in the repository.',
    events: ['site visit completed', 'transferred', 'reassigned'],
    condition: 'No User reporting hierarchy or matching persisted fields exist in CRM.',
    updateBehavior: 'Not set.',
    page: 'Site Visit detail',
    status: 'unresolved',
  },
  {
    object: 'SiteVisit',
    salesforceField: 'Missed Site Visit notification',
    crmField: 'SiteVisit.status = MISSED and missedAt',
    source: 'Overdue scheduled SiteVisits are normalized by leadWorkflowExtras.',
    events: ['site visit missed'],
    condition: 'At 6:00 PM in the CRM timezone, a site visit scheduled for that day is still incomplete. Completed visits are left unchanged.',
    updateBehavior: 'Persisted MISSED status and missedAt; no notification is emitted.',
    page: 'Site Visit detail / notifications',
    status: 'implemented',
  },
];

export function asCustomFieldObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function mergeOperationalLeadCustomFields(
  current: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined,
  values: {
    source?: string | null;
    status?: string | null;
    rating?: string | null;
    description?: string | null;
    score?: number | null;
  },
): Record<string, JsonValue> {
  return {
    ...asCustomFieldObject(current as Prisma.JsonValue | null | undefined),
    ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)),
  } as Record<string, JsonValue>;
}

export function updateSalesforceCustomFields(
  current: Prisma.JsonValue | null | undefined,
  updates: Record<string, unknown>,
): Prisma.InputJsonObject {
  return {
    ...asCustomFieldObject(current),
    ...Object.fromEntries(
      Object.entries(updates).map(([apiName, value]) => [`sf_${apiName}`, value]),
    ),
  } as Prisma.InputJsonObject;
}

export function buildLeadFollowUpTagUpdates(
  current: Prisma.JsonValue | null | undefined,
  followUps: Array<{ dueDate: Date; isCompleted: boolean; isMissed?: boolean }>,
): Prisma.InputJsonObject {
  const scheduled = followUps
    .filter((followUp) => !followUp.isCompleted && !followUp.isMissed)
    .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime());
  const leadTags = asCustomFieldObject(current);
  const updates: Record<string, unknown> = {
    Followup_Count__c: followUps.length,
    Next_follow_up_Date__c: scheduled[0]?.dueDate.toISOString() ?? null,
  };
  if (scheduled.length > 0) {
    const currentStatus = leadTags.sf_Lead_Status__c;
    if (currentStatus === 'New Enquiry') updates.Lead_Status__c = 'Follow Up';
    if (currentStatus === 'Recovery - Pre Sales' || currentStatus === 'Recovery - Sales') {
      updates.Lead_Status__c = 'Recovery Followup';
    }
  }
  return updateSalesforceCustomFields(current, updates);
}

export function buildLeadSiteVisitTagUpdates(
  current: Prisma.JsonValue | null | undefined,
  scheduledVisits: Array<{ scheduledAt: Date }>,
  options: {
    scheduledAt?: Date;
    projectName?: string | null;
    leadStatus?: string;
    feedback?: string | null;
  } = {},
): Prisma.InputJsonObject {
  const orderedVisits = [...scheduledVisits]
    .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime());
  const updates: Record<string, unknown> = {
    Site_Visit_Schedule_Date__c:
      (orderedVisits.length > 0
        ? options.scheduledAt ?? orderedVisits[0].scheduledAt
        : null)?.toISOString() ?? null,
    Next_Site_visit_Date__c: orderedVisits[0]?.scheduledAt.toISOString() ?? null,
  };
  if (options.projectName) updates.Site_visit_Project__c = options.projectName;
  if (options.leadStatus) updates.Lead_Status__c = options.leadStatus;
  if (options.feedback?.trim()) updates.Site_Visit_Feedback__c = options.feedback.trim();
  return updateSalesforceCustomFields(current, updates);
}

export function buildLeadEnquiryAttributionUpdates(
  current: Prisma.JsonValue | null | undefined,
  params: {
    source: string;
    subSource?: string;
    campaign?: string;
    campaignId?: string;
    subCampaignId?: string;
    projectName?: string;
    countryCode?: string;
    country?: string;
    secondaryPhone?: string;
    secondaryCountryCode?: string;
    tertiaryPhone?: string;
    secondaryEmail?: string;
    occurredAt: Date;
    lifecycleType?: 'Fresh' | 'Re-Engaged' | 'Re-Opened';
    isLeadCreation?: boolean;
    isReEngaged?: boolean;
    isReOpened?: boolean;
  },
): Prisma.InputJsonObject {
  const currentTags = asCustomFieldObject(current);
  const updates: Record<string, unknown> = {};
  const source = params.source.trim();
  const subSource = params.subSource?.trim();
  const campaign = params.campaign?.trim();

  if (source) {
    updates.Lead_source__c = source;
    if (!currentTags.sf_First_Source_Of_Enquiry__c) updates.First_Source_Of_Enquiry__c = source;
    updates.Last_Source_Of_Enquiry__c = source;
  }
  if (subSource) {
    updates.Sub_Source__c = subSource;
    if (!currentTags.sf_First_Sub_Source__c) updates.First_Sub_Source__c = subSource;
    updates.Last_Sub_Source__c = subSource;
  }
  if (campaign) {
    if (!currentTags.sf_First_Campaign__c) updates.First_Campaign__c = campaign;
    updates.Last_Campagin__c = campaign;
  }
  if (params.lifecycleType) updates.Lead_Type__c = params.lifecycleType;
  if (params.campaignId) updates.Campaign__c = params.campaignId;
  if (params.subCampaignId) updates.Sub_Campaign_ID__c = params.subCampaignId;
  if (params.projectName) updates.Allocated_Project__c = params.projectName;
  if (params.isLeadCreation) {
    if (params.countryCode) updates.Country_Code__c = params.countryCode;
    if (params.country) updates.Country__c = params.country;
    if (params.secondaryPhone) updates.Secondary_Phone__c = params.secondaryPhone;
    if (params.secondaryCountryCode) updates.Secondary_Country_Code__c = params.secondaryCountryCode;
    if (params.tertiaryPhone) updates.Tertiary_Phone__c = params.tertiaryPhone;
    if (params.secondaryEmail) updates.Secondary_Email__c = params.secondaryEmail;
  }
  if (params.isReEngaged) {
    const previousCount = Number(currentTags.sf_Re_engaged_Count__c);
    updates.Last_Re_Engaged_Date__c = params.occurredAt.toISOString();
    updates.Re_engaged_Count__c = Number.isSafeInteger(previousCount) && previousCount >= 0
      ? previousCount + 1
      : 1;
  }
  if (params.isReOpened) {
    updates.Lead_Status__c = 'New Enquiry';
    updates.Last_Re_Opened_Date__c = params.occurredAt.toISOString();
    updates.Lead_Assigned__c = false;
    updates.Lead_Transfered__c = false;
    updates.Assigment_count__c = 0;
    updates.Pre_Sales_Call_Count__c = 0;
    updates.Sales_Call_Count__c = 0;
    updates.pre_sales_last_attempt__c = null;
    updates.pre_sales_last_contacted__c = null;
    updates.sales_last_attempt__c = null;
    updates.sales_last_contacted__c = null;
    updates.Next_follow_up_Date__c = null;
    updates.Site_Visit_Schedule_Date__c = null;
    updates.Site_visit_Project__c = null;
    updates.Next_Site_visit_Date__c = null;
    updates.Closed_Lost_Reason__c = null;
    updates.Remark_for_Closed_Lost__c = null;
    updates.Re_assigned_date__c = null;
    updates.RNR_date__c = null;
  }

  return updateSalesforceCustomFields(current, updates);
}

export async function tagLeadEnquiryAttribution(
  tx: Db,
  params: {
    tenantId: string;
    leadId: string;
    source: string;
    subSource?: string;
    campaign?: string;
    campaignId?: string;
    subCampaignId?: string;
    projectId?: string;
    countryCode?: string;
    country?: string;
    secondaryPhone?: string;
    secondaryCountryCode?: string;
    tertiaryPhone?: string;
    secondaryEmail?: string;
    occurredAt: Date;
    lifecycleType?: 'Fresh' | 'Re-Engaged' | 'Re-Opened';
    isLeadCreation?: boolean;
    isReEngaged?: boolean;
    isReOpened?: boolean;
  },
): Promise<void> {
  const [lead, project] = await Promise.all([
    tx.lead.findFirst({
      where: { id: params.leadId, tenantId: params.tenantId },
      select: { id: true, customFields: true },
    }),
    params.projectId
      ? tx.project.findFirst({
          where: { id: params.projectId, tenantId: params.tenantId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);
  if (!lead) return;
  const customFields = buildLeadEnquiryAttributionUpdates(lead.customFields, {
    ...params,
    projectName: project?.name,
  });
  if (JSON.stringify(customFields) === JSON.stringify(asCustomFieldObject(lead.customFields))) return;

  await tx.lead.update({
    where: { id: params.leadId },
    data: { customFields },
  });
}

export async function tagLeadFollowUpEvents(
  tx: Db,
  tenantId: string,
  leadId: string,
): Promise<void> {
  const [lead, followUps] = await Promise.all([
    tx.lead.findFirst({
      where: { id: leadId, tenantId },
      select: { id: true, customFields: true },
    }),
    tx.followUp.findMany({
      where: { tenantId, leadId },
      select: { dueDate: true, isCompleted: true, isMissed: true },
      orderBy: { dueDate: 'asc' },
    }),
  ]);
  if (!lead) return;

  await tx.lead.update({
    where: { id: leadId },
    data: { customFields: buildLeadFollowUpTagUpdates(lead.customFields, followUps) },
  });
}

export async function tagLeadSiteVisitEvents(
  tx: Db,
  params: {
    tenantId: string;
    leadId: string;
    scheduledAt?: Date;
    projectName?: string | null;
    leadStatus?: string;
    feedback?: string | null;
  },
): Promise<void> {
  const [lead, scheduledVisits] = await Promise.all([
    tx.lead.findFirst({
      where: { id: params.leadId, tenantId: params.tenantId },
      select: { id: true, customFields: true },
    }),
    tx.siteVisit.findMany({
      where: { tenantId: params.tenantId, leadId: params.leadId, status: 'SCHEDULED' },
      select: { scheduledAt: true },
      orderBy: { scheduledAt: 'asc' },
    }),
  ]);
  if (!lead) return;

  await tx.lead.update({
    where: { id: params.leadId },
    data: {
      customFields: buildLeadSiteVisitTagUpdates(lead.customFields, scheduledVisits, params),
    },
  });
}
