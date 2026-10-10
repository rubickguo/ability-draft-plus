import { describe, expect, it } from 'vitest'
import { buildDraftBadges } from '../../../../src/renderer/overlay/src/draft-badges'
import type { OverlayDataPayload } from '@shared/types'

function board(): OverlayDataPayload {
  return {
    scanData: {
      ultimates: [],
      standard: [
        { name: 'a', displayName: 'A skill', pickRate: 8, winrate: .5 },
        { name: 'b', displayName: 'B skill', pickRate: 2, winrate: .5 },
        { name: null, displayName: 'Unknown', pickRate: 1, isUnknown: true },
        { name: 'c', displayName: 'C skill', pickRate: null },
      ],
      selectedAbilities: [],
    },
    heroModels: [
      { heroOrder: 0, heroName: 'slark', heroDisplayName: 'Slark', pickRate: 3, winrate: .5 },
      { heroOrder: 1, heroName: 'axe', heroDisplayName: 'Axe', pickRate: 1, isPicked: true },
    ],
    opCombinations: [
      {
        ability1Name: 'a',
        ability2Name: 'b',
        ability1DisplayName: 'A skill',
        ability2DisplayName: 'B skill',
        synergyWinrate: 0.65,
      },
    ],
    heroSynergies: [
      { heroDisplayName: 'Slark', abilityDisplayName: 'B skill', synergyWinrate: 0.62 },
    ],
  } as unknown as OverlayDataPayload
}
describe('on-icon draft guidance', () => {
  it('ranks earliest-picked skills first, excluding unknown data and picked models', () => {
    const result = buildDraftBadges(board())
    expect(result.abilities.get('b')?.rank).toBe(1)
    expect(result.abilities.get('a')?.rank).toBe(3)
    expect(result.abilities.get('c')?.rank).toBeUndefined()
    expect(result.models.get(0)?.rank).toBe(2)
    expect(result.models.has(1)).toBe(false)
  })
  it('puts the same combo letter on both skills and on model-skill pairs', () => {
    const result = buildDraftBadges(board())
    expect(result.abilities.get('a')?.groups.map((g) => g.label)).toContain('A')
    expect(result.abilities.get('b')?.groups.map((g) => g.label)).toEqual(['A', 'B'])
    expect(result.models.get(0)?.groups.map((g) => g.label)).toEqual(['B'])
  })
  it('does not promise combinations whose missing member belongs to an opponent', () => {
    const data = board()
    data.scanData!.standard = data.scanData!.standard.filter((s) => s.name !== 'a')
    data.scanData!.selectedAbilities = [{ name: 'a', hero_order: 8 }] as never
    data.selectedSpotHeroOrder = 0
    expect(
      buildDraftBadges(data)
        .abilities.get('b')
        ?.groups.map((g) => g.label),
    ).not.toContain('A')
  })
  it('keeps your picked model as a combo anchor without giving it an available-pick rank', () => {
    const data = board()
    data.heroModels[0].isPicked = true
    data.selectedModelHeroOrder = 0
    const result = buildDraftBadges(data)
    expect(result.models.get(0)?.rank).toBeUndefined()
    expect(result.models.get(0)?.groups.map((g) => g.label)).toEqual(['B'])
    expect(result.abilities.get('b')?.groups.map((g) => g.label)).toContain('B')
  })
})
