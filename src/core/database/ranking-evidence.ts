import type { MetadataRepository } from './repositories/metadata-repository'

export const RANKING_EVIDENCE_KEY = 'draft_ranking_evidence_v1'
interface StatEvidenceInput {
  abilityId: number
  numPicks?: number | null
  winrate: number
}
export interface RankingEvidenceInput {
  overallStats: readonly StatEvidenceInput[]
  hsStats: readonly StatEvidenceInput[]
  abilityLookup: ReadonlyMap<number, { shortName: string }>
  staticHeroes: Record<string, { shortName: string }>
  pairs: readonly {
    abilityIdOne: number
    abilityIdTwo: number
    numPicks?: number | null
    winrate: number
  }[]
  sourceDate: string
  patches?: readonly string[]
}
export interface RankingEvidence {
  version: 1
  sourceDate: string
  patches: string[]
  samples: Record<
    string,
    {
      numPicks: number | null
      highSkillNumPicks: number | null
      winrate: number | null
      highSkillWinrate: number | null
    }
  >
  pairs: Record<string, { numPicks: number | null; winrate: number }>
}
function sampleCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function winrate(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null
}

export function rankingPairKey(first: string, second: string): string {
  return [first, second].sort().join('|')
}

/** Keep evidence in the legacy key/value table, so the installed DB needs no schema changes.
 * A complete snapshot replaces the old one; no missing count is converted into zero. */
export function captureRankingEvidence(
  metadata: Pick<MetadataRepository, 'set'>,
  input: RankingEvidenceInput,
): void {
  const evidence: RankingEvidence = {
    version: 1,
    sourceDate: input.sourceDate,
    patches: [...(input.patches ?? [])],
    samples: {},
    pairs: {},
  }
  const keyOf = (id: number): string | null => {
    const name =
      id < 0 ? input.staticHeroes[String(-id)]?.shortName : input.abilityLookup.get(id)?.shortName
    return name ? `${id < 0 ? 'hero' : 'ability'}:${name}` : null
  }
  const highSkill = new Map(input.hsStats.map((stat) => [stat.abilityId, stat]))
  for (const stat of input.overallStats) {
    const key = keyOf(stat.abilityId)
    if (!key) continue
    const hs = highSkill.get(stat.abilityId)
    evidence.samples[key] = {
      numPicks: sampleCount(stat.numPicks),
      highSkillNumPicks: sampleCount(hs?.numPicks),
      winrate: winrate(stat.winrate),
      highSkillWinrate: winrate(hs?.winrate),
    }
  }
  for (const pair of input.pairs) {
    const first = keyOf(pair.abilityIdOne),
      second = keyOf(pair.abilityIdTwo)
    const rate = winrate(pair.winrate)
    if (!first || !second || first === second || rate === null) continue
    evidence.pairs[rankingPairKey(first, second)] = {
      numPicks: sampleCount(pair.numPicks),
      winrate: rate,
    }
  }
  metadata.set(RANKING_EVIDENCE_KEY, JSON.stringify(evidence))
}

/** Never attach counts from a different scrape to current statistics. */
export function readRankingEvidence(
  metadata: Pick<MetadataRepository, 'get' | 'getLastScrapeDate'>,
): RankingEvidence | null {
  const raw = metadata.get(RANKING_EVIDENCE_KEY)
  if (!raw) return null
  try {
    const stored = JSON.parse(raw) as RankingEvidence
    if (
      stored?.version !== 1 ||
      stored.sourceDate !== metadata.getLastScrapeDate() ||
      !stored.samples ||
      typeof stored.samples !== 'object' ||
      Array.isArray(stored.samples) ||
      !stored.pairs ||
      typeof stored.pairs !== 'object' ||
      Array.isArray(stored.pairs)
    )
      return null
    const result: RankingEvidence = {
      version: 1,
      sourceDate: stored.sourceDate,
      patches: Array.isArray(stored.patches)
        ? stored.patches.filter((patch) => typeof patch === 'string')
        : [],
      samples: {},
      pairs: {},
    }
    for (const [key, value] of Object.entries(stored.samples)) {
      if (!value || typeof value !== 'object') continue
      result.samples[key] = {
        numPicks: sampleCount(value.numPicks),
        highSkillNumPicks: sampleCount(value.highSkillNumPicks),
        winrate: winrate(value.winrate),
        highSkillWinrate: winrate(value.highSkillWinrate),
      }
    }
    for (const [key, value] of Object.entries(stored.pairs)) {
      if (!value || typeof value !== 'object' || winrate(value.winrate) === null) continue
      result.pairs[key] = { numPicks: sampleCount(value.numPicks), winrate: value.winrate }
    }
    return result
  } catch {
    return null
  }
}
