import { describe, it, expect } from 'vitest'
import {
  recommendationScore,
  availableNames,
  topPoolPairs,
} from '../../../../src/renderer/overlay/src/ranking'
import { buildDraftBadges } from '../../../../src/renderer/overlay/src/draft-badges'
import type { OverlayDataPayload } from '@shared/types'

describe('60/40 current-pool recommendations', () => {
  it('puts Shukuchi above Bash despite being picked slightly later', () => {
    expect(
      recommendationScore({ highSkillWinrate: 0.6158, winrate: 0.565, pickRate: 3.27 })!.score,
    ).toBeGreaterThan(
      recommendationScore({ highSkillWinrate: 0.526, winrate: 0.5006, pickRate: 3.04 })!.score,
    )
    expect(
      recommendationScore({ highSkillWinrate: null, winrate: 0.55, pickRate: 25 })!.fallback,
    ).toBe(true)
    expect(recommendationScore({ highSkillWinrate: null, winrate: null, pickRate: 1 })).toBeNull()
  })
  it('recomputes contiguous ranks and pairs after an opponent picks a cached pool skill', () => {
    const data = {
      scanData: {
        ultimates: [],
        standard: [
          { name: 'shukuchi', displayName: '缩地', pickRate: 3.27, winrate: 0.565 },
          { name: 'bash', displayName: '深海重击', pickRate: 3.04, winrate: 0.5006 },
          { name: 'other', displayName: '其他', pickRate: 10, winrate: 0.51 },
        ],
        selectedAbilities: [],
      },
      heroModels: [],
      opCombinations: [],
      heroSynergies: [],
      rankingData: {
        abilities: [
          { name: 'shukuchi', highSkillWinrate: 0.6158, winrate: 0.565, pickRate: 3.27 },
          { name: 'bash', highSkillWinrate: 0.526, winrate: 0.5006, pickRate: 3.04 },
        ],
        heroes: [],
        pairs: [
          { ability1Name: 'bash', ability2Name: 'shukuchi', synergyWinrate: 0.7 },
          { ability1Name: 'other', ability2Name: 'bash', synergyWinrate: 0.6 },
        ],
      },
    } as unknown as OverlayDataPayload
    expect(buildDraftBadges(data).abilities.get('shukuchi')?.rank).toBe(1)
    data.scanData!.selectedAbilities = [{ name: 'shukuchi', hero_order: 9 }] as never
    expect(availableNames(data)).not.toContain('shukuchi')
    expect(buildDraftBadges(data).abilities.get('bash')?.rank).toBe(1)
    expect(buildDraftBadges(data).abilities.get('shukuchi')?.rank).toBeUndefined()
    expect(topPoolPairs(data).map((p) => p.synergyWinrate)).toEqual([0.6])
  })
  it('deduplicates pairs, excludes unavailable partners, sorts descending and caps at ten', () => {
    const slots = Array.from({ length: 13 }, (_, i) => ({ name: `s${i}`, displayName: `技能${i}` }))
    const pairs = Array.from({ length: 12 }, (_, i) => ({
      ability1Name: 's0',
      ability2Name: `s${i + 1}`,
      synergyWinrate: 0.5 + i / 100,
    }))
    const data = {
      scanData: { standard: slots, ultimates: [], selectedAbilities: [] },
      rankingData: { pairs: [...pairs, { ...pairs[11], ability1Name: 's12', ability2Name: 's0' }] },
    } as unknown as OverlayDataPayload
    const result = topPoolPairs(data)
    expect(result).toHaveLength(10)
    expect(result[0].synergyWinrate).toBe(0.61)
    expect(result[9].synergyWinrate).toBe(0.52)
  })
})
