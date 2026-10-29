interface SearchableApplicant {
  name?: unknown;
  salutation?: unknown;
  email?: unknown;
  mobileNumber?: unknown;
  alternateNumber?: unknown;
}

interface SearchableApprovalPacket {
  receiptNumber?: unknown;
  transactionId?: unknown;
  receivedFrom?: unknown;
  paymentMode?: unknown;
  lead?: {
    leadNumber?: unknown;
    firstName?: unknown;
    lastName?: unknown;
    company?: unknown;
    phone?: unknown;
    mobile?: unknown;
    email?: unknown;
    owner?: {
      firstName?: unknown;
      lastName?: unknown;
      profile?: { name?: unknown } | null;
    } | null;
  };
  booking?: {
    bookingNumber?: unknown;
    project?: { name?: unknown };
    unit?: { number?: unknown };
    firstApplicant?: SearchableApplicant;
    secondApplicant?: SearchableApplicant | null;
    quotation?: {
      quotationNumber?: unknown;
      customerName?: unknown;
      customerPhone?: unknown;
      customerEmail?: unknown;
      projectName?: unknown;
      unitNumber?: unknown;
    };
  };
}

export function matchesApprovalPacketSearch(packet: SearchableApprovalPacket, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;

  const lead = packet.lead;
  const booking = packet.booking;
  const quotation = booking?.quotation;
  const owner = lead?.owner;
  const applicants = [booking?.firstApplicant, booking?.secondApplicant];
  const phoneValues = [
    lead?.phone,
    lead?.mobile,
    quotation?.customerPhone,
    ...applicants.flatMap((applicant) => [
      applicant?.mobileNumber,
      applicant?.alternateNumber,
    ]),
  ];
  const searchableValues = [
    packet.receiptNumber,
    packet.transactionId,
    packet.receivedFrom,
    packet.paymentMode,
    lead?.leadNumber,
    lead?.firstName,
    lead?.lastName,
    lead?.company,
    lead?.phone,
    lead?.mobile,
    lead?.email,
    owner?.firstName,
    owner?.lastName,
    owner?.profile?.name,
    booking?.bookingNumber,
    booking?.project?.name,
    booking?.unit?.number,
    quotation?.quotationNumber,
    quotation?.customerName,
    quotation?.customerPhone,
    quotation?.customerEmail,
    quotation?.projectName,
    quotation?.unitNumber,
    ...applicants.flatMap((applicant) => [
      applicant?.name,
      applicant?.salutation,
      applicant?.email,
      applicant?.mobileNumber,
      applicant?.alternateNumber,
    ]),
  ];

  if (searchableValues.some((value) =>
    value !== null && value !== undefined && String(value).toLocaleLowerCase().includes(normalizedQuery),
  )) return true;

  const queryDigits = normalizedQuery.replace(/\D/g, "");
  return queryDigits.length >= 3 && phoneValues.some((value) =>
    value !== null && value !== undefined && String(value).replace(/\D/g, "").includes(queryDigits),
  );
}
