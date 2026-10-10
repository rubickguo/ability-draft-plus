import type { OverlayDataPayload } from '@shared/types'
import { buildTurnSchedule } from '../gsi/draft-clock'
import { isInertOnModel, type AbilityTag } from './ability-tags'
import { isUnidentifiedModel } from './hero-identification'
import { localizeDotaName } from '@shared/localization/dota-names'
import tagsData from '../../../resources/data/ability_tags.json'
import modelData from '../../../resources/data/hero_meta.json'

export interface DraftChoice {
  key: string
  kind: 'ability' | 'hero'
  name: string
  displayName: string
  heroOrder?: number
  rank: number
  selfScore: number
  baseScore: number
  synergyAdjustment: number
  roleAdjustment: number
  urgencyAdjustment: number
  reasons: string[]
  confidence: 'known' | 'limited'
  denyThreatIds: string[]
  followUp?: { key: string; name: string; displayName: string }
}

export interface DraftThreat {
  key: string
  kind: 'enemy' | 'potential' | 'own' | 'ally'
  names: string[]
  candidateKeys: string[]
  ownedNames: string[]
  missingNames: string[]
  ownerPlayerIndex?: number
  synergyWinrate: number
  numPicks: number | null
  evidence: 'known' | 'limited'
  imminent: boolean
  actionable: boolean
  reason: string
}

export interface DraftRecommendation {
  choices: DraftChoice[]
  threats: DraftThreat[]
  best?: DraftChoice
  waitPicks: number | null
  notes: string[]
}

type Counts = { numPicks: number | null; highSkillNumPicks: number | null }
type Stats = { winrate?: number | null; highSkillWinrate?: number | null; pickRate?: number | null }
type PairStats = {
  synergyWinrate: number
  synergyIncrease: number | null
  numPicks?: number | null
}
type ExtraRanking = {
  heroPairs?: (PairStats & { heroName: string; abilityName: string })[]
  sampleCounts?: Record<string, Counts>
  context?: {
    currentPick: number | null
    modelAssignments: { playerIndex: number; heroName: string }[]
    rolePositions: number[]
    roleMode?: string
  }
}
type Pair = PairStats & { keys: [string, string]; id: string }
type Entity = {
  key: string
  name: string
  displayName: string
  kind: 'ability' | 'hero'
  ultimate: boolean
  heroOrder?: number
  stat: Stats
}
type TagRow = { tags: string[]; requires?: string[]; roleAvoid?: number[] }
type ModelRow = { attackType?: string; tags?: string[]; baseInt?: number; intGain?: number }

const TAGS = tagsData.abilities as Record<string, TagRow>
const MODELS = modelData as Record<string, ModelRow>
const SCHEDULE = buildTurnSchedule()
// These are bounded recommendation-index policies, NOT fitted win probabilities.
const NEAR_OPTIMAL_POINTS = 1.5
const PAIR_PRIOR = 150
const MIN_DENIAL_SAMPLES = 100
const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value))
const rate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
const player = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < 10
const heroName = (name: string): string => name.replace(/^npc_dota_hero_/, '')
const label = (name: string, display = name): string => localizeDotaName(name, display, 'zh-CN')
const sorted = (a: DraftChoice, b: DraftChoice): number =>
  b.selfScore - a.selfScore || a.key.localeCompare(b.key)

function base(stat: Stats, samples?: Counts): { score: number; known: boolean; reason: string } {
  const global = rate(stat.winrate) ? stat.winrate : null
  const hs = rate(stat.highSkillWinrate) ? stat.highSkillWinrate : null
  if (hs !== null) {
    const n = samples?.highSkillNumPicks
    // Overall contains the HS subset: use it only as a shrinkage target, never
    // add its counts to HS counts as if they were independent observations.
    const weight = count(n) ? n / (n + 200) : 1
    return {
      score: 100 * (global !== null ? weight * hs + (1 - weight) * global : hs),
      known: count(n) && n >= 100,
      reason: count(n) && n < 100 ? '高手样本较少，向总体表现收缩' : '以高水平历史表现为基础',
    }
  }
  return {
    score: (global ?? 0.45) * 100,
    known: count(samples?.numPicks) && samples!.numPicks! >= 100,
    reason: global === null ? '缺少单项统计，保守排序' : '缺少高手统计，使用总体表现',
  }
}

