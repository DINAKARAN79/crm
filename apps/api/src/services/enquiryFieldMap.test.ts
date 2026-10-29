import { describe, expect, it } from 'vitest';
import {
  ENQUIRY_FIELD_MAP,
  LEAD_FIELDS_APPROVED_FOR_DELETION,
  enquiryBackfillKey,
  extractEnquiryAttributes,
  mergeEnquiryAttributes,
} from './enquiryFieldMap';

describe('enquiry field mapping', () => {
  it('covers the requested enquiry fields and the Lead fields approved for removal', () => {
    expect(ENQUIRY_FIELD_MAP.map((field) => field.salesforceApiName)).toEqual(expect.arrayContaining([
      'Lead__c',
      'Budget_Range__c',
      'Name',
      'Campaign_std__c',
      'Opportunity__c',
    ]));
    expect(LEAD_FIELDS_APPROVED_FOR_DELETION).toContain('sf_Budget_Range__c');
    expect(LEAD_FIELDS_APPROVED_FOR_DELETION).toContain('sf_First_Source_Of_Enquiry__c');
    expect(LEAD_FIELDS_APPROVED_FOR_DELETION).not.toContain('phone');
    expect(LEAD_FIELDS_APPROVED_FOR_DELETION).not.toContain('status');
    expect(ENQUIRY_FIELD_MAP.find((field) => field.salesforceApiName === 'Name')?.destination).toBe('Enquiry.enquiryNumber');
  });

  it('copies only enquiry attributes and ignores the numeric lead budget', () => {
    expect(extractEnquiryAttributes({
      sf_Budget_Range__c: '25 lakhs',
      budget: 2500000,
      sf_Primary__c: 'true',
      Referral_Date_Time__c: 'not-a-date',
      sf_Voice_of_customer__c: 'Warm',
    })).toEqual({
      Budget_Range__c: '25 lakhs',
      Primary__c: true,
      Voice_of_customer__c: 'Warm',
    });
  });

  it('fills empty enquiry attributes without overwriting a rerun', () => {
    const first = mergeEnquiryAttributes({}, { Budget_Range__c: '25 lakhs', Primary__c: false });
    const second = mergeEnquiryAttributes(first, { Budget_Range__c: '50 lakhs', Purpose_of_Purchase__c: 'Investment' });
    expect(second).toEqual({
      Budget_Range__c: '25 lakhs',
      Primary__c: false,
      Purpose_of_Purchase__c: 'Investment',
    });
    expect(enquiryBackfillKey('lead-1')).toBe('backfill:lead-1');
  });
});
