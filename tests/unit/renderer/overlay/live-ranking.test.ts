// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useOverlayData } from '../../../../src/renderer/overlay/src/hooks/use-overlay-data'

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ i18n: { language: 'zh-CN' } }),
}))

afterEach(cleanup)

function setup() {
  const events = new Map<string, (value: any) => void>()
  const data = {
    selectedSpotHeroOrder: null,
    selectedModelHeroOrder: null,
    scanData: {
      ultimates: [],
      standard: [{ name: 'remaining' }],
      selectedAbilities: [{ name: 'owned', hero_order: 5 }],
    },
    heroModels: [{ heroName: 'axe', heroOrder: 0 }],
  }
  const invoke = vi.fn(async (channel: string) =>
    channel === 'overlay:getInitialData'
      ? data
      : {
          abilities: [],
          heroes: [],
          pairs: [],
          context: { rolePositions: [], currentPick: null, modelAssignments: [] },
        },
  )
  Object.defineProperty(window, 'electronApi', {
    configurable: true,
    value: {
      invoke,
      send: vi.fn(),
      on: (name: string, fn: (value: any) => void) => {
        events.set(name, fn)
        return () => events.delete(name)
      },
    },
  })
  return { events, invoke }
}

describe('live ranking context', () => {
  it('queries owned anchors as well as remaining candidates so enemy half-combos survive', async () => {
    const { invoke } = setup()
    renderHook(() => useOverlayData())
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('draft:getRankingData', {
        names: ['remaining', 'owned'],
        heroNames: ['axe'],
      }),
    )
  })

  it('uses a new seat/model immediately without a new screenshot', async () => {
    const { events } = setup()
    const { result } = renderHook(() => useOverlayData())
    await waitFor(() => expect(result.current.overlayData?.rankingData).toBeDefined())
    act(() => events.get('draft:selectMySpot')!({ selectedHeroOrderForDrafting: 5 }))
    expect(result.current.overlayData?.selectedSpotHeroOrder).toBe(5)
    act(() => events.get('draft:selectMyModel')!({ selectedModelHeroOrder: 0 }))
    expect(result.current.overlayData?.selectedModelHeroOrder).toBe(0)
  })

  it('refreshes context after a role setting change without capturing the screen', async () => {
    const { invoke } = setup()
    const { result } = renderHook(() => useOverlayData())
    await waitFor(() => expect(result.current.overlayData?.rankingData).toBeDefined())
    const before = invoke.mock.calls.filter(([c]) => c === 'draft:getRankingData').length
    act(() => result.current.refreshRanking())
    await waitFor(() =>
      expect(invoke.mock.calls.filter(([c]) => c === 'draft:getRankingData')).toHaveLength(
        before + 1,
      ),
    )
  })
})
