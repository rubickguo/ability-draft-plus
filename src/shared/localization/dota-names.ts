import official from './dota-zh-CN.json'

const names: Readonly<Record<string, string>> = official.names
const aliases: Readonly<Record<string, string>> = official.aliases
const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '')
const normalizedAliases = new Map(
  Object.entries(aliases).map(([key, value]) => [normalize(key), value]),
)

export function localizeDotaName(name: string | null, display: string, language: string): string {
  if (!language.toLowerCase().startsWith('zh')) return display
  const key = name?.replace(/^npc_dota_hero_/, '')
  return (
    (key && names[key]) ||
    aliases[display.toLowerCase()] ||
    normalizedAliases.get(normalize(display)) ||
    display
  )
}

/** Translate display fields only. IDs, player names, URLs and OCR keys stay intact. */
export function localizeDisplayData<T>(data: T, language: string): T {
  if (!language.toLowerCase().startsWith('zh') || data == null) return data
  const visit = (value: unknown, field = ''): unknown => {
    if (typeof value === 'string') {
      return /displayname$/i.test(field) ||
        ['shardStackWith', 'scepterStackWith', 'pointSinkConflictWith'].includes(field)
        ? localizeDotaName(null, value, language)
        : value
    }
    if (Array.isArray(value)) return value.map((entry) => visit(entry, field))
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      return Object.fromEntries(
        Object.entries(record).map(([key, entry]) => {
          const identifier =
            key === 'displayName'
              ? record.name
              : key === 'heroDisplayName'
                ? record.heroName
                : key === 'ability1DisplayName'
                  ? record.ability1Name
                  : key === 'ability2DisplayName'
                    ? record.ability2Name
                    : null
          return [
            key,
            typeof entry === 'string' && /displayname$/i.test(key)
              ? localizeDotaName(
                  typeof identifier === 'string' ? identifier : null,
                  entry,
                  language,
                )
              : visit(entry, key),
          ]
        }),
      )
    }
    return value
  }
  return visit(data) as T
}
