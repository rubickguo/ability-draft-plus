import { describe, expect, it } from 'vitest'
import { localizeDotaName, localizeDisplayData } from '@shared/localization/dota-names'

describe('official Dota Simplified Chinese names', () => {
  it('uses Valve names for skills, models and English display aliases', () => {
    expect(localizeDotaName('magnataur_empower', 'Empower', 'zh-CN')).toBe('授予力量')
    expect(localizeDotaName('slark', 'Slark', 'zh-CN')).toBe('斯拉克')
    expect(localizeDotaName(null, 'Dragon Tail', 'zh-CN')).toBe('神龙摆尾')
    expect(localizeDotaName(null, 'Dragon Knight', 'zh-CN')).toBe('龙骑士')
    expect(localizeDotaName(null, 'Haunt', 'zh-CN')).toBe('鬼影重重')
  })
  it('translates nested combo displays without corrupting IDs, player names or other languages', () => {
    const input = {
      name: 'slark',
      playerName: 'Slark',
      heroDisplayName: 'Slark',
      combo: { ability1DisplayName: 'Empower' },
      shardStackWith: ['Empower'],
    }
    const translated = localizeDisplayData(input, 'zh-CN')
    expect(translated.heroDisplayName).toBe('斯拉克')
    expect(translated.combo.ability1DisplayName).toBe('授予力量')
    expect(translated.shardStackWith).toEqual(['授予力量'])
    expect(translated.name).toBe('slark')
    expect(translated.playerName).toBe('Slark')
    expect(input.heroDisplayName).toBe('Slark')
    expect(localizeDisplayData(input, 'en')).toBe(input)
  })
})
