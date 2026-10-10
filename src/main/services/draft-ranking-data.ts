import type { DatabaseService } from './database-service'
import type { DraftSessionSlice } from '../store/draft-store'
import type { DraftRankingData } from '@shared/types'
import { readRankingEvidence, rankingPairKey } from '@core/database/ranking-evidence'
import { assignDraftTurns } from '@core/domain/pick-attribution'
import { buildTurnSchedule } from '@core/gsi/draft-clock'
import { LATE_PICK_GRACE_S, PICK_SEEN_EARLY_TOLERANCE_S } from '@shared/constants/thresholds'
export { captureRankingEvidence, RANKING_EVIDENCE_KEY } from '@core/database/ranking-evidence'

export type RankingDraftState = Partial<
  Pick<
    DraftSessionSlice,
    | 'initialPoolAbilitiesCache'
    | 'selectedAbilitiesCache'
    | 'identifiedHeroModelsCache'
    | 'modelAssignments'
    | 'draftTimeline'
    | 'mySelectedSpotHeroOrder'
    | 'mySelectedModelHeroOrder'
  >
>
export interface RankingDataRequest {
  names?: unknown
  heroNames?: unknown
}
type RankingDatabase = Pick<DatabaseService, 'abilities' | 'heroes' | 'synergies' | 'metadata'>

function namesFrom(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value
        .filter(
          (name): name is string =>
            typeof name === 'string' && name.length > 0 && name.length <= 160,
        )
        .slice(0, limit)
    : []
}

function playerIndex(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 10
}

function assignedModels(state: RankingDraftState): { playerIndex: number; heroName: string }[] {
  const pool = new Map(
    state.identifiedHeroModelsCache?.map((model) => [model.heroOrder, model.heroName]),
  )
  const assignments = [...(state.modelAssignments ?? [])]
  if (
    playerIndex(state.mySelectedSpotHeroOrder) &&
    state.mySelectedModelHeroOrder != null &&
    !assignments.some((assignment) => assignment.playerIndex === state.mySelectedSpotHeroOrder)
  ) {
    assignments.push({
      playerIndex: state.mySelectedSpotHeroOrder,
      poolHeroOrder: state.mySelectedModelHeroOrder,
    })
  }
  const candidates = [
    ...new Map(
      assignments
        .filter(
          (assignment) => playerIndex(assignment.playerIndex) && pool.get(assignment.poolHeroOrder),
        )
        .map((assignment) => [`${assignment.playerIndex}:${assignment.poolHeroOrder}`, assignment]),
    ).values(),
  ]
  // Conflicting reads are unknown; guessing an owner would invent an enemy threat.
  return candidates
    .filter(
      (assignment) =>
        candidates.filter((other) => other.playerIndex === assignment.playerIndex).length === 1 &&
        candidates.filter((other) => other.poolHeroOrder === assignment.poolHeroOrder).length === 1,
    )
    .map((assignment) => ({
      playerIndex: assignment.playerIndex,
      heroName: pool.get(assignment.poolHeroOrder)!,
    }))
}

function completedPickCount(
  state: RankingDraftState,
  models: { playerIndex: number; heroName: string }[],
): number | null {
  const timeline = state.draftTimeline ?? []
  if (
    timeline.length === 0 ||
    timeline.some(
      (event) =>
        event.vacated ||
        !playerIndex(event.playerIndex) ||
        typeof event.seenAtS !== 'number' ||
        !Number.isFinite(event.seenAtS),
    )
  )
    return null
  const observed = new Set(
    (state.selectedAbilitiesCache ?? [])
      .filter((slot) => slot.name)
      .map((slot) => `ability:${slot.hero_order}:${slot.name}`),
  )
  const pool = new Map(
    state.identifiedHeroModelsCache?.map((model) => [model.heroOrder, model.heroName]),
  )
  for (const model of models) observed.add(`model:${model.playerIndex}:${model.heroName}`)
  const recorded = new Set<string>()
  for (const event of timeline) {
    const name = event.kind === 'ability' ? event.abilityName : pool.get(event.poolHeroOrder!)
    if (!name) return null
    recorded.add(`${event.kind === 'ability' ? 'ability' : 'model'}:${event.playerIndex}:${name}`)
  }
  if (
    recorded.size !== timeline.length ||
    recorded.size !== observed.size ||
    [...recorded].some((key) => !observed.has(key))
  )
    return null
  const schedule = buildTurnSchedule()
  const turns = assignDraftTurns(timeline, schedule)
  if ([...turns].sort((a, b) => (a ?? 99) - (b ?? 99)).some((turn, index) => turn !== index))
    return null
  if (
    timeline.some((event, index) => {
      const turn = schedule[turns[index]!]
      return (
        event.seenAtS! < turn.startS - PICK_SEEN_EARLY_TOLERANCE_S ||
        event.seenAtS! > turn.endS + LATE_PICK_GRACE_S
      )
    })
  )
    return null
  // A late scan can have a complete old prefix while newer turns were missed.
  const latestSeen = Math.max(...timeline.map((event) => event.seenAtS!))
  if (schedule[timeline.length + 1]?.startS <= latestSeen) return null
  return timeline.length
}

