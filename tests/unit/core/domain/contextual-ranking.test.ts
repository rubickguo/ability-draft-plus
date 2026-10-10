import { describe, expect, it } from 'vitest'
import type { OverlayDataPayload } from '@shared/types'
import { recommendDraft } from '../../../../src/core/domain/contextual-ranking'

function skill(name: string, winrate = 0.55, extra: Record<string, unknown> = {}) {
  return {
    name,
    displayName: name,
    winrate,
    highSkillWinrate: winrate,
    pickRate: 15,
    hero_order: 0,
    is_ultimate: false,
    isUltimate: false,
    ...extra,
  }
}
function fixture() {
  return {
    scanData: {
      standard: [skill('good', 0.6), skill('deny', 0.589), skill('bad', 0.44)],
      ultimates: [],
      selectedAbilities: [] as ReturnType<typeof skill>[],
    },
    heroModels: [] as Record<string, unknown>[],
    selectedSpotHeroOrder: null as number | null,
    selectedModelHeroOrder: null as number | null,
    rankingData: {
      abilities: [
        skill('good', 0.6),
        skill('deny', 0.589),
        skill('bad', 0.44),
        skill('anchor', 0.55),
      ],
      heroes: [] as ReturnType<typeof skill>[],
      pairs: [] as {
        ability1Name: string
        ability2Name: string
        synergyWinrate: number
        synergyIncrease: number | null
        numPicks?: number | null
      }[],
      heroPairs: [] as {
        heroName: string
        abilityName: string
        synergyWinrate: number
        synergyIncrease: number | null
        numPicks?: number | null
      }[],
      sampleCounts: {} as Record<
        string,
        { numPicks: number | null; highSkillNumPicks: number | null }
      >,
      context: {
        currentPick: null as number | null,
        modelAssignments: [] as { playerIndex: number; heroName: string }[],
        rolePositions: [] as number[],
        roleMode: 'off',
      },
    },
  }
}
function run(data: ReturnType<typeof fixture>) {
  return recommendDraft(data as unknown as OverlayDataPayload)
}
function pair(data: ReturnType<typeof fixture>, target = 'deny', count: number | null = 1000) {
  data.rankingData.pairs.push({
    ability1Name: 'anchor',
    ability2Name: target,
    synergyWinrate: 0.75,
    synergyIncrease: 0.15,
    numPicks: count,
  })
}
function own(data: ReturnType<typeof fixture>, player = 0) {
  data.selectedSpotHeroOrder = player
}
function model(data: ReturnType<typeof fixture>, name = 'axe', winrate = 0.58, heroOrder = 0) {
  data.heroModels.push({
    heroName: name,
    heroDisplayName: name,
    heroOrder,
    isPicked: false,
    winrate,
    pickRate: 30,
  })
  data.rankingData.heroes.push(skill(name, winrate))
}

