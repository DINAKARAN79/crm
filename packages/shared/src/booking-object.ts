import { BOOKING_SALESFORCE_DETAIL_FIELDS } from './booking-salesforce-fields';

export const BOOKING_OBJECT = {
  name: 'Booking',
  label: 'Booking',
  pluralLabel: 'Bookings',
  icon: 'book-open-check',
  description: 'Plot bookings created from quotations',
} as const;

export const BOOKING_STAGE_OPTIONS = [
  { value: 'NEW_BOOKING', label: 'New Booking' },
  { value: 'WELCOME_CALL', label: 'Welcome Call' },
  { value: 'WELCOME_MAIL_RECEIPT_SENT', label: 'Welcome Mail & Receipt Sent' },
  { value: 'PARENT_DOCUMENT_SENT', label: 'Parent Document Sent' },
  { value: 'QUERIES', label: 'Queries' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

type BookingFieldSpec = {
  name: string;
  label: string;
  fieldType: string;
  lookupObject?: string;
  section: string;
  editable?: boolean;
};

const BASIC = 'Basic Details';
const PROPERTY = 'Plot Details';
const WELCOME = 'Welcome Call, Calculation Sheet, Google Review';
const FIRST = 'First Applicant Details';
const SECOND = 'Second Applicant Details';
const PROFESSION = 'Profession';
const REFERRAL = 'Referral';
const AGREEMENT = 'Agreement Stage';
const FUNDING = 'Funding Stage';
const NOC = 'NOC Stage';
const WITNESS = 'Witness Details';
const REGISTRATION = 'Registration Stage';
const CANCELLATION = 'Cancellation Stage';
const APPROVERS = 'Approvers';
const SYSTEM = 'System Information';

export type BookingDetailField = {
  name: string;
  label: string;
  fieldType: 'text' | 'longText' | 'email' | 'phone' | 'date' | 'dateTime' | 'number' | 'currency' | 'checkbox' | 'lookup' | 'picklist';
  section: string;
  editable?: boolean;
  lookupObject?: string;
};

export const BOOKING_DETAIL_FIELDS: BookingDetailField[] = [
  { name: 'bookingNumber', label: 'Booking ID', fieldType: 'text', section: BASIC, editable: false },
  { name: 'bookingStage', label: 'Booking Stage', fieldType: 'picklist', section: BASIC, editable: false },
  { name: 'status', label: 'Reservation Status', fieldType: 'text', section: BASIC, editable: false },
  { name: 'bookingDate', label: 'Booking Date', fieldType: 'date', section: BASIC, editable: false },
  { name: 'bookingDay', label: 'Booking Day', fieldType: 'text', section: BASIC, editable: false },
  { name: 'project', label: 'Project', fieldType: 'lookup', lookupObject: 'Project', section: BASIC, editable: false },
  { name: 'approvalStatus', label: 'Approval Status', fieldType: 'text', section: BASIC },
  { name: 'finalNocApprovalStatus', label: 'Final NOC Approval Status', fieldType: 'text', section: BASIC },
  { name: 'leadCategory', label: 'Lead Category', fieldType: 'text', section: BASIC },
  { name: 'plotSqFt', label: 'Plot Sq.ft', fieldType: 'number', section: BASIC, editable: false },
  { name: 'sanctionDate', label: 'Sanction Date', fieldType: 'date', section: BASIC },
  { name: 'bankExecutiveName', label: 'Bank Executive Name', fieldType: 'text', section: BASIC },
  { name: 'bankStatus', label: 'Bank Status', fieldType: 'text', section: BASIC },
  { name: 'siteVisitCompletedDate', label: 'Site Visit Completed Date', fieldType: 'dateTime', section: BASIC },
  { name: 'nocStage', label: 'NOC Stage', fieldType: 'text', section: BASIC },
  { name: 'pushedToCrmDate', label: 'Pushed to CRM Date', fieldType: 'date', section: BASIC },
  { name: 'isSwapped', label: 'Is Swapped', fieldType: 'checkbox', section: BASIC },
  { name: 'receivedAmountTotal', label: 'Received Amount in Total', fieldType: 'currency', section: BASIC },
  { name: 'pushToCrmAging', label: 'Push To CRM Aging', fieldType: 'date', section: BASIC },
  { name: 'previousBookingOwner', label: 'Previous Booking Owner', fieldType: 'text', section: BASIC },
  { name: 'secondOwnerPushToCrmDate', label: 'Second Owner Push To CRM Date', fieldType: 'date', section: BASIC },
  { name: 'isBookingSecondOwner', label: 'Is the Booking Second Owner', fieldType: 'checkbox', section: BASIC },
  { name: 'agreementDate', label: 'Agreement Date', fieldType: 'date', section: BASIC },
  { name: 'bookingProfileName', label: 'Booking Profile Name', fieldType: 'text', section: BASIC },
  { name: 'retainedDate', label: 'Retained Date', fieldType: 'date', section: BASIC },
  { name: 'unitStatus', label: 'Unit Status', fieldType: 'text', section: BASIC, editable: false },
  { name: 'maxFilesAllottedToCrm', label: 'Max Files Allotted to CRM', fieldType: 'number', section: BASIC },
  { name: 'welcomeCallDoneBy', label: 'Welcome Call Done By', fieldType: 'text', section: BASIC },
  { name: 'paidAmount', label: 'Paid Amount', fieldType: 'currency', section: BASIC },
  { name: 'giftHamperName', label: 'Gift Hamper Name', fieldType: 'text', section: BASIC },
  { name: 'giftHamperDate', label: 'Gift Hamper Date', fieldType: 'date', section: BASIC },
  { name: 'giftHamperValue', label: 'Gift Hamper Value', fieldType: 'currency', section: BASIC },
  { name: 'bookingSalesTl', label: 'Booking Sales TL', fieldType: 'text', section: BASIC },
  { name: 'bookingFlsManager', label: 'Booking FLS Manager', fieldType: 'text', section: BASIC },
  { name: 'bookingOwner', label: 'Booking Owner', fieldType: 'lookup', lookupObject: 'User', section: BASIC, editable: false },
  { name: 'lead', label: 'Lead', fieldType: 'lookup', lookupObject: 'Lead', section: BASIC, editable: false },
  { name: 'propertyType', label: 'Property Type', fieldType: 'text', section: BASIC },
  { name: 'salesUser', label: 'Sales User', fieldType: 'text', section: BASIC },
  { name: 'salesManagerName', label: 'Sales Manager Name', fieldType: 'text', section: BASIC },
  { name: 'bookingAmount', label: 'Booking Amount', fieldType: 'currency', section: BASIC, editable: false },
  { name: 'preBookingCancellation', label: 'Pre Booking Cancellation', fieldType: 'checkbox', section: BASIC },
  { name: 'clientName', label: 'Client Name', fieldType: 'text', section: BASIC, editable: false },
  { name: 'leadSource', label: 'Lead Source', fieldType: 'text', section: BASIC },
  { name: 'leadCampaign', label: 'Lead Campaign', fieldType: 'text', section: BASIC },
  { name: 'leadSubCampaign', label: 'Lead - Sub Campaign', fieldType: 'text', section: BASIC },
  { name: 'purchaserName', label: 'Purchaser Name', fieldType: 'text', section: BASIC },
  { name: 'customerMaster', label: 'Customer Master', fieldType: 'text', section: BASIC },
  { name: 'finalPaymentOnOrBefore', label: 'Final Payment On or Before', fieldType: 'date', section: BASIC },
  { name: 'allotmentLetterDate', label: 'Allotment Letter Date', fieldType: 'date', section: BASIC },
  { name: 'confirmationWelcomeEmailSentDate', label: 'Confirmation Welcome Email Sent Date', fieldType: 'date', section: BASIC },
  { name: 'swappedDate', label: 'Swapped Date', fieldType: 'date', section: BASIC },
  { name: 'swappedReason', label: 'Swapped Reason', fieldType: 'longText', section: BASIC },
  { name: 'swappedBy', label: 'Swapped By', fieldType: 'text', section: BASIC },
  { name: 'swappedPlotNo', label: 'Swapped Plot No', fieldType: 'text', section: BASIC },
  { name: 'retainedBy', label: 'Retained By', fieldType: 'text', section: BASIC },

  { name: 'unit', label: 'Unit', fieldType: 'lookup', lookupObject: 'Unit', section: PROPERTY, editable: false },
  { name: 'quotationNumber', label: 'Quotation Number', fieldType: 'text', section: PROPERTY, editable: false },
  { name: 'unitType', label: 'Unit Type', fieldType: 'text', section: PROPERTY, editable: false },
  { name: 'plotLandArea', label: 'Plot Land Area', fieldType: 'number', section: PROPERTY, editable: false },
  { name: 'areaCent', label: 'Area (Cents)', fieldType: 'number', section: PROPERTY, editable: false },
  { name: 'basePrice', label: 'Basic Price', fieldType: 'currency', section: PROPERTY, editable: false },
  { name: 'plcAmount', label: 'PLC / Other Charges', fieldType: 'currency', section: PROPERTY, editable: false },
  { name: 'discountAmount', label: 'Discount', fieldType: 'currency', section: PROPERTY, editable: false },
  { name: 'totalPrice', label: 'Total Cost', fieldType: 'currency', section: PROPERTY, editable: false },
  { name: 'paymentPlanName', label: 'Payment Plan', fieldType: 'text', section: PROPERTY, editable: false },
  { name: 'projectAddress', label: 'Project Address', fieldType: 'text', section: PROPERTY, editable: false },
  { name: 'totalAmount', label: 'Total Amount', fieldType: 'currency', section: PROPERTY, editable: false },
  { name: 'receivedAmount', label: 'Received Amount', fieldType: 'currency', section: PROPERTY },
  { name: 'eastBy', label: 'East By', fieldType: 'text', section: PROPERTY },
  { name: 'northBy', label: 'North By', fieldType: 'text', section: PROPERTY },
  { name: 'fourSideMeasurementFmbAttached', label: '4 Side Measurement - FMB Attached', fieldType: 'checkbox', section: PROPERTY },
  { name: 'unitFacingDirection', label: 'Unit Facing Direction', fieldType: 'text', section: PROPERTY, editable: false },
  { name: 'ratePerSqFt', label: 'Rate per sqft', fieldType: 'currency', section: PROPERTY },
  { name: 'totalPending', label: 'Total Pending', fieldType: 'currency', section: PROPERTY },
  { name: 'balanceAmount', label: 'Balance Amount', fieldType: 'currency', section: PROPERTY },
  { name: 'pendingSelfPayment', label: 'Pending Self Payment', fieldType: 'currency', section: PROPERTY },
  { name: 'paymentReceivedFromBank', label: 'Payment Received from Bank', fieldType: 'currency', section: PROPERTY },
  { name: 'westBy', label: 'West By', fieldType: 'text', section: PROPERTY },
  { name: 'southBy', label: 'South By', fieldType: 'text', section: PROPERTY },

  { name: 'calculationSheetSharedInWhatsapp', label: 'Calculation Sheet Shared in WhatsApp', fieldType: 'checkbox', section: WELCOME },
  { name: 'calculationSheetDateTime', label: 'Calculation Sheet DateTime', fieldType: 'dateTime', section: WELCOME },
  { name: 'googleReviewDone', label: 'Google Review Done', fieldType: 'checkbox', section: WELCOME },
  { name: 'googleReviewDateTime', label: 'Google Review DateTime', fieldType: 'dateTime', section: WELCOME },
  { name: 'welcomeCallSent', label: 'Welcome Call Sent', fieldType: 'checkbox', section: WELCOME },
  { name: 'welcomeCallDateTime', label: 'Welcome Call DateTime', fieldType: 'dateTime', section: WELCOME },
  { name: 'welcomeCallNotes', label: 'Welcome Call Notes', fieldType: 'longText', section: WELCOME },

  { name: 'firstApplicantSalutation', label: 'Salutation', fieldType: 'text', section: FIRST, editable: false },
  { name: 'firstApplicantName', label: 'First Applicant Name', fieldType: 'text', section: FIRST, editable: false },
  { name: 'firstApplicantRelationType', label: 'Relation Type', fieldType: 'text', section: FIRST, editable: false },
  { name: 'firstApplicantNationality', label: 'Nationality', fieldType: 'text', section: FIRST, editable: false },
  { name: 'firstApplicantAadhaar', label: 'Aadhaar Number', fieldType: 'text', section: FIRST, editable: false },
  { name: 'firstApplicantEmail', label: '1st Applicant Email ID', fieldType: 'email', section: FIRST, editable: false },
  { name: 'firstApplicantMaritalStatus', label: 'Marital Status', fieldType: 'text', section: FIRST, editable: false },
  { name: 'firstApplicantState', label: 'State', fieldType: 'text', section: FIRST, editable: false },
  { name: 'firstApplicantCorrespondingAddress', label: 'Corresponding Address', fieldType: 'longText', section: FIRST, editable: false },
  { name: 'firstApplicantPhoto', label: 'First Applicant Photo', fieldType: 'text', section: FIRST, editable: false },
  { name: 'firstApplicantDateOfBirth', label: '1st Applicant Date of Birth', fieldType: 'date', section: FIRST, editable: false },
  { name: 'firstApplicantRelationshipName', label: 'Son/Daughter/Wife', fieldType: 'text', section: FIRST, editable: false },
  { name: 'firstApplicantPan', label: 'PAN Number', fieldType: 'text', section: FIRST, editable: false },
  { name: 'firstApplicantMobile', label: '1st Applicant Mobile Number', fieldType: 'phone', section: FIRST, editable: false },
  { name: 'firstApplicantAlternateNumber', label: '1st Applicant Alternate Number', fieldType: 'phone', section: FIRST, editable: false },
  { name: 'firstApplicantDistrict', label: 'District', fieldType: 'text', section: FIRST, editable: false },
  { name: 'firstApplicantPermanentAddress', label: 'Permanent Address', fieldType: 'longText', section: FIRST, editable: false },

  { name: 'secondApplicantSalutation', label: 'Salutation', fieldType: 'text', section: SECOND, editable: false },
  { name: 'secondApplicantName', label: 'Second Applicant Name', fieldType: 'text', section: SECOND, editable: false },
  { name: 'secondApplicantRelationType', label: 'Relation Type', fieldType: 'text', section: SECOND, editable: false },
  { name: 'secondApplicantMobile', label: 'Mobile Number', fieldType: 'phone', section: SECOND, editable: false },
  { name: 'secondApplicantEmail', label: '2nd Applicant Email ID', fieldType: 'email', section: SECOND, editable: false },
  { name: 'secondApplicantAadhaar', label: 'Aadhaar Number', fieldType: 'text', section: SECOND, editable: false },
  { name: 'secondApplicantMaritalStatus', label: 'Marital Status', fieldType: 'text', section: SECOND, editable: false },
  { name: 'secondApplicantCorrespondingAddress', label: 'Corresponding Address', fieldType: 'longText', section: SECOND, editable: false },
  { name: 'secondApplicantPhoto', label: 'Second Applicant Photo', fieldType: 'text', section: SECOND, editable: false },
  { name: 'secondApplicantDateOfBirth', label: '2nd Applicant Date of Birth', fieldType: 'date', section: SECOND, editable: false },
  { name: 'secondApplicantRelationshipName', label: 'Son/Daughter/Wife', fieldType: 'text', section: SECOND, editable: false },
  { name: 'secondApplicantAlternateNumber', label: '2nd Applicant Alternate Number', fieldType: 'phone', section: SECOND, editable: false },
  { name: 'secondApplicantNationality', label: 'Nationality', fieldType: 'text', section: SECOND, editable: false },
  { name: 'secondApplicantPan', label: 'PAN Number', fieldType: 'text', section: SECOND, editable: false },
  { name: 'secondApplicantSameAddress', label: 'Same address as 1st Applicant', fieldType: 'checkbox', section: SECOND, editable: false },
  { name: 'secondApplicantPermanentAddress', label: 'Permanent address', fieldType: 'longText', section: SECOND, editable: false },

  { name: 'organizationType', label: 'Organization Type', fieldType: 'text', section: PROFESSION, editable: false },
  { name: 'industry', label: 'Industry', fieldType: 'text', section: PROFESSION, editable: false },
  { name: 'referredBy', label: 'Referred By', fieldType: 'text', section: REFERRAL, editable: false },

  { name: 'saleAgreementRequired', label: 'Is Sale Agreement Required', fieldType: 'checkbox', section: AGREEMENT },
  { name: 'saleAgreementAcceptedByCustomer', label: 'Sale Agreement Accepted By Customer', fieldType: 'checkbox', section: AGREEMENT },
  { name: 'saleAgreementCommentsByCustomer', label: 'Sale Agreement Comments By Customer', fieldType: 'longText', section: AGREEMENT },
  { name: 'paymentTimeline', label: 'Payment TimeLine', fieldType: 'text', section: AGREEMENT },
  { name: 'saleAgreementDate', label: 'Sale Agreement Date', fieldType: 'date', section: AGREEMENT },
  { name: 'saleAgreementResponseByCustomer', label: 'Sale Agreement Response By Customer', fieldType: 'checkbox', section: AGREEMENT },
  { name: 'agreementRequestRaised', label: 'Agreement request Raised', fieldType: 'checkbox', section: AGREEMENT },
  { name: 'agreementSubmit', label: 'Agreement Submit', fieldType: 'checkbox', section: AGREEMENT },

  { name: 'fundingType', label: 'Funding Type', fieldType: 'text', section: FUNDING },
  { name: 'nocDate', label: 'NOC Date', fieldType: 'date', section: NOC },
  { name: 'nocApprovalStatus', label: 'NOC Approval Status', fieldType: 'text', section: NOC },

  { name: 'firstWitnessName', label: 'First Witness Name', fieldType: 'text', section: WITNESS },
  { name: 'firstWitnessAadhar', label: 'First Witness Aadhar', fieldType: 'text', section: WITNESS },
  { name: 'firstWitnessAddressLine1', label: 'First Witness Address Line 1', fieldType: 'longText', section: WITNESS },
  { name: 'firstWitnessAddressLine2', label: 'First Witness Address Line 2', fieldType: 'longText', section: WITNESS },
  { name: 'secondWitnessName', label: 'Second Witness Name', fieldType: 'text', section: WITNESS },
  { name: 'secondWitnessAadhar', label: 'Second Witness Aadhar', fieldType: 'text', section: WITNESS },
  { name: 'secondWitnessAddressLine1', label: 'Second Witness Address Line 1', fieldType: 'longText', section: WITNESS },
  { name: 'secondWitnessAddressLine2', label: 'Second Witness Address Line 2', fieldType: 'longText', section: WITNESS },

  { name: 'registrationScheduledDate', label: 'Registration Scheduled Date', fieldType: 'date', section: REGISTRATION },
  { name: 'registrationDate', label: 'Registration Date', fieldType: 'date', section: REGISTRATION },
  { name: 'saleDeedAcceptedByCustomer', label: 'Sale Deed Accepted by Customer', fieldType: 'checkbox', section: REGISTRATION },
  { name: 'saleDeedCommentsByCustomer', label: 'Sale Deed Comments by Customer', fieldType: 'longText', section: REGISTRATION },
  { name: 'registrationDone', label: 'Registration Done', fieldType: 'checkbox', section: REGISTRATION },
  { name: 'saleDeedResponseByCustomer', label: 'Sale Deed Response By Customer', fieldType: 'checkbox', section: REGISTRATION },

  { name: 'bookingCancellationReason', label: 'Booking Cancellation Reason', fieldType: 'longText', section: CANCELLATION, editable: false },
  { name: 'bookingCancellationStatus', label: 'Booking Cancellation Status', fieldType: 'text', section: CANCELLATION, editable: false },
  { name: 'bookingCancellationDate', label: 'Booking Cancellation Date', fieldType: 'date', section: CANCELLATION },
  { name: 'cancellationRequestRaisedDate', label: 'Cancellation Request Raised Date', fieldType: 'date', section: CANCELLATION, editable: false },
  { name: 'daysBetweenBookingAndCancellation', label: 'Days Between Booking and Cancellation', fieldType: 'number', section: CANCELLATION },

  { name: 'crmManager', label: 'CRM Manager', fieldType: 'text', section: APPROVERS },
  { name: 'financeUser', label: 'Finance User', fieldType: 'text', section: APPROVERS },
  { name: 'createdBy', label: 'Created By', fieldType: 'lookup', lookupObject: 'User', section: SYSTEM, editable: false },
  { name: 'createdAt', label: 'Created Date', fieldType: 'dateTime', section: SYSTEM, editable: false },
  { name: 'lastModifiedBy', label: 'Last Modified By', fieldType: 'text', section: SYSTEM, editable: false },
  { name: 'recordOwner', label: 'Owner', fieldType: 'lookup', lookupObject: 'User', section: SYSTEM, editable: false },
  { name: 'updatedAt', label: 'Last Modified Date', fieldType: 'dateTime', section: SYSTEM, editable: false },
  ...BOOKING_SALESFORCE_DETAIL_FIELDS.map(([name, label, fieldType, section, editable]) => ({
    name,
    label,
    fieldType,
    section,
    editable,
  })),
];

const bookingBaseFields: BookingFieldSpec[] = [
  { name: 'facingDirection', label: 'Facing Direction', fieldType: 'text', section: PROPERTY },
  { name: 'firstApplicantAddress', label: 'Applicant Address', fieldType: 'longText', section: FIRST },
  { name: 'welcomeCallCompletedAt', label: 'Welcome Call Completed At', fieldType: 'dateTime', section: WELCOME },
];

const detailFieldNames = new Set(BOOKING_DETAIL_FIELDS.map(({ name }) => name));

export const BOOKING_FIELDS: BookingFieldSpec[] = [
  ...BOOKING_DETAIL_FIELDS.map(({ name, label, fieldType, lookupObject, section, editable }) => ({
    name,
    label,
    fieldType,
    lookupObject,
    section,
    editable,
  })),
  ...bookingBaseFields.filter(({ name }) => !detailFieldNames.has(name)),
];

export function bookingLayoutSections() {
  const sections = new Map<string, string[]>();
  for (const field of BOOKING_FIELDS) {
    sections.set(field.section, [...(sections.get(field.section) ?? []), field.name]);
  }
  return [...sections].map(([name, fields]) => ({ name, fields }));
}
