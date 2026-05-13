const ACCESS_CODE_SEGMENT_LENGTH = 4;
export const ACCESS_CODE_RAW_LENGTH = ACCESS_CODE_SEGMENT_LENGTH * 4;
export const ACCESS_CODE_SPECIAL_CHARS = '!@#$%&*?';
export const ACCESS_CODE_PLACEHOLDER = 'AB3!CD4@EF5#GH6$';
const ESCAPED_SPECIAL_CHARS = ACCESS_CODE_SPECIAL_CHARS.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
const DISALLOWED_CODE_CHARACTERS = new RegExp(`[^a-zA-Z0-9${ESCAPED_SPECIAL_CHARS}]`, 'g');

export function normalizeAccessCode(value: string): string {
  return value
    .replace(DISALLOWED_CODE_CHARACTERS, '')
    .toUpperCase()
    .slice(0, ACCESS_CODE_RAW_LENGTH);
}

export function formatAccessCode(value: string): string {
  return normalizeAccessCode(value);
}

export function isAccessCodeComplete(value: string): boolean {
  return normalizeAccessCode(value).length === ACCESS_CODE_RAW_LENGTH;
}

export function hasAccessCodeComplexity(value: string): boolean {
  const normalized = normalizeAccessCode(value);
  return (
    /[A-Z]/.test(normalized) &&
    /\d/.test(normalized) &&
    new RegExp(`[${ESCAPED_SPECIAL_CHARS}]`).test(normalized)
  );
}
