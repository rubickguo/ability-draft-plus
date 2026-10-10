// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { AbilityHotspot } from '../../../../src/renderer/overlay/src/components/AbilityHotspot'
import { HeroModelHotspot } from '../../../../src/renderer/overlay/src/components/HeroModelHotspot'
import { Tooltip } from '../../../../src/renderer/overlay/src/components/Tooltip'
import { TopCombinationsPanel } from '../../../../src/renderer/overlay/src/components/TopCombinationsPanel'
import { BestChoicePanel } from '../../../../src/renderer/overlay/src/components/BestChoicePanel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

beforeEach(() => {
  // Components are transformed without the renderer's Vite React plugin in unit tests.
  Object.assign(globalThis, { React })
  localStorage.clear()
})
afterEach(cleanup)

describe('one source for recommendation presentation', () => {
  it('does not add a second recommendation glow from legacy skill flags', () => {
    const { container } = render(
      React.createElement(AbilityHotspot, {
        slot: {
          name: 'test',
          displayName: '技能',
          coord: { x: 0, y: 0, width: 50, height: 50 },
          isGeneralTopTier: true,
          isSynergySuggestionForMySpot: true,
          isPersonallyDriven: true,
        } as never,
        scaleFactor: 1,
        isSelectedAbility: false,
        isMySpotHero: false,
        onHover: vi.fn(),
        onLeave: vi.fn(),
      }),
    )
    expect(container.querySelector('.shimmer-teal, .shimmer-green, .personal-marker')).toBeNull()
  })

  it('does not make an unranked model glow because the original engine selected it', () => {
    const { container } = render(
      React.createElement(HeroModelHotspot, {
        model: {
          heroOrder: 0,
          heroDisplayName: '模型',
          isGeneralTopTier: true,
          isPersonallyDriven: true,
        } as never,
        coord: { x: 0, y: 0, width: 50, height: 50 } as never,
        scaleFactor: 1,
        isMyModel: false,
        onHover: vi.fn(),
        onLeave: vi.fn(),
      }),
    )
    expect(container.querySelector('.shimmer-gold, .personal-marker')).toBeNull()
  })

  it('shows unified reasons instead of contradictory old priority and fixed-wait hints', () => {
    const { container } = render(
      React.createElement(Tooltip, {
        data: {
          type: 'ability',
          slot: {
            displayName: '技能',
            winrate: 0.55,
            pickRate: 8,
            isGeneralTopTier: true,
            isSynergySuggestionForMySpot: true,
            contestedSoon: true,
            highWinrateCombinations: [],
            lowWinrateCombinations: [],
            strongHeroSynergies: [],
            weakHeroSynergies: [],
          },
        } as never,
        anchorRect: null,
        guidance: {
          rank: 1,
          score: 0.63,
          selfScore: 63,
          groups: [],
          reasons: ['补全已有组合'],
        } as never,
      }),
    )
    expect(container.textContent).toContain('补全已有组合')
    expect(container.textContent).not.toContain('tooltip.synergyPick')
    expect(container.textContent).not.toContain('tooltip.contestedSoon')
    expect(container.textContent).not.toContain('badges.hs')
  })

  it('keeps the enemy-owned half visible and persists the threat panel toggle', () => {
    const recommendation = {
      choices: [],
      waitPicks: 8,
      notes: [],
      threats: [
        {
          key: 'enemy:6:combo',
          kind: 'enemy',
          ownerPlayerIndex: 6,
          names: ['已有技能', '待选技能'],
          ownedNames: ['已有技能'],
          missingNames: ['待选技能'],
          candidateKeys: ['ability:remaining'],
          synergyWinrate: 0.68,
          numPicks: 150,
          evidence: 'known',
          imminent: true,
          actionable: true,
          reason: '敌方有机会在你之前补齐',
        },
      ],
    }
    const { container, getByRole, unmount } = render(
      React.createElement(TopCombinationsPanel, {
        recommendation,
        data: {
          scanData: { standard: [], ultimates: [], selectedAbilities: [] },
          rankingData: { pairs: [] },
        },
      } as never),
    )
    expect(container.textContent).toContain('已有：已有技能')
    expect(container.textContent).toContain('可截胡：待选技能')
    expect(container.textContent).toContain('150 场')
    fireEvent.click(getByRole('button', { name: '隐藏组合与截胡' }))
    expect(container.textContent).not.toContain('已有：已有技能')
    expect(localStorage.getItem('topCombinationsVisible')).toBe('false')
    unmount()
    const next = render(React.createElement(TopCombinationsPanel, { recommendation } as never))
    expect(next.queryByText('已有：已有技能')).toBeNull()
    expect(next.getByRole('button', { name: '显示组合与截胡' })).toBeTruthy()
  })

  it('updates the explicit answer with the current rank order and does not promise an unconfirmed double pick', () => {
    const first = {
      key: 'ability:first',
      rank: 1,
      displayName: '第一选择',
      reasons: ['补足控制'],
      followUp: { displayName: '连选组件' },
    }
    const second = {
      key: 'hero:second',
      rank: 2,
      displayName: '第二选择',
      reasons: ['适合已有技能'],
    }
    const third = { key: 'ability:third', rank: 3, displayName: '第三选择', reasons: ['第三理由'] }
    const recommendation = {
      choices: [first, second, third],
      threats: [],
      best: first,
      waitPicks: null,
      notes: [],
    }
    const { container, rerender } = render(
      React.createElement(BestChoicePanel, { recommendation } as never),
    )
    expect(container.querySelector('.best-choice-title')?.textContent).toBe('1第一选择')
    expect(container.querySelector('.best-choice-alternatives')?.textContent).toContain(
      '2 第二选择',
    )
    expect(container.textContent).toContain('选取顺序尚未确认')
    expect(container.textContent).not.toContain('连选搭配')
    rerender(
      React.createElement(BestChoicePanel, {
        recommendation: { ...recommendation, waitPicks: 0 },
      } as never),
    )
    expect(container.textContent).toContain('连选搭配：连选组件')
    rerender(
      React.createElement(BestChoicePanel, {
        recommendation: {
          ...recommendation,
          choices: [
            { ...second, rank: 1 },
            { ...first, rank: 2 },
          ],
          waitPicks: 18,
        },
      } as never),
    )
    expect(container.querySelector('.best-choice-title')?.textContent).toBe('1第二选择')
    expect(container.textContent).toContain('这手选完到你再选，中间隔 18 手')
  })

  it('keeps speculative combinations secondary but allows an explicit historical-winrate view', () => {
    const potential = {
      key: 'potential',
      kind: 'potential',
      names: ['潜在甲', '潜在乙'],
      ownedNames: [],
      missingNames: ['潜在甲', '潜在乙'],
      synergyWinrate: 0.9,
      numPicks: null,
      actionable: false,
      imminent: false,
      evidence: 'limited',
      reason: '双方都未拿到',
    }
    const enemy = {
      ...potential,
      key: 'enemy',
      kind: 'enemy',
      names: ['敌方甲', '敌方乙'],
      ownedNames: ['敌方甲'],
      missingNames: ['敌方乙'],
      synergyWinrate: 0.7,
      numPicks: 100,
      evidence: 'known',
    }
    const { container, getByRole } = render(
      React.createElement(TopCombinationsPanel, {
        recommendation: { choices: [], threats: [enemy, potential], notes: [], waitPicks: null },
      } as never),
    )
    expect(container.querySelector('details')?.open).toBe(false)
    expect(container.querySelector('li')?.textContent).toContain('敌方半套')
    fireEvent.click(getByRole('button', { name: '历史胜率' }))
    expect(container.querySelector('li')?.textContent).toContain('潜在甲 + 潜在乙')
    expect(container.querySelector('li')?.textContent).toContain('样本量缺失')
    expect(container.textContent).toContain('不等于当前选取建议')
  })
})
