/** Joins class names, dropping the empty ones. */
export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(" ");
