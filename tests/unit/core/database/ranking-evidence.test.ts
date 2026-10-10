import { describe, expect, it } from 'vitest'
import {
  captureRankingEvidence,
  readRankingEvidence,
  RANKING_EVIDENCE_KEY,
} from '@core/database/ranking-evidence'

function metadata() {
  const values = new Map<string, string>()
  return {
    get: (key: string) => values.get(key) ?? null,
    set: (key: string, value: string) => {
      values.set(key, value)
    },
    getLastScrapeDate: () => 'today',
  }
}

describe('ranking sample evidence retained from Windrun responses', () => {
  it('retains normal, high-skill, skill-pair and model-pair samples without changing legacy tables', () => {
    const store = metadata()
    captureRankingEvidence(store, {
      overallStats: [
        { abilityId: 1, numPicks: 800, winrate: 0.55 },
        { abilityId: -70, numPicks: 1000, winrate: 0.52 },
      ],
      hsStats: [{ abilityId: 1, numPicks: 150, winrate: 0.6 }],
      abilityLookup: new Map([
        [1, { shortName: 'a' }],
        [2, { shortName: 'b' }],
      ]),
      staticHeroes: { '70': { shortName: 'ursa' } },
      pairs: [
        { abilityIdOne: 2, abilityIdTwo: 1, numPicks: 40, winrate: 0.7 },
        { abilityIdOne: -70, abilityIdTwo: 1, numPicks: 80, winrate: 0.65 },
      ],
      sourceDate: 'today',
      patches: ['7.40c'],
    })
    const evidence = readRankingEvidence(store)!
    expect(evidence.samples['ability:a']).toMatchObject({ numPicks: 800, highSkillNumPicks: 150 })
    expect(evidence.samples['hero:ursa']).toMatchObject({ numPicks: 1000, highSkillNumPicks: null })
    expect(evidence.pairs['ability:a|ability:b']).toEqual({ numPicks: 40, winrate: 0.7 })
    expect(evidence.pairs['ability:a|hero:ursa']).toEqual({ numPicks: 80, winrate: 0.65 })
    expect(evidence.patches).toEqual(['7.40c'])
  })

  it('keeps missing or invalid samples unknown, preserves a real zero, and replaces older snapshots', () => {
    const store = metadata()
    const base = {
      abilityLookup: new Map([
        [1, { shortName: 'a' }],
        [2, { shortName: 'b' }],
      ]),
      staticHeroes: {},
      hsStats: [],
      pairs: [],
      sourceDate: 'today',
    }
    captureRankingEvidence(store, {
      ...base,
      overallStats: [
        { abilityId: 1, numPicks: -1, winrate: 0.5 },
        { abilityId: 2, numPicks: 0, winrate: 0.5 },
      ],
    })
    expect(readRankingEvidence(store)?.samples['ability:a'].numPicks).toBeNull()
    expect(readRankingEvidence(store)?.samples['ability:b'].numPicks).toBe(0)
    captureRankingEvidence(store, { ...base, overallStats: [{ abilityId: 1, winrate: 0.5 }] })
    expect(readRankingEvidence(store)?.samples['ability:a'].numPicks).toBeNull()
    expect(readRankingEvidence(store)?.samples['ability:b']).toBeUndefined()
  })

  it('fails closed for missing, corrupt and outdated evidence', () => {
    const store = metadata()
    expect(readRankingEvidence(store)).toBeNull()
    store.set(RANKING_EVIDENCE_KEY, '{bad json')
    expect(readRankingEvidence(store)).toBeNull()
    store.set(
      RANKING_EVIDENCE_KEY,
      JSON.stringify({ version: 1, sourceDate: 'yesterday', samples: {}, pairs: {} }),
    )
    expect(readRankingEvidence(store)).toBeNull()
  })
})
