import { availableNames, recommendationScore } from './ranking'
import type { OverlayDataPayload } from '@shared/types'
export interface ComboGroup {
  label: string
  key: string
  winrate: number
  names: string[]
}
export interface IconGuidance {
  kind?: 'ability' | 'model'
  fallback?: boolean
  score?: number
  highSkillWinrate?: number
  rank?: number
  groups: ComboGroup[]
}
export interface DraftBadges {
  abilities: Map<string, IconGuidance>
  models: Map<number, IconGuidance>
  groups: ComboGroup[]
}

function letters(index: number): string {
  let value = index + 1,
    label = ''
  while (value > 0) {
    value--
    label = String.fromCharCode(65 + (value % 26)) + label
    value = Math.floor(value / 26)
  }
  return label
}
function rank<T>(
  items: T[],
  stat: (item: T) => {
    highSkillWinrate?: number | null
    winrate?: number | null
    pickRate?: number | null
  },
  key: (item: T) => string,
  apply: (item: T, n: number, score: NonNullable<ReturnType<typeof recommendationScore>>) => void,
): void {
  items
    .map((item) => ({ item, score: recommendationScore(stat(item)) }))
    .filter((row) => row.score !== null)
    .sort((a, b) => b.score!.score - a.score!.score || key(a.item).localeCompare(key(b.item)))
    .forEach((row, i) => apply(row.item, i + 1, row.score!))
}
export function buildDraftBadges(data: OverlayDataPayload): DraftBadges {
  const result: DraftBadges = { abilities: new Map(), models: new Map(), groups: [] }
  if (!data.scanData) return result
  const available = new Set(availableNames(data))
  const pool = [
    ...new Map(
      [...data.scanData.ultimates, ...data.scanData.standard]
        .filter((s) => s.name && available.has(s.name))
        .map((s) => [s.name, s]),
    ).values(),
  ]
  const abilityStats = new Map(data.rankingData?.abilities.map((a) => [a.name, a]) ?? [])
  const modelStats = new Map(data.rankingData?.heroes.map((h) => [h.name, h]) ?? [])
  const own = data.scanData.selectedAbilities.filter(
    (s) => s.name && !s.isUnknown && s.hero_order === data.selectedSpotHeroOrder,
  )
  const eligible = [...pool, ...own]
  for (const slot of eligible) result.abilities.set(slot.name!, { groups: [], kind: 'ability' })
  const models = data.heroModels.filter(
    (m) => !m.isPicked || m.heroOrder === data.selectedModelHeroOrder,
  )
  for (const model of models) result.models.set(model.heroOrder, { groups: [], kind: 'model' })
  const choices = [
    ...pool.map((slot) => ({
      key: 'ability:' + slot.name,
      stat: abilityStats.get(slot.name!) ?? slot,
      guidance: result.abilities.get(slot.name!)!,
    })),
    ...models
      .filter((model) => !model.isPicked)
      .map((model) => ({
        key: 'model:' + model.heroName,
        stat: modelStats.get(model.heroName) ?? model,
        guidance: result.models.get(model.heroOrder)!,
      })),
  ]
  rank(
    choices,
    (choice) => choice.stat,
    (choice) => choice.key,
    (choice, n, value) => {
      Object.assign(choice.guidance, {
        rank: n,
        score: value.score,
        fallback: value.fallback,
        highSkillWinrate: value.winrate,
      })
    },
  )

  const findSkill = (internal: string | undefined, display: string) =>
    eligible.find((s) => (internal ? s.name === internal : s.displayName === display))
  const candidates = [
    ...data.opCombinations.map((combo) => ({
      key:
        'skills:' +
        [
          combo.ability1Name ?? combo.ability1DisplayName,
          combo.ability2Name ?? combo.ability2DisplayName,
        ]
          .sort()
          .join('|'),
      names: [combo.ability1DisplayName, combo.ability2DisplayName],
      winrate: combo.synergyWinrate,
      skills: [
        findSkill(combo.ability1Name, combo.ability1DisplayName),
        findSkill(combo.ability2Name, combo.ability2DisplayName),
      ],
      model: undefined as (typeof models)[number] | undefined,
    })),
    ...data.heroSynergies.map((combo) => ({
      key: 'model:' + combo.heroDisplayName + '|' + combo.abilityDisplayName,
      names: [combo.heroDisplayName, combo.abilityDisplayName],
      winrate: combo.synergyWinrate,
      skills: [findSkill(undefined, combo.abilityDisplayName)],
      model: models.find((m) => m.heroDisplayName === combo.heroDisplayName),
    })),
  ].sort((a, b) => b.winrate - a.winrate || a.key.localeCompare(b.key))
  const seen = new Set<string>()
  candidates.forEach((candidate, index) => {
    if (seen.has(candidate.key) || candidate.skills.some((s) => !s)) return
    if (candidate.key.startsWith('model:') && !candidate.model) return
    seen.add(candidate.key)
    const group = {
      label: letters(index),
      key: candidate.key,
      names: candidate.names,
      winrate: candidate.winrate,
    }
    result.groups.push(group)
    for (const slot of candidate.skills) result.abilities.get(slot!.name!)!.groups.push(group)
    if (candidate.model) result.models.get(candidate.model.heroOrder)!.groups.push(group)
  })
  return result
}
