import { describe, expect, it } from 'vitest';
import {
  buildLeadEnquiryAttributionUpdates,
  buildLeadFollowUpTagUpdates,
  buildLeadSiteVisitTagUpdates,
  classifyMatchedLeadLifecycle,
  FIELD_TAGGING_REGISTRY,
  isConfiguredLostStatus,
  mergeOperationalLeadCustomFields,
} from './leadEventTagging';

describe('Lead event tag mapping', () => {
  it('preserves first-touch attribution and updates last-touch enquiry details', () => {
    const occurredAt = new Date('2026-10-11T16:00:00.000Z');
    const result = buildLeadEnquiryAttributionUpdates(
      {
        sf_First_Source_Of_Enquiry__c: 'Referral',
        sf_First_Sub_Source__c: 'Existing Sub-source',
        sf_First_Campaign__c: 'Initial Campaign',
        sf_Custom_Note__c: 'keep',
      },
      {
        source: 'Website',
        subSource: 'Landing Page',
        campaign: 'October Campaign',
        campaignId: 'campaign-2',
        subCampaignId: 'sub-campaign-2',
        projectName: 'DCT Heights',
        occurredAt,
      },
    );

    expect(result).toMatchObject({
      sf_First_Source_Of_Enquiry__c: 'Referral',
      sf_Last_Source_Of_Enquiry__c: 'Website',
      sf_First_Sub_Source__c: 'Existing Sub-source',
      sf_Last_Sub_Source__c: 'Landing Page',
      sf_First_Campaign__c: 'Initial Campaign',
      sf_Last_Campagin__c: 'October Campaign',
      sf_Campaign__c: 'campaign-2',
      sf_Sub_Campaign_ID__c: 'sub-campaign-2',
      sf_Allocated_Project__c: 'DCT Heights',
      sf_Custom_Note__c: 'keep',
    });
  });

  it('tags a new Main Lead with the configured Fresh Lead Type', () => {
    const result = buildLeadEnquiryAttributionUpdates({}, {
      source: 'Website',
      occurredAt: new Date('2026-10-11T16:00:00.000Z'),
      lifecycleType: 'Fresh',
    });

    expect(result.sf_Lead_Type__c).toBe('Fresh');
  });

  it('increments the re-engaged count and stamps the last re-engaged date', () => {
    const result = buildLeadEnquiryAttributionUpdates(
      { sf_Re_engaged_Count__c: 2 },
      {
        source: 'Referral',
        occurredAt: new Date('2026-10-11T16:00:00.000Z'),
        lifecycleType: 'Re-Engaged',
        isReEngaged: true,
      },
    );

    expect(result).toMatchObject({
      sf_Lead_Type__c: 'Re-Engaged',
      sf_Re_engaged_Count__c: 3,
      sf_Last_Re_Engaged_Date__c: '2026-10-11T16:00:00.000Z',
    });
  });

  it('tags reopened Leads and resets only current operational tags', () => {
    const result = buildLeadEnquiryAttributionUpdates(
      { sf_Custom_Note__c: 'preserve this' },
      {
        source: 'Website',
        occurredAt: new Date('2026-10-11T16:00:00.000Z'),
        lifecycleType: 'Re-Opened',
        isReOpened: true,
      },
    );

    expect(result).toMatchObject({
      sf_Lead_Type__c: 'Re-Opened',
      sf_Lead_Status__c: 'New Enquiry',
      sf_Last_Re_Opened_Date__c: '2026-10-11T16:00:00.000Z',
      sf_Lead_Assigned__c: false,
      sf_Lead_Transfered__c: false,
      sf_Assigment_count__c: 0,
      sf_Next_follow_up_Date__c: null,
      sf_Site_Visit_Schedule_Date__c: null,
      sf_Site_visit_Project__c: null,
      sf_Custom_Note__c: 'preserve this',
    });
  });

  it('matches configured lost status labels exactly', () => {
    for (const status of ['Abandoned', 'Recovery - Pre Sales', 'Recovery - Sales', 'Recovery Followup']) {
      expect(isConfiguredLostStatus(status)).toBe(true);
      expect(classifyMatchedLeadLifecycle('LOST', status)).toBe('Re-Opened');
    }
    expect(isConfiguredLostStatus('recovery - pre sales')).toBe(false);
    expect(isConfiguredLostStatus('LOST')).toBe(false);
    expect(classifyMatchedLeadLifecycle('LOST', null)).toBe('Re-Opened');
    expect(classifyMatchedLeadLifecycle('NEW', 'Recovery - Sales')).toBe('Re-Opened');
    expect(classifyMatchedLeadLifecycle('NEW', null)).toBe('Re-Engaged');
  });

  it('populates initial contact tags only on Main Lead creation', () => {
    const occurredAt = new Date('2026-10-11T16:00:00.000Z');
    const result = buildLeadEnquiryAttributionUpdates({}, {
      source: 'Website',
      occurredAt,
      isLeadCreation: true,
      countryCode: '+91',
      country: 'India',
      secondaryPhone: '+919876543210',
      secondaryCountryCode: '+91',
      tertiaryPhone: '+919876543211',
      secondaryEmail: 'other@example.test',
    });
    expect(result).toMatchObject({
      sf_Country_Code__c: '+91',
      sf_Country__c: 'India',
      sf_Secondary_Phone__c: '+919876543210',
      sf_Secondary_Country_Code__c: '+91',
      sf_Tertiary_Phone__c: '+919876543211',
      sf_Secondary_Email__c: 'other@example.test',
    });
    expect(result).not.toHaveProperty('sf_First_Approach_On__c');
  });

  it('keeps operational Lead values mirrored in the custom field JSON', () => {
    const result = mergeOperationalLeadCustomFields(
      { existingCustomValue: 'preserve', source: 'WEBSITE' },
      {
        source: 'FACEBOOK',
        status: 'NEW',
        rating: 'HOT',
        description: 'Requested a viewing',
        score: 5,
      },
    );

    expect(result).toMatchObject({
      existingCustomValue: 'preserve',
      source: 'FACEBOOK',
      status: 'NEW',
      rating: 'HOT',
      description: 'Requested a viewing',
      score: 5,
    });
  });

  it('recalculates follow-up count and the earliest open date without replacing unrelated tags', () => {
    const result = buildLeadFollowUpTagUpdates(
      { sf_Lead_Status__c: 'New Enquiry', sf_Custom_Note__c: 'keep' },
      [
        { dueDate: new Date('2026-10-15T09:00:00.000Z'), isCompleted: false },
        { dueDate: new Date('2026-10-12T09:00:00.000Z'), isCompleted: true },
        { dueDate: new Date('2026-10-13T09:00:00.000Z'), isCompleted: false },
      ],
    );

    expect(result).toMatchObject({
      sf_Followup_Count__c: 3,
      sf_Next_follow_up_Date__c: '2026-10-13T09:00:00.000Z',
      sf_Lead_Status__c: 'Follow Up',
      sf_Custom_Note__c: 'keep',
    });
  });

  it('clears the next follow-up date when none remain and preserves the legacy Lead status', () => {
    const result = buildLeadFollowUpTagUpdates(
      { sf_Lead_Status__c: 'Recovery - Sales', sf_Custom_Note__c: 'keep' },
      [{ dueDate: new Date('2026-10-12T09:00:00.000Z'), isCompleted: true }],
    );

    expect(result).toMatchObject({
      sf_Followup_Count__c: 1,
      sf_Next_follow_up_Date__c: null,
      sf_Lead_Status__c: 'Recovery - Sales',
      sf_Custom_Note__c: 'keep',
    });
  });

  it('does not keep missed follow-ups as the next scheduled date', () => {
    const result = buildLeadFollowUpTagUpdates(
      {},
      [
        { dueDate: new Date('2026-10-12T09:00:00.000Z'), isCompleted: false, isMissed: true },
        { dueDate: new Date('2026-10-13T09:00:00.000Z'), isCompleted: false },
      ],
    );

    expect(result.sf_Next_follow_up_Date__c).toBe('2026-10-13T09:00:00.000Z');
  });

  it('tags a scheduled Site Visit and only changes feedback when supplied', () => {
    const result = buildLeadSiteVisitTagUpdates(
      { sf_Site_Visit_Feedback__c: 'previous feedback', sf_Custom_Note__c: 'keep' },
      [
        { scheduledAt: new Date('2026-10-13T09:00:00.000Z') },
        { scheduledAt: new Date('2026-10-15T09:00:00.000Z') },
      ],
      {
        scheduledAt: new Date('2026-10-15T09:00:00.000Z'),
        projectName: 'DCT Heights',
        leadStatus: 'Site Visit Scheduled',
      },
    );

    expect(result).toMatchObject({
      sf_Site_Visit_Schedule_Date__c: '2026-10-15T09:00:00.000Z',
      sf_Next_Site_visit_Date__c: '2026-10-13T09:00:00.000Z',
      sf_Site_visit_Project__c: 'DCT Heights',
      sf_Site_Visit_Feedback__c: 'previous feedback',
      sf_Lead_Status__c: 'Site Visit Scheduled',
      sf_Custom_Note__c: 'keep',
    });
  });

  it('clears scheduled dates when no scheduled visits remain and saves completion feedback', () => {
    const result = buildLeadSiteVisitTagUpdates(
      { sf_Site_visit_Project__c: 'DCT Heights', sf_Custom_Note__c: 'keep' },
      [],
      { feedback: '  Visit completed  ', leadStatus: 'Site Visit Completed' },
    );

    expect(result).toMatchObject({
      sf_Site_Visit_Schedule_Date__c: null,
      sf_Next_Site_visit_Date__c: null,
      sf_Site_Visit_Feedback__c: 'Visit completed',
      sf_Site_visit_Project__c: 'DCT Heights',
      sf_Lead_Status__c: 'Site Visit Completed',
      sf_Custom_Note__c: 'keep',
    });
  });

  it('marks only Salesforce-source-dependent mappings as unresolved instead of guessing', () => {
    expect(FIELD_TAGGING_REGISTRY.find((mapping) => mapping.salesforceField === 'Last_Re_Opened_Date__c')?.status)
      .toBe('implemented');
    expect(FIELD_TAGGING_REGISTRY.find((mapping) => mapping.salesforceField === 'First_Approach_On__c')?.status)
      .toBe('unresolved');
  });
});
