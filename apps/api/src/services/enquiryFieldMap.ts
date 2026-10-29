export type EnquiryFieldDisposition =
  | 'enquiry-column'
  | 'enquiry-attribute'
  | 'computed'
  | 'unresolved';

export interface EnquiryFieldMapping {
  label: string;
  salesforceApiName: string;
  fieldType: string;
  disposition: EnquiryFieldDisposition;
  destination: string;
  source: string;
  rule: string;
}

export const ENQUIRY_ATTRIBUTE_KEYS = [
  'Budget_Range__c',
  'Cent_Range__c',
  'Allocated_Project__c',
  'Customer_Delight_User__c',
  'genuinely_interested_in_buying_a_plot__c',
  'Please_confirm__c',
  'Primary__c',
  'Purpose_of_Purchase__c',
  'Referral_By__c',
  'Referral_Date_Time__c',
  'Status__c',
  'type_of_lead__c',
  'Voice_of_customer__c',
  'Dubble__c',
  'scheck__c',
] as const;

export type EnquiryAttributeKey = typeof ENQUIRY_ATTRIBUTE_KEYS[number];

const CHECKBOX_KEYS = new Set<EnquiryAttributeKey>(['Primary__c', 'Dubble__c', 'scheck__c']);

export const ENQUIRY_FIELD_MAP: EnquiryFieldMapping[] = [
  { label: 'Allocated Project', salesforceApiName: 'Allocated_Project__c', fieldType: 'Picklist', disposition: 'enquiry-attribute', destination: 'Enquiry.attributes.Allocated_Project__c', source: 'Lead.customFields.sf_Allocated_Project__c', rule: 'Copy the stored label. The real project link stays on Enquiry.projectId.' },
  { label: 'Booking Validity', salesforceApiName: 'Booking_Validity__c', fieldType: 'Formula (Date/Time)', disposition: 'unresolved', destination: 'Not stored', source: 'No formula body in this repository', rule: 'Do not invent a formula. Booking dates stay on Booking.' },
  { label: 'Budget Range', salesforceApiName: 'Budget_Range__c', fieldType: 'Text(255)', disposition: 'enquiry-attribute', destination: 'Enquiry.attributes.Budget_Range__c', source: 'Lead.customFields.sf_Budget_Range__c', rule: 'Copy text. Do not convert Lead.budget, which is a number.' },
  { label: 'Campaign', salesforceApiName: 'Campaign_std__c', fieldType: 'Lookup(Campaign)', disposition: 'unresolved', destination: 'Enquiry.campaignId', source: 'Incoming campaign id', rule: 'This CRM has no Campaign object. The id is kept as text and is not a lookup.' },
  { label: 'Campaign Name', salesforceApiName: 'Campaign__c', fieldType: 'Text(255)', disposition: 'enquiry-column', destination: 'Enquiry.campaign', source: 'Lead.customFields.sf_Campaign__c or Enquiry.campaign', rule: 'Already stored on the enquiry.' },
  { label: 'Cent Range', salesforceApiName: 'Cent_Range__c', fieldType: 'Picklist', disposition: 'enquiry-attribute', destination: 'Enquiry.attributes.Cent_Range__c', source: 'Lead.customFields.sf_Cent_Range__c', rule: 'Copy the stored value. Picklist values are not in the metadata export.' },
  { label: 'Channel Partner Formula', salesforceApiName: 'Channel_Partner1__c', fieldType: 'Formula (Text)', disposition: 'unresolved', destination: 'Not stored', source: 'No formula body', rule: 'Display Enquiry.channelPartner instead.' },
  { label: 'Channel Partner', salesforceApiName: 'Channel_Partner__c', fieldType: 'Lookup(Channel Partner)', disposition: 'unresolved', destination: 'Enquiry.channelPartner', source: 'Enquiry.channelPartner', rule: 'No Channel Partner object exists. The value remains text.' },
  { label: 'Channel Partner Account', salesforceApiName: 'Account__c', fieldType: 'Lookup(Account)', disposition: 'unresolved', destination: 'Not stored', source: 'No Account object', rule: 'Company is a Lead field and is not moved.' },
  { label: 'Channel Partner Name', salesforceApiName: 'Channel_Partner_Name__c', fieldType: 'Formula (Text)', disposition: 'unresolved', destination: 'Not stored', source: 'No formula body', rule: 'Display Enquiry.channelPartner.' },
  { label: 'Country Code', salesforceApiName: 'Country_Code__c', fieldType: 'Picklist', disposition: 'enquiry-column', destination: 'Enquiry.countryCode', source: 'Enquiry.countryCode', rule: 'Already stored.' },
  { label: 'CP Status', salesforceApiName: 'CP_status__c', fieldType: 'Formula (Text)', disposition: 'unresolved', destination: 'Not stored', source: 'No formula body', rule: 'Not copied.' },
  { label: 'CP Validity', salesforceApiName: 'CP_Validity__c', fieldType: 'Formula (Date/Time)', disposition: 'unresolved', destination: 'Not stored', source: 'No formula body', rule: 'Not copied.' },
  { label: 'Created Date Display', salesforceApiName: 'Created_Date__c', fieldType: 'Formula (Text)', disposition: 'computed', destination: 'Response createdDateDisplay', source: 'Enquiry.createdAt', rule: 'Formatted in Asia/Kolkata when the enquiry is read.' },
  { label: 'Customer Delight User', salesforceApiName: 'Customer_Delight_User__c', fieldType: 'Text(255)', disposition: 'enquiry-attribute', destination: 'Enquiry.attributes.Customer_Delight_User__c', source: 'Lead.customFields.sf_Customer_Delight_User__c', rule: 'Copy text.' },
  { label: 'Description', salesforceApiName: 'Description__c', fieldType: 'Text Area(255)', disposition: 'enquiry-column', destination: 'Enquiry.description', source: 'Enquiry.description', rule: 'Already stored. Lead.description is not removed.' },
  { label: 'Dubble', salesforceApiName: 'Dubble__c', fieldType: 'Checkbox', disposition: 'enquiry-attribute', destination: 'Enquiry.attributes.Dubble__c', source: 'Lead.customFields.sf_Dubble__c', rule: 'Copy boolean.' },
  { label: 'Email', salesforceApiName: 'Email__c', fieldType: 'Email', disposition: 'enquiry-column', destination: 'Enquiry.email', source: 'Enquiry.email', rule: 'Already stored. Lead.email stays for lead qualification.' },
  { label: 'Email Project', salesforceApiName: 'EmailProject__c', fieldType: 'Formula (Text)', disposition: 'unresolved', destination: 'Not stored', source: 'No formula body', rule: 'Not copied.' },
  { label: 'ES Lead Sub Source', salesforceApiName: 'ES_Lead_Sub_Source__c', fieldType: 'Formula (Text)', disposition: 'unresolved', destination: 'Not stored', source: 'No formula body', rule: 'Sub source is already Enquiry.subSource.' },
  { label: 'ES Main Source', salesforceApiName: 'ES_Main_Source__c', fieldType: 'Formula (Text)', disposition: 'unresolved', destination: 'Not stored', source: 'No formula body', rule: 'Source is already Enquiry.source.' },
  { label: 'ES Medium', salesforceApiName: 'ES_Medium__c', fieldType: 'Formula (Text)', disposition: 'unresolved', destination: 'Not stored', source: 'No formula body', rule: 'Medium is already Enquiry.medium.' },
  { label: 'Expired On', salesforceApiName: 'Expired_On__c', fieldType: 'Formula (Date)', disposition: 'unresolved', destination: 'Not stored', source: 'No formula body', rule: 'Not copied.' },
  { label: 'Genuinely Interested in Buying a Plot?', salesforceApiName: 'genuinely_interested_in_buying_a_plot__c', fieldType: 'Text(255)', disposition: 'enquiry-attribute', destination: 'Enquiry.attributes.genuinely_interested_in_buying_a_plot__c', source: 'Lead.customFields', rule: 'Copy text.' },
  { label: 'Interested Project', salesforceApiName: 'Interested_Project__c', fieldType: 'Picklist (Multi-Select)', disposition: 'unresolved', destination: 'Enquiry.projectId', source: 'Validated Project id', rule: 'This CRM stores one project lookup, not a multi-select. The project id is not guessed from a label list.' },
  { label: 'Lead', salesforceApiName: 'Lead__c', fieldType: 'Lookup(Lead)', disposition: 'enquiry-column', destination: 'Enquiry.leadId', source: 'Enquiry.leadId', rule: 'Lookup kept. Not master-detail.' },
  { label: 'Lead ID Display', salesforceApiName: 'Lead_ID__c', fieldType: 'Formula (Text)', disposition: 'computed', destination: 'Response leadNumber', source: 'Lead.leadNumber', rule: 'Read from the related Lead.' },
  { label: 'Lead Name', salesforceApiName: 'Lead_Name__c', fieldType: 'Formula (Text)', disposition: 'computed', destination: 'Response leadName', source: 'Lead.firstName + Lead.lastName', rule: 'Read from the related Lead.' },
  { label: 'Lead Owner', salesforceApiName: 'Lead_Owner__c', fieldType: 'Formula (Text)', disposition: 'computed', destination: 'Response leadOwnerName', source: 'Lead.owner', rule: 'Read from the related Lead. Enquiry.ownerId is the enquiry owner.' },
  { label: 'Lead Type', salesforceApiName: 'Lead_Type__c', fieldType: 'Picklist', disposition: 'enquiry-column', destination: 'Enquiry.leadType', source: 'Enquiry.leadType', rule: 'Already stored.' },
  { label: 'Related Contact', salesforceApiName: 'Contact__c', fieldType: 'Lookup(Contact)', disposition: 'unresolved', destination: 'Not stored', source: 'No Contact object', rule: 'Not created.' },
  { label: 'Medium', salesforceApiName: 'Medium__c', fieldType: 'Text(255)', disposition: 'enquiry-column', destination: 'Enquiry.medium', source: 'Enquiry.medium', rule: 'Already stored.' },
  { label: 'Opportunity', salesforceApiName: 'Opportunity__c', fieldType: 'Lookup(Opportunity)', disposition: 'unresolved', destination: 'Not stored', source: 'Opportunity is a Lead lookup in this CRM, not an object', rule: 'Not created as a second lookup.' },
  { label: 'Owner', salesforceApiName: 'OwnerId', fieldType: 'Lookup(User)', disposition: 'enquiry-column', destination: 'Enquiry.ownerId', source: 'Lead.ownerId on backfill; editable afterwards', rule: 'Enquiry keeps its own owner. Changing it does not change the Lead owner.' },
  { label: 'Phone', salesforceApiName: 'Phone__c', fieldType: 'Phone', disposition: 'enquiry-column', destination: 'Enquiry.phone', source: 'Enquiry.phone', rule: 'Already stored. Lead.phone stays.' },
  { label: 'Phone with Country Code', salesforceApiName: 'Phone_with_Country_Code__c', fieldType: 'Phone', disposition: 'computed', destination: 'Response phoneWithCountryCode', source: 'Enquiry.countryCode + Enquiry.phone', rule: 'Combined for display. Not a second stored phone.' },
  { label: 'Phone Project', salesforceApiName: 'PhoneProject__c', fieldType: 'Formula (Text)', disposition: 'unresolved', destination: 'Not stored', source: 'No formula body', rule: 'Not copied.' },
  { label: 'Please Confirm', salesforceApiName: 'Please_confirm__c', fieldType: 'Text(255)', disposition: 'enquiry-attribute', destination: 'Enquiry.attributes.Please_confirm__c', source: 'Lead.customFields', rule: 'Copy text.' },
  { label: 'Primary', salesforceApiName: 'Primary__c', fieldType: 'Checkbox', disposition: 'enquiry-attribute', destination: 'Enquiry.attributes.Primary__c', source: 'Lead.customFields.sf_Primary__c', rule: 'Copy boolean.' },
  { label: 'Purpose of Purchase', salesforceApiName: 'Purpose_of_Purchase__c', fieldType: 'Text(255)', disposition: 'enquiry-attribute', destination: 'Enquiry.attributes.Purpose_of_Purchase__c', source: 'Lead.customFields', rule: 'Copy text.' },
  { label: 'Referral By', salesforceApiName: 'Referral_By__c', fieldType: 'Text(255)', disposition: 'enquiry-attribute', destination: 'Enquiry.attributes.Referral_By__c', source: 'Lead.customFields', rule: 'Copy text.' },
  { label: 'Referral Date & Time', salesforceApiName: 'Referral_Date_Time__c', fieldType: 'Date/Time', disposition: 'enquiry-attribute', destination: 'Enquiry.attributes.Referral_Date_Time__c', source: 'Lead.customFields', rule: 'Copy an ISO date string when the source value parses as a date.' },
  { label: 'Related Source', salesforceApiName: 'Name', fieldType: 'Auto Number', disposition: 'enquiry-column', destination: 'Enquiry.enquiryNumber', source: 'ENQ-###### sequence', rule: 'The enquiry number is the only auto-number. A second Name auto-number is not created.' },
  { label: 'scheck', salesforceApiName: 'scheck__c', fieldType: 'Checkbox', disposition: 'enquiry-attribute', destination: 'Enquiry.attributes.scheck__c', source: 'Lead.customFields', rule: 'Copy boolean.' },
  { label: 'Secondary Country Code', salesforceApiName: 'Secondary_Contry_Code__c', fieldType: 'Picklist', disposition: 'enquiry-column', destination: 'Enquiry.secondaryCountryCode', source: 'Enquiry.secondaryCountryCode', rule: 'Already stored. The Salesforce name typo is not added as a second field.' },
  { label: 'Secondary Email', salesforceApiName: 'Secondary_Email__c', fieldType: 'Email', disposition: 'enquiry-column', destination: 'Enquiry.secondaryEmail', source: 'Enquiry.secondaryEmail', rule: 'Already stored.' },
  { label: 'Secondary Phone', salesforceApiName: 'Secondary_Phone__c', fieldType: 'Phone', disposition: 'enquiry-column', destination: 'Enquiry.secondaryPhone', source: 'Enquiry.secondaryPhone', rule: 'Already stored.' },
  { label: 'Secondary Email Project', salesforceApiName: 'SecondaryEmailProject__c', fieldType: 'Formula (Text)', disposition: 'unresolved', destination: 'Not stored', source: 'No formula body', rule: 'Not copied.' },
  { label: 'Secondary Phone Project', salesforceApiName: 'SecondaryPhoneProject__c', fieldType: 'Formula (Text)', disposition: 'unresolved', destination: 'Not stored', source: 'No formula body', rule: 'Not copied.' },
  { label: 'Site Visit Project', salesforceApiName: 'Site_visit_Project__c', fieldType: 'Picklist', disposition: 'unresolved', destination: 'SiteVisit.projectId', source: 'Site visit records', rule: 'Site visits stay on SiteVisit. They are not copied onto the enquiry.' },
  { label: 'Site Visit Date Time', salesforceApiName: 'Site_visit_Date_time__c', fieldType: 'Date/Time', disposition: 'unresolved', destination: 'SiteVisit.scheduledAt', source: 'Site visit records', rule: 'Not copied onto the enquiry.' },
  { label: 'Site Visit Validity', salesforceApiName: 'Site_Visit_Validity__c', fieldType: 'Formula (Date/Time)', disposition: 'unresolved', destination: 'Not stored', source: 'No formula body', rule: 'Not copied.' },
  { label: 'Source', salesforceApiName: 'Source__c', fieldType: 'Text(255)', disposition: 'enquiry-column', destination: 'Enquiry.source', source: 'Enquiry.source', rule: 'Already stored. Lead.source stays for qualification.' },
  { label: 'Status', salesforceApiName: 'Status__c', fieldType: 'Picklist', disposition: 'enquiry-attribute', destination: 'Enquiry.attributes.Status__c', source: 'Lead.customFields.sf_Status__c when present', rule: 'Enquiry status is separate from Lead.status. Lead status is not overwritten.' },
  { label: 'Sub Campaign', salesforceApiName: 'Sub_Campaign__c', fieldType: 'Lookup(Sub Campaign)', disposition: 'unresolved', destination: 'Enquiry.subCampaignId', source: 'Incoming sub-campaign id', rule: 'No Sub Campaign object exists. The id and name stay as text.' },
  { label: 'Sub Campaign Name', salesforceApiName: 'Sub_Campaign_Name__c', fieldType: 'Text(255)', disposition: 'enquiry-column', destination: 'Enquiry.subCampaign', source: 'Enquiry.subCampaign', rule: 'Already stored.' },
  { label: 'Sub Source', salesforceApiName: 'Sub_Source__c', fieldType: 'Text(255)', disposition: 'enquiry-column', destination: 'Enquiry.subSource', source: 'Enquiry.subSource', rule: 'Already stored.' },
  { label: 'Submission Date', salesforceApiName: 'Submission_Date__c', fieldType: 'Date/Time', disposition: 'enquiry-column', destination: 'Enquiry.enquiryDate', source: 'Enquiry.enquiryDate', rule: 'Already stored.' },
  { label: 'Tertiary Country Code', salesforceApiName: 'Tertiary_Country_Code__c', fieldType: 'Picklist', disposition: 'enquiry-column', destination: 'Enquiry.tertiaryCountryCode', source: 'Enquiry.tertiaryCountryCode', rule: 'Already stored.' },
  { label: 'Tertiary Phone', salesforceApiName: 'Tertiary_Phone__c', fieldType: 'Phone', disposition: 'enquiry-column', destination: 'Enquiry.tertiaryPhone', source: 'Enquiry.tertiaryPhone', rule: 'Already stored.' },
  { label: 'Tertiary Phone Project', salesforceApiName: 'TertiaryPhoneProject__c', fieldType: 'Formula (Text)', disposition: 'unresolved', destination: 'Not stored', source: 'No formula body', rule: 'Not copied.' },
  { label: 'Type of Lead', salesforceApiName: 'type_of_lead__c', fieldType: 'Picklist', disposition: 'enquiry-attribute', destination: 'Enquiry.attributes.type_of_lead__c', source: 'Lead.customFields', rule: 'Copy text. This is not Lead.leadType.' },
  { label: 'Voice of Customer', salesforceApiName: 'Voice_of_customer__c', fieldType: 'Picklist', disposition: 'enquiry-attribute', destination: 'Enquiry.attributes.Voice_of_customer__c', source: 'Lead.customFields', rule: 'Copy the stored value. Picklist values are not in the metadata export.' },
];

