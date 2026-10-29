const NATIONAL_NUMBER_LENGTHS: Record<string, number> = {
  "1": 10,
  "44": 10,
  "61": 9,
  "65": 8,
  "91": 10,
  "971": 9,
};

export function formatPhoneWithCountryCode(
  countryCode?: string | null,
  phone?: string | null,
): string {
  const code = countryCode?.trim();
  let number = phone?.trim();
  if (!number) return code || "";
  if (!code) return number;

  const codeDigits = code.replace(/\D/g, "");
  if (!codeDigits) return number;
  const numberDigits = number.replace(/\D/g, "").replace(/^00/, "");
  const nationalLength = NATIONAL_NUMBER_LENGTHS[codeDigits];
  const hasRepeatedCountryCode = numberDigits.startsWith(codeDigits) && (
    number.startsWith("+") ||
    number.startsWith("00") ||
    (nationalLength !== undefined && numberDigits.length > nationalLength)
  );

  if (hasRepeatedCountryCode) {
    number = number.replace(/^\+/, "").replace(/^00/, "");
    number = number.replace(new RegExp(`^${codeDigits}`), "").trim();
  }

  const displayCode = code.startsWith("+") ? code : `+${codeDigits}`;
  return `${displayCode} ${number}`.trim();
}
