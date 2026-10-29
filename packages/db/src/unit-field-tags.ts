export type UnitTagSource = {
  allowedDiscount?: string | null;
  price?: number | null;
  bookingSource?: string | null;
  buildupArea?: number | null;
  createdById?: string | null;
  customerLeadId?: string | null;
  floor?: number | null;
  updatedById?: string | null;
  minimumBookingAmount?: number | null;
  msp?: string | null;
  nonPlc?: string | null;
  bookingLeadId?: string | null;
  opportunityLeadId?: string | null;
  ownerId?: string | null;
  plc?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  registrationDate?: Date | string | null;
  area?: number | null;
  areaField?: number | null;
  status?: string | null;
  unitCode?: string | null;
  number?: string | null;
  type?: string | null;
  block?: string | null;
};

export function readTaggedArea(customFields: unknown) {
  if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) return null;
  const value = (customFields as Record<string, unknown>).Area__c;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function dateTag(value: Date | string | null | undefined) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function unitFieldTags(unit: UnitTagSource): Record<string, string | number | null> {
  const price = unit.price ?? null;
  const villa = (unit.type || '').trim().toLowerCase() === 'villa';
  return {
    Allowed_Discountt__c: unit.allowedDiscount ?? null,
    Base_Price__c: price,
    Booking_source__c: unit.bookingSource ?? null,
    Buildup_Area__c: unit.buildupArea ?? null,
    CreatedById: unit.createdById ?? null,
    Customer__c: unit.customerLeadId ?? null,
    Floor__c: unit.floor ?? null,
    LastModifiedById: unit.updatedById ?? null,
    Minimum_Booking_Amount__c: unit.minimumBookingAmount ?? null,
    MSP__c: unit.msp ?? null,
    Non_PLC__c: unit.nonPlc ?? null,
    Bookingdate__c: unit.bookingLeadId ?? null,
    Opportunity__c: unit.opportunityLeadId ?? null,
    OwnerId: unit.ownerId ?? null,
    PLC__c: unit.plc ?? null,
    Project__c: unit.projectId ?? null,
    Project_Name__c: unit.projectName ?? null,
    Registration_Date__c: dateTag(unit.registrationDate),
    Saleable_Area__c: unit.area ?? null,
    Area__c: unit.areaField ?? null,
    Status__c: unit.status ?? null,
    Name: unit.unitCode ?? null,
    Unit_Number__c: unit.number ?? null,
    Unit_Price__c: price,
    Unit_Type__c: unit.type ?? null,
    Villa_Price__c: villa ? (price ?? 0) : 0,
    Block__c: unit.block ?? null,
  };
}
