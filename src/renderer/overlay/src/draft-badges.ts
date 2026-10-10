import { recommendDraft } from '../../../core/domain/contextual-ranking'
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
  selfScore?: number
  reasons?: string[]
  highSkillWinrate?: number
  rank?: number
  groups: ComboGroup[]
}
export interface DraftBadges {
  abilities: Map<string, IconGuidance>
  models: Map<number, IconGuidance>
  groups: ComboGroup[]
}

/** Presentation only: never calculate another ranking in the badge layer. */
export function buildDraftBadges(
  data: OverlayDataPayload,
  recommendation = recommendDraft(data),
): DraftBadges {
  const result: DraftBadges = { abilities: new Map(), models: new Map(), groups: [] }
  if (!data.scanData) return result
  const slots = [
    ...data.scanData.ultimates,
    ...data.scanData.standard,
    ...data.scanData.selectedAbilities,
  ]
  for (const slot of slots)
    if (slot.name) result.abilities.set(slot.name, { kind: 'ability', groups: [] })
  for (const model of data.heroModels)
    result.models.set(model.heroOrder, { kind: 'model', groups: [] })
  for (const choice of recommendation.choices) {
    const guidance =
      choice.kind === 'ability'
        ? result.abilities.get(choice.name)
        : result.models.get(choice.heroOrder!)
    if (guidance)
      Object.assign(guidance, {
        rank: choice.rank,
        score: choice.selfScore / 100,
        selfScore: choice.selfScore,
        reasons: choice.reasons,
        fallback: choice.confidence === 'limited',
      })
  }
  // Keep shared letters useful and sparse: only two routes involving the first choice.
  const related = recommendation.threats
    .filter(
      (threat) => recommendation.best && threat.candidateKeys.includes(recommendation.best.key),
    )
    .slice(0, 2)
  related.forEach((threat, index) => {
    const group = {
      key: threat.key,
      label: String.fromCharCode(65 + index),
      names: threat.names,
      winrate: threat.synergyWinrate,
    }
    result.groups.push(group)
    for (const slot of slots) {
      if (slot.name && threat.names.includes(slot.displayName))
        result.abilities.get(slot.name)?.groups.push(group)
    }
    for (const model of data.heroModels) {
      if (threat.names.includes(model.heroDisplayName))
        result.models.get(model.heroOrder)?.groups.push(group)
    }
  })
  return result
}