function pairEffect(pair: Pair): number {
  const lift = pair.synergyIncrease
  if (typeof lift !== 'number' || !Number.isFinite(lift)) return 0
  const n = pair.numPicks
  const weight = count(n) ? n / (n + PAIR_PRIOR) : 0.1
  return clamp(lift * 100 * weight, count(n) ? -6 : -1.5, count(n) ? 6 : 1.5)
}

function credible(pair: Pair): boolean {
  return (
    count(pair.numPicks) &&
    pair.numPicks >= MIN_DENIAL_SAMPLES &&
    pair.synergyWinrate >= 0.58 &&
    (pair.synergyIncrease ?? 0) >= 0.06
  )
}

/** Pure, deterministic advice. Scores are bounded heuristic indices, not a
 * causal model or match-win forecast. Raw pair winrate is never added to base
 * winrate; overlapping pair residuals are averaged, not accumulated. */
export function recommendDraft(data: OverlayDataPayload): DraftRecommendation {
  const result: DraftRecommendation = { choices: [], threats: [], waitPicks: null, notes: [] }
  if (!data.scanData) return result
  const ranking = data.rankingData as
    | (NonNullable<OverlayDataPayload['rankingData']> & ExtraRanking)
    | undefined
  const context = ranking?.context
  const spot = player(data.selectedSpotHeroOrder) ? data.selectedSpotHeroOrder : null
  const assignments = new Map<number, string>()
  for (const row of context?.modelAssignments ?? [])
    if (player(row.playerIndex) && row.heroName && !isUnidentifiedModel(row.heroName))
      assignments.set(row.playerIndex, heroName(row.heroName))
  const manualModel = (data.heroModels ?? []).find(
    (h) => h.heroOrder === data.selectedModelHeroOrder && !isUnidentifiedModel(h.heroName),
  )
  const ownModel =
    (spot !== null ? assignments.get(spot) : undefined) ??
    (manualModel ? heroName(manualModel.heroName) : undefined)
  if (spot !== null && ownModel) assignments.set(spot, ownModel)
  const abilities = new Map((ranking?.abilities ?? []).map((a) => [a.name, a]))
  const heroes = new Map((ranking?.heroes ?? []).map((h) => [heroName(h.name), h]))
  const entities = new Map<string, Entity>()
  const available = new Set<string>()
  const owned = new Map<number, Set<string>>()
  const occupied = new Map<number, { standard: number; ultimate: number }>()
  const seenBoxes = new Set<string>()
  const picked = new Set(
    data.scanData.selectedAbilities
      .filter((s) => s.name && !s.isUnknown)
      .map((s) => `ability:${s.name}`),
  )
  function addSkill(
    slot: NonNullable<OverlayDataPayload['scanData']>['standard'][number],
  ): Entity | null {
    if (!slot.name || slot.isUnknown) return null
    const stat = abilities.get(slot.name) ?? slot
    const entity: Entity = {
      key: `ability:${slot.name}`,
      name: slot.name,
      displayName: label(slot.name, slot.displayName),
      kind: 'ability',
      ultimate: Boolean(
        slot.is_ultimate || slot.isUltimateFromDb || abilities.get(slot.name)?.isUltimate,
      ),
      stat,
    }
    entities.set(entity.key, entity)
    return entity
  }
  for (const slot of [...data.scanData.ultimates, ...data.scanData.standard]) {
    const entity = addSkill(slot)
    if (entity && !picked.has(entity.key)) available.add(entity.key)
  }
  for (const [slotIndex, slot] of data.scanData.selectedAbilities.entries()) {
    if (!player(slot.hero_order)) continue
    const entity = addSkill(slot)
    // Unreadable nonempty boxes still occupy a slot; never assume they are free.
    // isUnknown is also true for normal empty boxes in the real enriched scan.
    // Occupancy requires evidence of nonempty pixels / a rejected icon match.
    const unreadable = !entity && (slot.rejectedMatch || slot.confidence > 0)
    if (!entity && !unreadable) continue
    const location = slot.coord ? `${slot.coord.x}:${slot.coord.y}` : `index:${slotIndex}`
    const boxKey = `${slot.hero_order}:${entity?.key ?? `unknown:${location}`}`
    if (seenBoxes.has(boxKey)) continue
    seenBoxes.add(boxKey)
    const state = occupied.get(slot.hero_order) ?? { standard: 0, ultimate: 0 }
    if (entity?.ultimate || slot.is_ultimate) state.ultimate++
    else state.standard++
    occupied.set(slot.hero_order, state)
    if (entity) {
      const set = owned.get(slot.hero_order) ?? new Set<string>()
      set.add(entity.key)
      owned.set(slot.hero_order, set)
    } else if (slot.hero_order === spot)
      result.notes.push('自己的已选技能有未识别项，搭配判断可能不完整')
  }
  const assignedNames = new Set(assignments.values())
  for (const model of data.heroModels ?? []) {
    if (!model.heroName || isUnidentifiedModel(model.heroName)) continue
    const name = heroName(model.heroName)
    const entity: Entity = {
      key: `hero:${name}`,
      name,
      displayName: label(name, model.heroDisplayName),
      kind: 'hero',
      ultimate: false,
      heroOrder: model.heroOrder,
      stat: heroes.get(name) ?? model,
    }
    entities.set(entity.key, entity)
    if (!model.isPicked && !assignedNames.has(name) && name !== ownModel) available.add(entity.key)
  }
  for (const [index, name] of assignments) {
    const set = owned.get(index) ?? new Set<string>()
    set.add(`hero:${name}`)
    owned.set(index, set)
    if (!entities.has(`hero:${name}`))
      entities.set(`hero:${name}`, {
        key: `hero:${name}`,
        name,
        displayName: label(name),
        kind: 'hero',
        ultimate: false,
        stat: heroes.get(name) ?? {},
      })
  }
  const ownKeys = new Set(spot === null ? [] : (owned.get(spot) ?? []))
  if (ownModel) ownKeys.add(`hero:${ownModel}`)
  function legal(entity: Entity, index: number | null, second?: Entity): boolean {
    if (entity.kind === 'hero')
      return (
        !(index === spot ? ownModel : index !== null && assignments.has(index)) &&
        second?.kind !== 'hero'
      )
    const slots =
      index === null
        ? { standard: 0, ultimate: 0 }
        : (occupied.get(index) ?? { standard: 0, ultimate: 0 })
    return entity.ultimate
      ? slots.ultimate + Number(second?.kind === 'ability' && second.ultimate) < 1
      : slots.standard + Number(second?.kind === 'ability' && !second.ultimate) < 3
  }
  const completed = context?.currentPick
  const clockKnown =
    spot !== null &&
    typeof completed === 'number' &&
    Number.isInteger(completed) &&
    completed >= 0 &&
    completed < SCHEDULE.length
  const ownUnreadable =
    spot !== null &&
    data.scanData.selectedAbilities.some(
      (s) =>
        s.hero_order === spot &&
        (!s.name || s.isUnknown) &&
        Boolean(s.rejectedMatch || s.confidence > 0),
    )
  const allModelsStillFree =
    (data.heroModels ?? []).length > 0 &&
    (data.heroModels ?? []).every((m) => m.isPicked === false) &&
    assignments.size === 0
  const ownCount = ownKeys.size
  const inferOwnTurns =
    !clockKnown &&
    spot !== null &&
    !ownUnreadable &&
    (Boolean(ownModel) || allModelsStillFree) &&
    ownCount <= 5
  const myTurns = clockKnown
    ? SCHEDULE.filter((t) => t.seq >= completed && t.playerIndex === spot)
    : inferOwnTurns
      ? SCHEDULE.filter((t) => t.playerIndex === spot).slice(ownCount)
      : []
  const nextOwn = myTurns[0]?.seq
  const laterOwn = myTurns[1]?.seq
  if (nextOwn !== undefined && laterOwn !== undefined) result.waitPicks = laterOwn - nextOwn - 1
  if (spot === null) result.notes.push('未选择我的席位：使用基础与模型适配排名，暂不判断敌我截胡')
  else if (inferOwnTurns)
    result.notes.push('等待手数按自己的已选数量推算；全局轮次未确认，暂不自动截胡或承诺连选')
  else if (!clockKnown) result.notes.push('选取轮次尚未确认：暂不以等待时间或截胡改动首选')
  else if (nextOwn === undefined) result.notes.push('自己的选取已完成')
  else if (laterOwn === undefined) result.notes.push('这是自己的最后一次选取')
  const imminent = (index: number): boolean =>
    clockKnown &&
    nextOwn !== undefined &&
    SCHEDULE.some(
      (t) => t.playerIndex === index && t.seq > nextOwn && t.seq < (laterOwn ?? SCHEDULE.length),
    )
  const pairMap = new Map<string, Pair>()
  function addPair(keys: [string, string], stats: PairStats): void {
    if (keys[0] === keys[1] || !rate(stats.synergyWinrate)) return
    const id = [...keys].sort().join('|')
    const previous = pairMap.get(id)
    let lift = stats.synergyIncrease
    if (typeof lift !== 'number' || !Number.isFinite(lift)) {
      const rates = keys.map(
        (key) =>
          entities.get(key)?.stat.winrate ??
          (key.startsWith('ability:')
            ? abilities.get(key.slice(8))?.winrate
            : heroes.get(key.slice(5))?.winrate),
      )
      lift =
        rate(rates[0]) && rate(rates[1]) ? stats.synergyWinrate - (rates[0] + rates[1]) / 2 : null
    }
    const pair = { ...stats, synergyIncrease: lift, keys, id }
    // Duplicate sources must not multiply evidence; prefer the larger known sample.
    if (!previous || (pair.numPicks ?? -1) > (previous.numPicks ?? -1)) pairMap.set(id, pair)
  }
  for (const row of ranking?.pairs ?? [])
    addPair([`ability:${row.ability1Name}`, `ability:${row.ability2Name}`], row)
  for (const row of ranking?.heroPairs ?? [])
    addPair([`hero:${heroName(row.heroName)}`, `ability:${row.abilityName}`], row)
  const pairs = [...pairMap.values()]
  const roleMode = context?.roleMode ?? data.roleContext?.mode ?? 'off'
  const inferredPositions =
    data.roleContext?.mode === 'dynamic' &&
    data.roleContext.status === 'active' &&
    data.roleContext.dynamicGateOpen !== false
      ? data.roleContext.effectivePositions
      : []
  const positions = (
    roleMode === 'off'
      ? []
      : roleMode === 'dynamic'
        ? inferredPositions
        : (context?.rolePositions ?? data.roleContext?.effectivePositions ?? [])
  ).filter((p) => p >= 1 && p <= 5)
  const ownTags = [...ownKeys].flatMap((key) =>
    key.startsWith('ability:') ? (TAGS[key.slice(8)]?.tags ?? []) : [],
  )
  function incompatible(abilityName: string, modelName: string): boolean {
    const attackType = MODELS[modelName]?.attackType
    const ownerId = abilities.get(abilityName)?.heroId
    const modelId = heroes.get(modelName)?.heroId
    return isInertOnModel(
      new Set((TAGS[abilityName]?.tags ?? []) as AbilityTag[]),
      attackType === 'Melee' || attackType === 'Ranged' ? attackType : undefined,
      {
        nativeToModel:
          (ownerId !== undefined && modelId !== undefined && ownerId === modelId) ||
          abilityName.startsWith(`${modelName}_`),
        picksGrantRanged: ownTags.includes('grants_ranged'),
      },
    )
  }
  for (const key of available) {
    const entity = entities.get(key)!
    if (!legal(entity, spot)) continue
    const foundational = base(entity.stat, ranking?.sampleCounts?.[key])
    const reasons: string[] = []
    const relevant = pairs.filter(
      (pair) => pair.keys.includes(key) && pair.keys.some((k) => k !== key && ownKeys.has(k)),
    )
    // Average already-shrunk residuals. Three overlapping associations are not
    // three independent gains and therefore cannot be summed into a winrate.
    const effects = relevant.map(pairEffect)
    let synergyAdjustment = effects.length
      ? effects.reduce((sum, n) => sum + n, 0) / effects.length
      : 0
    if (relevant.length && synergyAdjustment > 0.2) {
      const best = [...relevant].sort((a, b) => pairEffect(b) - pairEffect(a))[0]
      reasons.push(
        `与已选的${entities.get(best.keys.find((k) => k !== key)!)?.displayName ?? '技能'}有历史搭配优势${count(best.numPicks) ? '' : '（样本量未知，小幅参考）'}`,
      )
    } else if (synergyAdjustment < -0.2) reasons.push('与现有配置的历史搭配表现偏弱')
    const tags =
      entity.kind === 'ability'
        ? (TAGS[entity.name]?.tags ?? [])
        : (MODELS[entity.name]?.tags ?? [])
    const roleFits = positions.map((position) => {
      const target =
        position <= 2
          ? ['farm_tool', 'steroid', 'rc_talents', 'innate_offense']
          : position >= 4
            ? ['hard_cc', 'save_ally', 'team_aura', 'utility_talents', 'innate_team']
            : ['hard_cc', 'initiation', 'sustain_self', 'tank_talents', 'innate_tank']
      const positive = target.some((t) => tags.includes(t)) ? 1.5 : 0
      const negative =
        position >= 4 && tags.includes('farm_tool') && !tags.includes('save_ally') ? -0.5 : 0
      return positive + negative
    })
    const roleAdjustment = clamp(roleFits.length ? Math.max(...roleFits) : 0, -2, 2)
    if (roleAdjustment > 0) reasons.push(`适合所选${positions.join('／')}号位的功能需求`)
    if (roleAdjustment < 0) reasons.push('偏依赖发育，辅助位置适配略低')
    if (ownKeys.size && entity.kind === 'ability') {
      if (tags.includes('hard_cc') && !ownTags.includes('hard_cc')) {
        synergyAdjustment += 1
        reasons.push('补足当前配置的硬控制')
      }
      if (tags.includes('mana_hungry') && ownTags.filter((t) => t === 'mana_hungry').length >= 2) {
        synergyAdjustment -= 2
        reasons.push('现有技能已较耗蓝，增加资源压力')
      }
      if (tags.includes('skill_point_sink') && ownTags.includes('skill_point_sink')) {
        synergyAdjustment -= 1.5
        reasons.push('与已有技能争夺技能点')
      }
    }
    if (entity.kind === 'ability' && ownModel && incompatible(entity.name, ownModel)) {
      synergyAdjustment -= 25
      reasons.push('与当前模型的攻击类型冲突')
    }
    if (
      entity.kind === 'hero' &&
      [...ownKeys].some((k) => k.startsWith('ability:') && incompatible(k.slice(8), entity.name))
    ) {
      synergyAdjustment -= 25
      reasons.push('此模型的攻击类型与已有技能冲突')
    }
    const requirements = entity.kind === 'ability' ? (TAGS[entity.name]?.requires ?? []) : []
    if (
      requirements.length &&
      !requirements.some((r) =>
        r.startsWith('model:')
          ? ownModel === r.slice(6)
          : r.startsWith('tag:')
            ? ownTags.includes(r.slice(4))
            : ownKeys.has(`ability:${r}`),
      )
    ) {
      synergyAdjustment -= 15
      reasons.push('关键前置条件尚未满足，当前不宜优先选')
    }
    const choice: DraftChoice = {
      key,
      kind: entity.kind,
      name: entity.name,
      displayName: entity.displayName,
      heroOrder: entity.heroOrder,
      rank: 0,
      baseScore: foundational.score,
      synergyAdjustment,
      roleAdjustment,
      urgencyAdjustment: 0,
      selfScore: clamp(foundational.score + synergyAdjustment + roleAdjustment, 0, 100),
      reasons,
      confidence: foundational.known ? 'known' : 'limited',
      denyThreatIds: [],
    }
    reasons.push(foundational.reason)
    result.choices.push(choice)
  }
  // Scarcity is a bounded action-timing adjustment. Never turn an average pick
  // position into a survival probability, and compare substitutes of the SAME slot.
  if (result.waitPicks !== null && result.waitPicks > 0 && laterOwn !== undefined) {
    const snapshot = new Map(result.choices.map((c) => [c.key, c.selfScore]))
    for (const choice of result.choices) {
      const entity = entities.get(choice.key)!
      const pick = entity.stat.pickRate
      if (typeof pick !== 'number' || !Number.isFinite(pick) || pick <= 0 || pick > laterOwn + 1)
        continue
      const alternatives = result.choices.filter(
        (c) =>
          c.key !== choice.key &&
          c.kind === choice.kind &&
          entities.get(c.key)!.ultimate === entity.ultimate,
      )
      const bestAlternative = alternatives.length
        ? Math.max(...alternatives.map((c) => snapshot.get(c.key)!))
        : snapshot.get(choice.key)! - 2
      const gap = clamp(snapshot.get(choice.key)! - bestAlternative, 0, 4)
      choice.urgencyAdjustment = clamp(gap * 0.15 * (result.waitPicks / 18), 0, 0.6)
      choice.selfScore = clamp(choice.selfScore + choice.urgencyAdjustment, 0, 100)
      if (choice.urgencyAdjustment > 0.1)
        choice.reasons.push(`下手前还有${result.waitPicks}次选取，同类替代较弱，宜及时拿取`)
    }
  }
  const choiceMap = new Map(result.choices.map((c) => [c.key, c]))
  for (const pair of pairs) {
    if (pair.synergyWinrate < 0.5 || (pair.synergyIncrease ?? 0) < 0) continue
    const availableKeys = pair.keys.filter((key) => available.has(key))
    if (availableKeys.length === 0) continue
    const names = pair.keys.map(
      (key) => entities.get(key)?.displayName ?? label(key.slice(key.indexOf(':') + 1)),
    )
    const evidence = credible(pair) ? 'known' : 'limited'
    if (availableKeys.length === 2) {
      const first = entities.get(availableKeys[0])!,
        second = entities.get(availableKeys[1])!
      if (first.ultimate && second.ultimate) continue
      result.threats.push({
        key: `potential:${pair.id}`,
        kind: 'potential',
        names,
        candidateKeys: availableKeys.filter((k) => choiceMap.has(k)),
        ownedNames: [],
        missingNames: names,
        synergyWinrate: pair.synergyWinrate,
        numPicks: pair.numPicks ?? null,
        evidence,
        imminent: false,
        actionable: false,
        reason: '两件均未选，需拿齐才形成组合',
      })
      continue
    }
    const remaining = availableKeys[0],
      held = pair.keys.find((key) => key !== remaining)!
    for (const [index, set] of owned) {
      if (!set.has(held) || !legal(entities.get(remaining)!, index)) continue
      const kind: DraftThreat['kind'] =
        spot === null
          ? 'potential'
          : index === spot
            ? 'own'
            : Math.floor(index / 5) === Math.floor(spot / 5)
              ? 'ally'
              : 'enemy'
      const soon = kind === 'enemy' && imminent(index)
      const actionable =
        kind === 'enemy' && soon && evidence === 'known' && choiceMap.has(remaining)
      const row: DraftThreat = {
        key: `${kind}:${index}:${pair.id}`,
        kind,
        names,
        candidateKeys: choiceMap.has(remaining) ? [remaining] : [],
        ownedNames: [entities.get(held)?.displayName ?? names[pair.keys.indexOf(held)]],
        missingNames: [entities.get(remaining)!.displayName],
        ownerPlayerIndex: index,
        synergyWinrate: pair.synergyWinrate,
        numPicks: pair.numPicks ?? null,
        evidence,
        imminent: soon,
        actionable,
        reason:
          kind === 'enemy'
            ? soon
              ? '敌方已持一件，下手前有机会补齐'
              : '敌方已持一件，尚未确认迫近的补齐窗口'
            : kind === 'own'
              ? '可补全自己的已有组合'
              : kind === 'ally'
                ? '队友已持一件，可留意配合'
                : '席位未知，暂不判断敌我',
      }
      if (evidence === 'limited') row.reason += '；证据有限，仅作提示'
      result.threats.push(row)
      if (actionable) choiceMap.get(remaining)!.denyThreatIds.push(row.key)
    }
  }
  const threatPriority = (t: DraftThreat): number =>
    t.kind === 'enemy' ? (t.actionable ? 0 : 1) : t.kind === 'own' ? 2 : t.kind === 'ally' ? 3 : 4
  result.threats.sort(
    (a, b) =>
      threatPriority(a) - threatPriority(b) ||
      b.synergyWinrate - a.synergyWinrate ||
      a.key.localeCompare(b.key),
  )
  result.choices.sort(sorted)
  const top = result.choices[0]?.selfScore
  // Only the top-anchored near-optimal set may yield its first place to denial.
  // No fuzzy pairwise comparator (which would be non-transitive).
  if (top !== undefined) {
    const near = result.choices.filter((c) => top - c.selfScore <= NEAR_OPTIMAL_POINTS)
    const rest = result.choices.filter((c) => top - c.selfScore > NEAR_OPTIMAL_POINTS)
    near.sort(
      (a, b) =>
        Number(b.denyThreatIds.length > 0) - Number(a.denyThreatIds.length > 0) || sorted(a, b),
    )
    result.choices = [...near, ...rest]
    if (near[0]?.denyThreatIds.length)
      near[0].reasons.unshift('自身收益接近最优，同时阻断敌方即将补齐的强组合')
  }
  // At a verified consecutive turn there are no intervening opponents. Compare
  // legal two-pick plans without inventing survival probabilities. Only a
  // sufficiently sampled pair may change the order; its residual is counted once.
  if (result.waitPicks === 0 && completed === nextOwn) {
    let independent = -Infinity
    let joint = -Infinity
    let plan: [DraftChoice, DraftChoice] | undefined
    let planHasEvidence = false
    for (let i = 0; i < result.choices.length; i++)
      for (let j = i + 1; j < result.choices.length; j++) {
        const a = result.choices[i],
          b = result.choices[j]
        if (
          !legal(entities.get(a.key)!, spot, entities.get(b.key)!) ||
          !legal(entities.get(b.key)!, spot, entities.get(a.key)!)
        )
          continue
        const sum = a.selfScore + b.selfScore
        independent = Math.max(independent, sum)
        const pair = pairMap.get([a.key, b.key].sort().join('|'))
        const known = pair !== undefined && credible(pair)
        const score = sum + (known ? pairEffect(pair!) : 0)
        if (score > joint) {
          joint = score
          plan = [a, b]
          planHasEvidence = known
        }
      }
    if (plan && planHasEvidence && joint > independent + 0.5) {
      plan.sort(sorted)
      const [first, second] = plan
      first.followUp = { key: second.key, name: second.name, displayName: second.displayName }
      first.reasons.unshift(
        `本轮可连选：先拿${first.displayName}，再拿${second.displayName}，联合搭配更合适`,
      )
      second.reasons.unshift(`连选搭配的第二件，与${first.displayName}配合`)
      result.choices = [first, second, ...result.choices.filter((c) => c !== first && c !== second)]
    }
  }
  result.choices.forEach((choice, index) => {
    choice.rank = index + 1
  })
  result.best = result.choices[0]
  result.notes.push('分数是推荐指数，不是这套配置的预测胜率；未知样本不触发强制截胡')
  return result
}