describe('contextual draft ranking', () => {
  it('uses strength rather than popularity, mixes models and skills and gives contiguous unique ranks', () => {
    const data = fixture()
    data.rankingData.abilities[0].pickRate = 45
    data.rankingData.abilities[1].pickRate = 1
    model(data, 'axe', 0.595)
    const result = run(data)
    expect(result.choices.map((c) => c.key)).toEqual([
      'ability:good',
      'hero:axe',
      'ability:deny',
      'ability:bad',
    ])
    expect(result.choices.map((c) => c.rank)).toEqual([1, 2, 3, 4])
    expect(result.best?.key).toBe('ability:good')
  })
  it('removes globally picked cached skills, duplicates and already assigned models', () => {
    const data = fixture()
    model(data)
    data.scanData.standard.push(data.scanData.standard[0])
    data.scanData.selectedAbilities.push(skill('good', 0.6, { hero_order: 7 }))
    data.rankingData.context.modelAssignments.push({ playerIndex: 7, heroName: 'axe' })
    expect(run(data).choices.map((c) => c.name)).toEqual(['deny', 'bad'])
  })
  it('uses a selected model even without a known player seat', () => {
    const data = fixture()
    model(data)
    model(data, 'lina', 0.6, 1)
    data.selectedModelHeroOrder = 0
    data.rankingData.heroPairs.push({
      heroName: 'axe',
      abilityName: 'deny',
      synergyWinrate: 0.75,
      synergyIncrease: 0.15,
      numPicks: 1000,
    })
    const result = run(data)
    expect(result.choices.every((c) => c.kind === 'ability')).toBe(true)
    expect(result.best?.name).toBe('deny')
  })
  it('excludes other ultimates once our ultimate is picked, but opponents do not consume our slots', () => {
    const data = fixture()
    own(data)
    data.scanData.ultimates.push(skill('ult', 0.7, { is_ultimate: true, isUltimate: true }))
    data.rankingData.abilities.push(skill('ult', 0.7, { isUltimate: true }))
    data.scanData.selectedAbilities.push(
      skill('enemyUlt', 0.5, { hero_order: 6, is_ultimate: true }),
    )
    expect(run(data).best?.name).toBe('ult')
    data.scanData.selectedAbilities.push(skill('ownUlt', 0.5, { hero_order: 0, is_ultimate: true }))
    expect(run(data).choices.some((c) => c.name === 'ult')).toBe(false)
  })
  it('excludes standard abilities after three own standard picks', () => {
    const data = fixture()
    own(data)
    model(data)
    for (let i = 0; i < 3; i++)
      data.scanData.selectedAbilities.push(skill(`own${i}`, 0.5, { hero_order: 0 }))
    expect(run(data).choices.map((c) => c.kind)).toEqual(['hero'])
  })
  it('only uses our own anchors for self synergy', () => {
    const data = fixture()
    own(data)
    pair(data)
    data.scanData.selectedAbilities.push(skill('anchor', 0.55, { hero_order: 1 }))
    expect(run(data).best?.name).toBe('good')
    data.scanData.selectedAbilities[0].hero_order = 0
    expect(run(data).best?.name).toBe('deny')
  })
  it('limits unknown-sample synergy and does not add duplicate pair records', () => {
    const data = fixture()
    own(data)
    pair(data, 'deny', null)
    data.scanData.selectedAbilities.push(skill('anchor', 0.55, { hero_order: 0 }))
    const first = run(data).choices.find((c) => c.name === 'deny')!
    expect(first.synergyAdjustment).toBeGreaterThan(0)
    expect(first.synergyAdjustment).toBeLessThanOrEqual(1.5)
    data.rankingData.pairs.push(data.rankingData.pairs[0])
    expect(run(data).choices.find((c) => c.name === 'deny')!.selfScore).toBe(first.selfScore)
  })
  it('shrinks a tiny high-skill sample towards overall data', () => {
    const data = fixture()
    data.rankingData.abilities[1].highSkillWinrate = 0.95
    data.rankingData.abilities[1].winrate = 0.5
    data.rankingData.sampleCounts['ability:deny'] = { numPicks: 10000, highSkillNumPicks: 2 }
    expect(run(data).best?.name).toBe('good')
    expect(run(data).choices.find((c) => c.name === 'deny')!.baseScore).toBeLessThan(52)
  })
  it('adds modest role adaptation using known tags without a seat', () => {
    const data = fixture()
    data.scanData.standard = [skill('dazzle_shallow_grave', 0.55), skill('sven_great_cleave', 0.55)]
    data.rankingData.abilities = [...data.scanData.standard]
    data.rankingData.context.roleMode = 'fixed'
    data.rankingData.context.rolePositions = [5]
    const support = run(data)
    expect(support.best?.name).toBe('dazzle_shallow_grave')
    expect(support.best!.roleAdjustment).toBeLessThanOrEqual(2)
    data.rankingData.context.rolePositions = [1]
    expect(run(data).best?.name).toBe('sven_great_cleave')
  })
  it('uses the interleaved snake schedule and returns exact waits, including double turns', () => {
    const data = fixture()
    own(data)
    data.rankingData.context.currentPick = 0
    expect(run(data).waitPicks).toBe(18)
    own(data, 5)
    data.rankingData.context.currentPick = 1
    expect(run(data).waitPicks).toBe(16)
    own(data, 9)
    data.rankingData.context.currentPick = 9
    expect(run(data).waitPicks).toBe(0)
  })
  it('only promotes an evidenced enemy half-combo within the self near-optimal set', () => {
    const data = fixture()
    own(data)
    data.rankingData.context.currentPick = 0
    pair(data)
    data.scanData.selectedAbilities.push(skill('anchor', 0.55, { hero_order: 5 }))
    const result = run(data)
    expect(result.best?.name).toBe('deny')
    expect(result.best?.denyThreatIds).toHaveLength(1)
    expect(result.threats[0]).toMatchObject({
      kind: 'enemy',
      ownerPlayerIndex: 5,
      imminent: true,
      actionable: true,
    })
    data.rankingData.pairs[0].ability2Name = 'bad'
    expect(run(data).best?.name).toBe('good')
  })
  it('does not force denial without a verified turn or sample counts', () => {
    const data = fixture()
    own(data)
    pair(data)
    data.scanData.selectedAbilities.push(skill('anchor', 0.55, { hero_order: 5 }))
    expect(run(data).best?.name).toBe('good')
    data.rankingData.context.currentPick = 0
    data.rankingData.pairs[0].numPicks = null
    expect(run(data).best?.name).toBe('good')
    expect(run(data).threats[0].evidence).toBe('limited')
  })
  it('never mistakes an ally half-combo for a denial target', () => {
    const data = fixture()
    own(data)
    data.rankingData.context.currentPick = 0
    pair(data)
    data.scanData.selectedAbilities.push(skill('anchor', 0.55, { hero_order: 1 }))
    expect(run(data).best?.name).toBe('good')
    expect(run(data).threats[0].kind).toBe('ally')
  })
  it('keeps enemy half-combos when one member is no longer in the pool', () => {
    const data = fixture()
    own(data)
    pair(data)
    data.scanData.selectedAbilities.push(skill('anchor', 0.55, { hero_order: 5 }))
    const result = run(data)
    expect(result.threats[0].ownedNames).toEqual(['anchor'])
    expect(result.threats[0].missingNames).toEqual(['deny'])
    expect(result.threats[0].candidateKeys).toEqual(['ability:deny'])
  })
  it('does not report already completed or split-between-players combos as actionable', () => {
    const data = fixture()
    own(data)
    pair(data)
    data.scanData.selectedAbilities.push(
      skill('anchor', 0.55, { hero_order: 5 }),
      skill('deny', 0.589, { hero_order: 6 }),
    )
    expect(run(data).threats).toHaveLength(0)
  })
  it('filters an enemy who has no legal ultimate slot left', () => {
    const data = fixture()
    own(data)
    data.rankingData.context.currentPick = 0
    pair(data)
    data.rankingData.abilities[1].isUltimate = true
    data.scanData.standard[1].is_ultimate = true
    data.scanData.selectedAbilities.push(
      skill('anchor', 0.55, { hero_order: 5 }),
      skill('takenUlt', 0.55, { hero_order: 5, is_ultimate: true }),
    )
    expect(run(data).threats.filter((t) => t.kind === 'enemy')).toHaveLength(0)
  })
  it('supports enemy model plus remaining skill and enemy skill plus remaining model', () => {
    const data = fixture()
    own(data)
    data.rankingData.context.currentPick = 0
    model(data, 'axe', 0.589)
    data.rankingData.heroPairs.push({
      heroName: 'axe',
      abilityName: 'deny',
      synergyWinrate: 0.75,
      synergyIncrease: 0.15,
      numPicks: 1000,
    })
    data.rankingData.context.modelAssignments.push({ playerIndex: 5, heroName: 'axe' })
    expect(run(data).best?.name).toBe('deny')
    data.rankingData.context.modelAssignments = []
    data.scanData.selectedAbilities.push(skill('deny', 0.589, { hero_order: 5 }))
    expect(run(data).best?.key).toBe('hero:axe')
  })
  it('retains unowned potential pairs without inventing an opponent or triggering denial', () => {
    const data = fixture()
    own(data)
    data.rankingData.context.currentPick = 0
    data.rankingData.pairs.push({
      ability1Name: 'deny',
      ability2Name: 'bad',
      synergyWinrate: 0.75,
      synergyIncrease: 0.2,
      numPicks: 1000,
    })
    const result = run(data)
    expect(result.threats[0].kind).toBe('potential')
    expect(result.threats[0].actionable).toBe(false)
    expect(result.best?.name).toBe('good')
  })
  it('makes stable rankings without modifying input', () => {
    const data = fixture()
    const before = JSON.stringify(data)
    expect(run(data)).toEqual(run(data))
    expect(JSON.stringify(data)).toBe(before)
  })
  it('returns no selections safely without a scan', () => {
    expect(recommendDraft({ scanData: null } as OverlayDataPayload).choices).toEqual([])
  })
  it('recommends a reliable two-pick combination when both consecutive turns are ours', () => {
    const data = fixture()
    own(data, 9)
    data.rankingData.context.currentPick = 9
    data.rankingData.abilities[1].highSkillWinrate = 0.575
    data.rankingData.abilities[2].highSkillWinrate = 0.574
    data.rankingData.pairs.push({
      ability1Name: 'deny',
      ability2Name: 'bad',
      synergyWinrate: 0.75,
      synergyIncrease: 0.2,
      numPicks: 1000,
    })
    const result = run(data)
    expect(result.best?.name).toBe('deny')
    expect(result.best?.followUp?.name).toBe('bad')
    expect(result.best?.reasons[0]).toContain('连选')
  })
  it('does not promise a consecutive pair before it is actually our turn or with unknown samples', () => {
    const data = fixture()
    own(data, 9)
    data.rankingData.context.currentPick = 0
    data.rankingData.pairs.push({
      ability1Name: 'deny',
      ability2Name: 'bad',
      synergyWinrate: 0.9,
      synergyIncrease: 0.4,
      numPicks: 1000,
    })
    expect(run(data).best?.followUp).toBeUndefined()
    data.rankingData.context.currentPick = 9
    data.rankingData.pairs[0].numPicks = null
    expect(run(data).best?.followUp).toBeUndefined()
  })
  it('does not propose an impossible two-ultimate combination', () => {
    const data = fixture()
    own(data, 9)
    data.rankingData.context.currentPick = 9
    for (const name of ['deny', 'bad'])
      data.rankingData.abilities.find((a) => a.name === name)!.isUltimate = true
    data.rankingData.pairs.push({
      ability1Name: 'deny',
      ability2Name: 'bad',
      synergyWinrate: 0.9,
      synergyIncrease: 0.4,
      numPicks: 1000,
    })
    expect(run(data).threats).toHaveLength(0)
    expect(run(data).best?.followUp).toBeUndefined()
  })
  it('puts actionable self-adaptation ahead of generic statistical explanations', () => {
    const data = fixture()
    own(data)
    pair(data)
    data.scanData.selectedAbilities.push(skill('anchor', 0.55, { hero_order: 0 }))
    expect(run(data).best?.reasons[0]).toContain('搭配')
  })
  it('does not imply another pick after our final round', () => {
    const data = fixture()
    own(data, 0)
    data.rankingData.context.currentPick = 40
    const result = run(data)
    expect(result.waitPicks).toBeNull()
    expect(result.notes).toContain('这是自己的最后一次选取')
  })
  it("does not satisfy a mechanical prerequisite from someone else's selected ability", () => {
    const data = fixture()
    own(data)
    data.scanData.ultimates.push(skill('luna_eclipse', 0.62, { is_ultimate: true }))
    data.rankingData.abilities.push(skill('luna_eclipse', 0.62, { isUltimate: true }))
    data.scanData.selectedAbilities.push(skill('luna_lucent_beam', 0.5, { hero_order: 1 }))
    expect(run(data).best?.name).toBe('good')
    data.scanData.selectedAbilities[0].hero_order = 0
    expect(run(data).best?.name).toBe('luna_eclipse')
  })
  it('can infer our wait from known own picks and model without pretending the global turn is known', () => {
    const data = fixture()
    own(data)
    model(data)
    data.selectedModelHeroOrder = 0
    data.scanData.selectedAbilities.push(skill('anchor', 0.55, { hero_order: 0 }))
    pair(data, 'bad')
    data.scanData.selectedAbilities.push(skill('enemyAnchor', 0.55, { hero_order: 5 }))
    const result = run(data)
    expect(result.waitPicks).toBe(18)
    expect(result.notes.join(' ')).toContain('推算')
    expect(result.threats.every((t) => !t.imminent)).toBe(true)
  })
  it('does not infer wait from an unreadable own box or uncertain model ownership', () => {
    const data = fixture()
    own(data)
    model(data)
    data.heroModels[0].isPicked = true
    expect(run(data).waitPicks).toBeNull()
    data.selectedModelHeroOrder = 0
    data.scanData.selectedAbilities.push(
      skill('unknown', 0.5, { name: null, isUnknown: true, hero_order: 0, confidence: 0.2 }),
    )
    expect(run(data).waitPicks).toBeNull()
  })
  it('can infer the first-pick interval when every model is explicitly still unpicked', () => {
    const data = fixture()
    own(data)
    model(data)
    expect(run(data).waitPicks).toBe(18)
    expect(run(data).notes.join(' ')).toContain('推算')
  })
  it('treats all 40 normal unknown empty boxes as empty, matching real scan output', () => {
    const data = fixture()
    own(data)
    model(data)
    for (let row = 0; row < 10; row++)
      for (let box = 0; box < 4; box++)
        data.scanData.selectedAbilities.push(
          skill('empty', 0.5, {
            name: null,
            isUnknown: true,
            confidence: 0,
            hero_order: row,
            ability_order: box,
            is_ultimate: box === 3,
            coord: { x: box * 70, y: row * 100 },
          }),
        )
    const result = run(data)
    expect(result.choices).toHaveLength(4)
    expect(result.choices.filter((c) => c.kind === 'ability')).toHaveLength(3)
    expect(result.waitPicks).toBe(18)
  })
  it('counts separate unreadable nonempty standard boxes even when ability_order is shared', () => {
    const data = fixture()
    own(data)
    model(data)
    for (let i = 0; i < 3; i++)
      data.scanData.selectedAbilities.push(
        skill('unknown', 0.5, {
          name: null,
          isUnknown: true,
          confidence: 0.2,
          hero_order: 0,
          ability_order: 0,
          coord: { x: i * 70, y: 0 },
        }),
      )
    expect(run(data).choices.map((c) => c.kind)).toEqual(['hero'])
  })
  it('uses inferred dynamic role positions instead of an empty fixed-role list', () => {
    const data = fixture()
    data.scanData.standard = [skill('dazzle_shallow_grave', 0.55), skill('sven_great_cleave', 0.55)]
    data.rankingData.abilities = [...data.scanData.standard]
    data.rankingData.context.roleMode = 'dynamic'
    data.rankingData.context.rolePositions = []
    ;(data as unknown as OverlayDataPayload).roleContext = {
      mode: 'dynamic',
      status: 'active',
      effectivePositions: [5],
      teamGreed: null,
      teammates: [],
      dynamicGateOpen: true,
    }
    expect(run(data).best?.name).toBe('dazzle_shallow_grave')
    expect(run(data).best?.roleAdjustment).toBeGreaterThan(0)
  })
  it('does not penalize a native ability on its own melee model', () => {
    const data = fixture()
    model(data, 'monkey_king', 0.5)
    data.selectedModelHeroOrder = 0
    data.scanData.ultimates.push(skill('monkey_king_wukongs_command', 0.65, { is_ultimate: true }))
    data.rankingData.abilities.push(
      skill('monkey_king_wukongs_command', 0.65, { isUltimate: true }),
    )
    expect(run(data).best?.name).toBe('monkey_king_wukongs_command')
    expect(run(data).best?.synergyAdjustment).toBe(0)
  })
  it('waives ranged-only incompatibility when our existing build grants ranged attacks', () => {
    const data = fixture()
    own(data)
    model(data, 'axe', 0.5)
    data.selectedModelHeroOrder = 0
    data.scanData.selectedAbilities.push(
      skill('terrorblade_metamorphosis', 0.55, { hero_order: 0 }),
    )
    data.scanData.standard.push(skill('enchantress_impetus', 0.65))
    data.rankingData.abilities.push(skill('enchantress_impetus', 0.65))
    expect(run(data).best?.name).toBe('enchantress_impetus')
    expect(run(data).best?.synergyAdjustment).toBe(0)
  })
  it('also checks a candidate model against our already picked ranged-only skills', () => {
    const data = fixture()
    own(data)
    model(data, 'axe', 0.7)
    model(data, 'lina', 0.62, 1)
    data.scanData.selectedAbilities.push(skill('enchantress_impetus', 0.55, { hero_order: 0 }))
    const result = run(data)
    expect(result.best?.name).toBe('lina')
    expect(result.choices.find((c) => c.name === 'axe')!.synergyAdjustment).toBeLessThan(0)
  })
  it('excludes unidentified model placeholders from recommendations', () => {
    const data = fixture()
    model(data, 'unknown_model_1', 0.9)
    expect(run(data).choices.some((c) => c.kind === 'hero')).toBe(false)
  })
})