/** Standalone provider: only uses APIs already shipped in the installed 3.2.0 service. */
export function getDraftRankingData(
  db: RankingDatabase,
  request: RankingDataRequest = {},
  state: RankingDraftState = {},
): DraftRankingData {
  const abilities = db.abilities.getAll(),
    heroes = db.heroes.getAll()
  const validAbilityNames = new Set(abilities.map((ability) => ability.name))
  const validHeroNames = new Set(heroes.map((hero) => hero.name))
  const names = [
    ...new Set(
      [
        ...namesFrom(request?.names, 64),
        ...(state.initialPoolAbilitiesCache?.ultimates ?? []).map((slot) => slot.name),
        ...(state.initialPoolAbilitiesCache?.standard ?? []).map((slot) => slot.name),
        ...(state.selectedAbilitiesCache ?? []).map((slot) => slot.name),
      ].filter((name): name is string => typeof name === 'string' && validAbilityNames.has(name)),
    ),
  ]
  const models = assignedModels(state)
  const heroNames = [
    ...new Set(
      [
        ...namesFrom(request?.heroNames, 24),
        ...(state.identifiedHeroModelsCache ?? []).map((model) => model.heroName),
        ...models.map((model) => model.heroName),
      ].filter((name) => validHeroNames.has(name)),
    ),
  ]
  const evidence = readRankingEvidence(db.metadata)
  const pairCount = (first: string, second: string, rate: number): number | null => {
    const entry = evidence?.pairs[rankingPairKey(first, second)]
    return entry?.winrate === rate ? entry.numPicks : null
  }
  const sampleCounts: NonNullable<DraftRankingData['sampleCounts']> = {}
  for (const [kind, rows] of [
    ['ability', abilities],
    ['hero', heroes],
  ] as const) {
    for (const row of rows) {
      const key = `${kind}:${row.name}`,
        entry = evidence?.samples[key]
      sampleCounts[key] = {
        numPicks: entry?.winrate === row.winrate ? entry.numPicks : null,
        highSkillNumPicks:
          entry?.highSkillWinrate === row.highSkillWinrate ? entry.highSkillNumPicks : null,
      }
    }
  }
  const settings = db.metadata.getSettings()
  return {
    abilities,
    heroes,
    sampleCounts,
    pairs: db.synergies
      .getSynergiesAmong(names)
      .map((pair) => ({
        ...pair,
        numPicks: pairCount(
          `ability:${pair.ability1Name}`,
          `ability:${pair.ability2Name}`,
          pair.synergyWinrate,
        ),
      })),
    heroPairs: db.synergies
      .getHeroSynergiesAmong(heroNames, names)
      .map((pair) => ({
        ...pair,
        numPicks: pairCount(
          `hero:${pair.heroName}`,
          `ability:${pair.abilityName}`,
          pair.synergyWinrate,
        ),
      })),
    ...(evidence
      ? { evidence: { sourceDate: evidence.sourceDate, patches: evidence.patches } }
      : {}),
    context: {
      currentPick: completedPickCount(state, models),
      modelAssignments: models,
      roleMode: settings.roleMode,
      rolePositions:
        settings.roleMode === 'fixed'
          ? settings.roleFixedPositions.filter(
              (position) => Number.isInteger(position) && position >= 1 && position <= 5,
            )
          : [],
    },
  }
}
