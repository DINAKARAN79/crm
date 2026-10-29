import { prisma } from '@dct-crm/db';
import { validateFieldValue } from './metadata';

export async function validateObjectCustomFields(
  tenantId: string,
  objectName: string,
  values: Record<string, unknown>,
  requireRequiredFields: boolean,
): Promise<string | null> {
  const object = await prisma.objectDefinition.findFirst({
    where: { tenantId, name: objectName, isActive: true },
    select: { id: true },
  });
  if (!object) {
    return Object.keys(values).length ? `${objectName} field metadata is not configured` : null;
  }

  const definitions = await prisma.fieldDefinition.findMany({
    where: {
      tenantId,
      objectId: object.id,
      isActive: true,
      isCustomField: true,
      isStandardField: false,
    },
    include: { picklistValues: { where: { isActive: true } } },
  });
  const definitionByName = new Map(definitions.map((field) => [field.name, field]));

  for (const name of Object.keys(values)) {
    if (!definitionByName.has(name)) return `Unknown ${objectName} field: ${name}`;
  }

  for (const field of definitions) {
    const hasValue = Object.prototype.hasOwnProperty.call(values, field.name);
    if (!hasValue) {
      if (requireRequiredFields && field.required) return `${field.label} is required`;
      continue;
    }
    if (!field.editable) return `${field.label} is read-only`;

    const value = values[field.name];
    const validation = validateFieldValue(field, value);
    if (!validation.valid) return validation.error || `Invalid value for ${field.label}`;
    if (
      field.fieldType === 'picklist' &&
      value !== null &&
      value !== undefined &&
      value !== '' &&
      !field.picklistValues.some((option) => option.value === value)
    ) {
      return `${field.label} has an invalid value`;
    }
    if (
      field.fieldType === 'multiPicklist' &&
      Array.isArray(value) &&
      !value.every((option) => field.picklistValues.some((item) => item.value === option))
    ) {
      return `${field.label} has an invalid value`;
    }
  }

  return null;
}
