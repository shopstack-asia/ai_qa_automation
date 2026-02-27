/**
 * URL validation for navigation steps. Ensures page.goto() is never called with
 * selectors or non-URL strings (which cause net::ERR_ABORTED and blank DOM).
 */

/** Strict check: value must be an absolute http(s) URL. */
export function isValidUrl(value: string): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  return /^https?:\/\/.+/.test(value.trim());
}

/**
 * Extract the first URL from step text (e.g. "Open browser at https://example.com/login").
 * Returns undefined if no URL is found.
 */
export function extractUrlFromStepText(stepText: string): string | undefined {
  if (!stepText?.trim()) return undefined;
  const match = stepText.trim().match(/https?:\/\/[^\s"'<>]+/);
  return match ? match[0].replace(/[.,;:)]+$/, "") : undefined;
}