export const LEAD_FIELDS_APPROVED_FOR_DELETION = [
  'sf_Allocated_Project__c',
  'sf_Booking_Validity__c',
  'sf_Budget_Range__c',
  'sf_Campaign_std__c',
  'sf_Campaign__c',
  'sf_Cent_Range__c',
  'sf_Channel_Partner1__c',
  'sf_Channel_Partner__c',
  'sf_Account__c',
  'sf_Channel_Partner_Name__c',
  'sf_Country_Code__c',
  'sf_CP_status__c',
  'sf_CP_Validity__c',
  'sf_Created_Date__c',
  'sf_Customer_Delight_User__c',
  'sf_Description__c',
  'sf_Dubble__c',
  'sf_Email__c',
  'sf_EmailProject__c',
  'sf_ES_Lead_Sub_Source__c',
  'sf_ES_Main_Source__c',
  'sf_ES_Medium__c',
  'sf_Expired_On__c',
  'sf_genuinely_interested_in_buying_a_plot__c',
  'sf_Interested_Project__c',
  'sf_Lead__c',
  'sf_Lead_ID__c',
  'sf_Lead_Name__c',
  'sf_Lead_Owner__c',
  'sf_Lead_Type__c',
  'sf_Contact__c',
  'sf_Medium__c',
  'sf_Opportunity__c',
  'sf_OwnerId',
  'sf_Phone__c',
  'sf_Phone_with_Country_Code__c',
  'sf_PhoneProject__c',
  'sf_Please_confirm__c',
  'sf_Primary__c',
  'sf_Purpose_of_Purchase__c',
  'sf_Referral_By__c',
  'sf_Referral_Date_Time__c',
  'sf_Name',
  'sf_scheck__c',
  'sf_Secondary_Contry_Code__c',
  'sf_Secondary_Email__c',
  'sf_Secondary_Phone__c',
  'sf_SecondaryEmailProject__c',
  'sf_SecondaryPhoneProject__c',
  'sf_Site_visit_Project__c',
  'sf_Site_visit_Date_time__c',
  'sf_Site_Visit_Validity__c',
  'sf_Source__c',
  'sf_Status__c',
  'sf_Sub_Campaign__c',
  'sf_Sub_Campaign_Name__c',
  'sf_Sub_Source__c',
  'sf_Submission_Date__c',
  'sf_Tertiary_Country_Code__c',
  'sf_Tertiary_Phone__c',
  'sf_TertiaryPhoneProject__c',
  'sf_type_of_lead__c',
  'sf_Voice_of_customer__c',
  'sf_First_Source_Of_Enquiry__c',
  'sf_Last_Source_Of_Enquiry__c',
];

