import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, seedTestData, type TestDb } from '../../core/database/test-helpers'
import { createAbilityRepository } from '@core/database/repositories/ability-repository'
import { createHeroRepository } from '@core/database/repositories/hero-repository'
import { createSynergyRepository } from '@core/database/repositories/synergy-repository'
import { createMetadataRepository } from '@core/database/repositories/metadata-repository'
import {
  getDraftRankingData,
  type RankingDraftState,
} from '../../../../src/main/services/draft-ranking-data'
import { captureRankingEvidence, RANKING_EVIDENCE_KEY } from '@core/database/ranking-evidence'
import { buildTurnSchedule } from '@core/gsi/draft-clock'

describe('draft ranking data from the original database service', () => {
  let testDb: TestDb
  let service: Parameters<typeof getDraftRankingData>[0]
  beforeEach(async () => {
    testDb = await createTestDb()
    seedTestData(testDb.db)
    service = {
      abilities: createAbilityRepository(testDb.db),
      heroes: createHeroRepository(testDb.db),
      synergies: createSynergyRepository(testDb.db),
      metadata: createMetadataRepository(testDb.db),
    }
  })
  afterEach(() => testDb.close())

  it('keeps enemy-owned halves in queried pairs and includes assigned model pairs', () => {
    const state = {
      selectedAbilitiesCache: [{ name: 'antimage_mana_break', hero_order: 5 }],
      identifiedHeroModelsCache: [{ heroOrder: 2, heroName: 'antimage' }],
      modelAssignments: [{ poolHeroOrder: 2, playerIndex: 5 }],
    } as RankingDraftState
    const result = getDraftRankingData(
      service,
      { names: ['crystal_maiden_frostbite', 'pudge_meat_hook'] },
      state,
    )
    expect(result.pairs).toContainEqual(
      expect.objectContaining({
        ability1Name: 'antimage_mana_break',
        ability2Name: 'crystal_maiden_frostbite',
        numPicks: null,
      }),
    )
    expect(result.heroPairs).toContainEqual(
      expect.objectContaining({
        heroName: 'antimage',
        abilityName: 'pudge_meat_hook',
        numPicks: null,
      }),
    )
    expect(result.context?.modelAssignments).toEqual([{ playerIndex: 5, heroName: 'antimage' }])
  })

  it('returns unknown sample sizes and turn when the legacy database has no evidence', () => {
    const result = getDraftRankingData(service, { names: ['antimage_blink'] })
    expect(result.sampleCounts?.['ability:antimage_blink']).toEqual({
      numPicks: null,
      highSkillNumPicks: null,
    })
    expect(result.context?.currentPick).toBeNull()
    expect(service.metadata.get(RANKING_EVIDENCE_KEY)).toBeNull()
  })

  it('uses the current fixed role settings rather than stale renderer context', () => {
    service.metadata.setSettings({ roleMode: 'fixed', roleFixedPositions: [4, 5] })
    expect(getDraftRankingData(service, {}).context).toMatchObject({
      roleMode: 'fixed',
      rolePositions: [4, 5],
    })
    service.metadata.setSettings({ roleMode: 'off' })
    expect(getDraftRankingData(service, {}).context?.rolePositions).toEqual([])
  })

  it('counts only a contiguous timed schedule confirmed by actual ownership', () => {
    const schedule = buildTurnSchedule()
    const state = {
      selectedAbilitiesCache: [
        { name: 'antimage_mana_break', hero_order: 0 },
        { name: 'crystal_maiden_frostbite', hero_order: 5 },
      ],
      draftTimeline: [
        {
          seq: 0,
          playerIndex: 0,
          abilityName: 'antimage_mana_break',
          kind: 'ability',
          clockTime: 1,
          seenAtS: schedule[0].startS + 1,
        },
        {
          seq: 1,
          playerIndex: 5,
          abilityName: 'crystal_maiden_frostbite',
          kind: 'ability',
          clockTime: 8,
          seenAtS: schedule[1].startS + 1,
        },
      ],
    } as RankingDraftState
    expect(getDraftRankingData(service, {}, state).context?.currentPick).toBe(2)
    // A missed first pick must not turn the observed second event into turn 1.
    expect(
      getDraftRankingData(service, {}, { ...state, draftTimeline: state.draftTimeline!.slice(1) })
        .context?.currentPick,
    ).toBeNull()
    expect(
      getDraftRankingData(
        service,
        {},
        {
          ...state,
          draftTimeline: state.draftTimeline!.map((event) => ({ ...event, seenAtS: undefined })),
        },
      ).context?.currentPick,
    ).toBeNull()
  })

  it('rejects unknown, vacated, or conflicting ownership as schedule evidence', () => {
    const state = {
      selectedAbilitiesCache: [{ name: 'antimage_blink', hero_order: 0 }],
      draftTimeline: [
        {
          seq: 0,
          playerIndex: 0,
          abilityName: 'antimage_blink',
          kind: 'ability',
          clockTime: 1,
          seenAtS: 1,
          vacated: true,
        },
      ],
      identifiedHeroModelsCache: [{ heroOrder: 0, heroName: 'antimage' }],
      modelAssignments: [
        { poolHeroOrder: 0, playerIndex: 0 },
        { poolHeroOrder: 0, playerIndex: 5 },
      ],
    } as RankingDraftState
    const result = getDraftRankingData(service, {}, state)
    expect(result.context?.currentPick).toBeNull()
    expect(result.context?.modelAssignments).toEqual([])
  })

  it('reads matching samples but refuses stale sample counts paired with different winrates', () => {
    captureRankingEvidence(service.metadata, {
      overallStats: [{ abilityId: 1, numPicks: 1200, winrate: 0.55 }],
      hsStats: [{ abilityId: 1, numPicks: 240, winrate: 0.57 }],
      abilityLookup: new Map([
        [1, { shortName: 'antimage_mana_break' }],
        [2, { shortName: 'crystal_maiden_frostbite' }],
      ]),
      staticHeroes: { '1': { shortName: 'antimage' } },
      pairs: [{ abilityIdOne: 1, abilityIdTwo: 2, winrate: 0.65, numPicks: 96 }],
      sourceDate: '2024-11-15',
    })
    const result = getDraftRankingData(service, {
      names: ['antimage_mana_break', 'crystal_maiden_frostbite'],
    })
    expect(result.sampleCounts?.['ability:antimage_mana_break']).toEqual({
      numPicks: 1200,
      highSkillNumPicks: 240,
    })
    expect(result.pairs[0].numPicks).toBe(96)
    testDb.sqlite.run("UPDATE Abilities SET winrate = 0.6 WHERE name = 'antimage_mana_break'")
    expect(
      getDraftRankingData(service, {}).sampleCounts?.['ability:antimage_mana_break']?.numPicks,
    ).toBeNull()
    service.metadata.setLastScrapeDate('2024-11-16')
    expect(
      getDraftRankingData(service, { names: ['antimage_mana_break', 'crystal_maiden_frostbite'] })
        .pairs[0].numPicks,
    ).toBeNull()
  })
})
