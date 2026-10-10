import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname } from 'node:path'

/** Test-only profile override; ordinary launches never inspect this environment variable.
 * Resolve symlinks before checking the direct OS-temp child so an existing user
 * profile cannot accidentally be selected by a smoke test. */
export function getPublicBetaSmokeAppData(
  enabled: boolean,
  supplied: string | undefined,
): string | null {
  if (!enabled) return null
  if (!supplied) throw new Error('Smoke test requires an isolated temporary profile')
  const directory = realpathSync(supplied)
  if (
    dirname(directory) !== realpathSync(tmpdir()) ||
    !/^adp-public-beta-smoke-[a-zA-Z0-9]+$/.test(basename(directory))
  ) {
    throw new Error('Smoke test requires an isolated temporary profile')
  }
  return directory
}