function customFieldValue(customFields: Record<string, unknown> | null | undefined, apiName: string): unknown {
  if (!customFields) return undefined;
  if (customFields[apiName] !== undefined) return customFields[apiName];
  if (customFields[`sf_${apiName}`] !== undefined) return customFields[`sf_${apiName}`];
  return undefined;
}

function asText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 255);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function asCheckbox(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 'yes') return true;
  if (value === 'false' || value === '0' || value === 'no') return false;
  return undefined;
}

function asDateTime(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function extractEnquiryAttributes(customFields: unknown): Record<string, string | boolean> {
  const source = customFields && typeof customFields === 'object' && !Array.isArray(customFields)
    ? customFields as Record<string, unknown>
    : {};
  const attributes: Record<string, string | boolean> = {};
  for (const key of ENQUIRY_ATTRIBUTE_KEYS) {
    const raw = customFieldValue(source, key);
    if (CHECKBOX_KEYS.has(key)) {
      const checked = asCheckbox(raw);
      if (checked !== undefined) attributes[key] = checked;
      continue;
    }
    if (key === 'Referral_Date_Time__c') {
      const date = asDateTime(raw);
      if (date) attributes[key] = date;
      continue;
    }
    const text = asText(raw);
    if (text) attributes[key] = text;
  }
  return attributes;
}

export function applyEnquiryAttributePatch(current: unknown, patch: Record<string, unknown>): Record<string, string | boolean> {
  const next = current && typeof current === 'object' && !Array.isArray(current)
    ? { ...(current as Record<string, string | boolean>) }
    : {};
  for (const key of ENQUIRY_ATTRIBUTE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const value = patch[key];
    if (CHECKBOX_KEYS.has(key)) {
      const checked = asCheckbox(value);
      if (checked === undefined) delete next[key];
      else next[key] = checked;
      continue;
    }
    const stored = key === 'Referral_Date_Time__c' ? asDateTime(value) : asText(value);
    if (!stored) delete next[key];
    else next[key] = stored;
  }
  return next;
}

export function mergeEnquiryAttributes(
  current: unknown,
  incoming: Record<string, string | boolean>,
): Record<string, string | boolean> {
  const base = current && typeof current === 'object' && !Array.isArray(current)
    ? { ...(current as Record<string, string | boolean>) }
    : {};
  for (const [key, value] of Object.entries(incoming)) {
    const existing = base[key];
    if (existing === undefined || existing === null || existing === '') base[key] = value;
  }
  return base;
}

export function enquiryBackfillKey(leadId: string): string {
  return `backfill:${leadId}`;
}
