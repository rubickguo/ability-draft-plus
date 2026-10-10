import { describe, expect, it } from 'vitest'
import { buildDraftBadges } from '../../../../src/renderer/overlay/src/draft-badges'
import type { OverlayDataPayload } from '@shared/types'
import type { DraftRecommendation } from '@core/domain/contextual-ranking'

const data = {
  scanData: {
    ultimates: [],
    standard: [
      { name: 'a', displayName: '技能甲' },
      { name: 'b', displayName: '技能乙' },
    ],
    selectedAbilities: [{ name: 'owned', displayName: '已选技能', hero_order: 0 }],
  },
  selectedSpotHeroOrder: 0,
  selectedModelHeroOrder: null,
  heroModels: [{ heroOrder: 0, heroName: 'axe', heroDisplayName: '斧王' }],
} as unknown as OverlayDataPayload

const recommendation = {
  choices: [
    {
      key: 'ability:b',
      kind: 'ability',
      name: 'b',
      displayName: '技能乙',
      rank: 1,
      selfScore: 61,
      reasons: ['补全自身组合'],
      confidence: 'limited',
    },
    {
      key: 'hero:axe',
      kind: 'hero',
      name: 'axe',
      heroOrder: 0,
      displayName: '斧王',
      rank: 2,
      selfScore: 60,
      reasons: [],
      confidence: 'limited',
    },
  ],
  best: { key: 'ability:b' },
  waitPicks: 8,
  notes: [],
  threats: [
    {
      key: 'pair',
      kind: 'own',
      names: ['已选技能', '技能乙'],
      candidateKeys: ['ability:b'],
      synergyWinrate: 0.65,
    },
    {
      key: 'other',
      kind: 'potential',
      names: ['技能甲', '斧王'],
      candidateKeys: ['ability:a', 'hero:axe'],
      synergyWinrate: 0.67,
    },
  ],
} as unknown as DraftRecommendation

describe('one recommendation projected to all icon guidance', () => {
  it('uses exactly the central ranks and explanations, with no independent scoring', () => {
    const result = buildDraftBadges(data, recommendation)
    expect(result.abilities.get('b')).toMatchObject({
      rank: 1,
      selfScore: 61,
      reasons: ['补全自身组合'],
    })
    expect(result.models.get(0)?.rank).toBe(2)
    expect(result.abilities.get('a')?.rank).toBeUndefined()
  })
  it('shares letters only around the first choice, including its owned anchor', () => {
    const result = buildDraftBadges(data, recommendation)
    expect(result.abilities.get('owned')?.groups.map((g) => g.label)).toEqual(['A'])
    expect(result.abilities.get('b')?.groups.map((g) => g.label)).toEqual(['A'])
    expect(result.abilities.get('a')?.groups).toEqual([])
    expect(result.groups).toHaveLength(1)
  })
})
