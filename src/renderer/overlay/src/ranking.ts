import type { OverlayDataPayload } from '@shared/types'

export function recommendationScore(stat: {
  highSkillWinrate?: number | null
  winrate?: number | null
  pickRate?: number | null
}): { score: number; fallback: boolean; winrate: number } | null {
  const valid = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1
  const hs = valid(stat.highSkillWinrate)
  const wr = hs ? stat.highSkillWinrate! : stat.winrate
  if (
    !valid(wr) ||
    typeof stat.pickRate !== 'number' ||
    !Number.isFinite(stat.pickRate) ||
    stat.pickRate <= 0
  )
    return null
  return {
    score: 0.6 * wr + 0.4 * ((50 - Math.max(1, Math.min(50, stat.pickRate))) / 49),
    fallback: !hs,
    winrate: wr,
  }
}

export function availableNames(data: OverlayDataPayload): string[] {
  if (!data.scanData) return []
  const picked = new Set(data.scanData.selectedAbilities.map((s) => s.name).filter(Boolean))
  return [
    ...new Set(
      [...data.scanData.ultimates, ...data.scanData.standard]
        .filter((s) => s.name && !s.isUnknown && !picked.has(s.name))
        .map((s) => s.name!),
    ),
  ]
}

export function topPoolPairs(
  data: OverlayDataPayload,
): { key: string; names: string[]; synergyWinrate: number }[] {
  if (!data.scanData || !data.rankingData) return []
  const available = new Set(availableNames(data))
  const names = new Map(
    [...data.scanData.ultimates, ...data.scanData.standard].map((s) => [s.name, s.displayName]),
  )
  const unique = new Map<string, { key: string; names: string[]; synergyWinrate: number }>()
  for (const pair of data.rankingData.pairs) {
    if (
      !available.has(pair.ability1Name) ||
      !available.has(pair.ability2Name) ||
      pair.ability1Name === pair.ability2Name ||
      !Number.isFinite(pair.synergyWinrate)
    )
      continue
    const key = [pair.ability1Name, pair.ability2Name].sort().join('|')
    const row = {
      key,
      names: [names.get(pair.ability1Name)!, names.get(pair.ability2Name)!],
      synergyWinrate: pair.synergyWinrate,
    }
    if (!unique.has(key) || unique.get(key)!.synergyWinrate < row.synergyWinrate)
      unique.set(key, row)
  }
  return [...unique.values()]
    .sort((a, b) => b.synergyWinrate - a.synergyWinrate || a.key.localeCompare(b.key))
    .slice(0, 10)
}
