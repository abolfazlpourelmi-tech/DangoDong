/** Persian and Arabic digits are common in pasted text, so fold them first. */
export function toLatinDigits(value: string) {
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  return value
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)))
    .replace(/\D/g, '');
}

/**
 * Normalises an Iranian mobile number to the E.164 form Supabase expects.
 * Returns an empty string when it is not a valid Iranian mobile, so callers can
 * treat "" as "reject this".
 */
export function toIranPhone(value: string) {
  const digits = toLatinDigits(value);
  if (/^09\d{9}$/.test(digits)) return `+98${digits.slice(1)}`;
  if (/^989\d{9}$/.test(digits)) return `+${digits}`;
  if (/^9\d{9}$/.test(digits)) return `+98${digits}`;
  return '';
}

/**
 * Anonymous accounts need a unique, non-null value in profiles.phone, so they
 * carry a synthetic one. It must never be shown as if it were a phone number.
 */
export function isPlaceholderPhone(value: string | null | undefined) {
  return Boolean(value && value.startsWith('anonymous:'));
}

/** The phone to display, or "" for an account that has no real number yet. */
export function displayablePhone(value: string | null | undefined) {
  if (!value || isPlaceholderPhone(value)) return '';
  return value;
}
