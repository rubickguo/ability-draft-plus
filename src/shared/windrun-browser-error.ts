export const WINDRUN_BROWSER_CODES = [
  'verification',
  'loading',
  'closed',
  'timeout',
  'failed',
  'openFailed',
  'unsupported',
] as const
export type WindrunBrowserErrorCode = (typeof WINDRUN_BROWSER_CODES)[number]
export class WindrunBrowserError extends Error {
  constructor(public readonly code: WindrunBrowserErrorCode) {
    super(`windrunBrowser:${code}`)
    this.name = 'WindrunBrowserError'
  }
}
export function windrunBrowserMessageKey(
  message: string | null,
): `scraping.browser.${WindrunBrowserErrorCode}` | null {
  const code = message?.startsWith('windrunBrowser:') ? message.slice(15) : ''
  return (WINDRUN_BROWSER_CODES as readonly string[]).includes(code)
    ? `scraping.browser.${code as WindrunBrowserErrorCode}`
    : null
}
