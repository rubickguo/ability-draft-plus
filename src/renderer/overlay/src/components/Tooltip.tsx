import type { TFunction } from 'i18next'
import { useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  EnrichedScanSlot,
  HeroModelDisplay,
  SynergyPairDisplay,
  HeroSynergyDisplay,
} from '@shared/types'
import type { IconGuidance } from '../draft-badges'

export type TooltipData =
  | { type: 'ability'; slot: EnrichedScanSlot }
  | { type: 'hero'; model: HeroModelDisplay }

interface TooltipProps {
  guidance?: IconGuidance
  data: TooltipData | null
  anchorRect: DOMRect | null
}

const MARGIN = 10
const MAX_SYNERGIES = 5

// Coerced defensively — v1-era databases can hold text-typed numerics (#77)
function formatWinrate(value: number | null): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (value == null || Number.isNaN(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function formatPickRate(value: number | null): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (value == null || Number.isNaN(n)) return '—'
  return n.toFixed(2)
}

function formatSynergyWr(wr: number): string {
  const n = typeof wr === 'number' ? wr : Number(wr)
  if (Number.isNaN(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function positionTooltip(el: HTMLDivElement, anchorRect: DOMRect): void {
  const tooltipWidth = el.offsetWidth
  const tooltipHeight = el.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Prefer left of anchor
  let x = anchorRect.left - tooltipWidth - MARGIN
  if (x < MARGIN) {
    // Try right of anchor
    x = anchorRect.right + MARGIN
    if (x + tooltipWidth > vw - MARGIN) {
      x = vw - tooltipWidth - MARGIN
    }
  }
  if (x < MARGIN) x = MARGIN

  // Y starts at anchor top, clamped to viewport
  let y = anchorRect.top
  if (y + tooltipHeight > vh - MARGIN) {
    y = vh - tooltipHeight - MARGIN
  }
  if (y < MARGIN) y = MARGIN

  el.style.left = `${x}px`
  el.style.top = `${y}px`
}

export function Tooltip({ data, anchorRect, guidance }: TooltipProps): React.ReactElement | null {
  const { t } = useTranslation('overlay')
  const prevAnchorRef = useRef<DOMRect | null>(null)

  // Use callback ref to position immediately when DOM mounts/updates
  const tooltipCallbackRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el && anchorRect) {
        positionTooltip(el, anchorRect)
        prevAnchorRef.current = anchorRect
      }
    },
    [anchorRect],
  )

  if (!data) return null

  return (
    <div
      ref={tooltipCallbackRef}
      className="overlay-tooltip"
      role="tooltip"
      id="overlay-tooltip"
      style={{ left: -9999, top: -9999 }}
    >
      {guidance?.rank != null && (
        <div className="tooltip-recommendation">
          <div className="tooltip-recommendation-rank">当前推荐 #{guidance.rank}</div>
          {guidance.selfScore != null && (
            <div className="tooltip-stat">
              自身适配指数：{guidance.selfScore.toFixed(1)}（不是胜率）
            </div>
          )}
          {guidance.reasons?.map((reason) => (
            <div className="tooltip-recommendation-reason" key={reason}>
              {reason}
            </div>
          ))}
          {guidance.fallback && <div className="tooltip-stat">部分数据不足，按保守权重计算</div>}
        </div>
      )}
      {data.type === 'ability' ? (
        <AbilityTooltipContent slot={data.slot} t={t} />
      ) : (
        <HeroTooltipContent model={data.model} t={t} />
      )}
      {!!guidance?.groups.length && (
        <div className="tooltip-section-title">{t('badges.combinations')}</div>
      )}
      {guidance?.groups.map((group) => (
        <div className="tooltip-combo" key={group.key}>
          <span className="draft-combo-badge draft-combo-inline">{group.label}</span>
          {group.names.join(' + ')} · {(group.winrate * 100).toFixed(1)}%
        </div>
      ))}
    </div>
  )
}

function AbilityTooltipContent({
  slot,
  t,
}: {
  slot: EnrichedScanSlot
  t: TFunction<'overlay'>
}): React.ReactElement {
  if (slot.isUnknown) {
    return (
      <>
        <div className="tooltip-title">{t('tooltip.unknownAbility')}</div>
        <div className="tooltip-stat">{t('tooltip.unknownHint')}</div>
      </>
    )
  }

  return (
    <>
      <div className="tooltip-title">{slot.displayName}</div>
      <div className="tooltip-stat">
        {t('tooltip.winrate', { value: formatWinrate(slot.winrate) })}
      </div>
      <div className="tooltip-stat">
        {t('tooltip.pickRate', { value: formatPickRate(slot.pickRate) })}
      </div>
      {slot.personalGames != null && slot.personalWinrate != null && (
        <div className="tooltip-stat tooltip-personal">
          {t('tooltip.personalStats', {
            value: formatWinrate(slot.personalWinrate),
            games: String(slot.personalGames),
          })}
        </div>
      )}
      {slot.inertOnModel && (
        <div className="tooltip-stat tooltip-inert">{t('tooltip.inertOnModel')}</div>
      )}
      {slot.unmetRequirement && (
        <div className="tooltip-stat tooltip-inert">
          {t(
            slot.unmetRequirement.kind === 'model'
              ? 'tooltip.requiresModel'
              : slot.unmetRequirement.kind === 'tag'
                ? 'tooltip.requiresTag'
                : 'tooltip.requiresAbility',
            { name: slot.unmetRequirement.displayName },
          )}
        </div>
      )}
      {/* Round-4 tag verdicts: Aghanim's stacking (own picks) beats the
          generic always-on marker note; the point-sink conflict is a warning */}
      {slot.shardStackWith ? (
        <div className="tooltip-stat tooltip-aghs">
          {t('tooltip.shardStack', { names: slot.shardStackWith.join(', ') })}
        </div>
      ) : (
        slot.goodShard && <div className="tooltip-stat tooltip-aghs">{t('tooltip.goodShard')}</div>
      )}
      {slot.scepterStackWith ? (
        <div className="tooltip-stat tooltip-aghs">
          {t('tooltip.scepterStack', { names: slot.scepterStackWith.join(', ') })}
        </div>
      ) : (
        slot.goodScepter && (
          <div className="tooltip-stat tooltip-aghs">{t('tooltip.goodScepter')}</div>
        )
      )}
      {slot.pointSinkConflictWith && (
        <div className="tooltip-stat tooltip-inert">
          {t('tooltip.pointSinkConflict', { names: slot.pointSinkConflictWith.join(', ') })}
        </div>
      )}
      <SynergySection
        title={t('tooltip.strongSynergies')}
        items={slot.highWinrateCombinations}
        renderItem={renderAbilitySynergy}
      />
      <HeroSynergySection
        title={t('tooltip.heroSynergies')}
        items={slot.strongHeroSynergies}
        displayField="heroDisplayName"
      />
      <SynergySection
        title={t('tooltip.weakSynergies')}
        items={slot.lowWinrateCombinations}
        renderItem={renderWeakAbilitySynergy}
      />
      <HeroSynergySection
        title={t('tooltip.weakHeroSynergies')}
        items={slot.weakHeroSynergies}
        weak
        displayField="heroDisplayName"
      />
    </>
  )
}

function HeroTooltipContent({
  model,
  t,
}: {
  model: HeroModelDisplay
  t: TFunction<'overlay'>
}): React.ReactElement {
  return (
    <>
      <div className="tooltip-title">{model.heroDisplayName}</div>
      <div className="tooltip-stat">
        {t('tooltip.winrate', { value: formatWinrate(model.winrate) })}
      </div>
      <div className="tooltip-stat">
        {t('tooltip.pickRate', { value: formatPickRate(model.pickRate) })}
      </div>
      {model.personalGames != null && model.personalWinrate != null && (
        <div className="tooltip-stat tooltip-personal">
          {t('tooltip.personalStats', {
            value: formatWinrate(model.personalWinrate),
            games: String(model.personalGames),
          })}
        </div>
      )}

      <HeroSynergySection
        title={t('tooltip.strongAbilities')}
        items={model.strongAbilitySynergies}
      />
      <HeroSynergySection
        title={t('tooltip.weakAbilities')}
        items={model.weakAbilitySynergies}
        weak
      />
    </>
  )
}

function SynergySection({
  title,
  items,
  renderItem,
}: {
  title: string
  items: SynergyPairDisplay[]
  renderItem: (item: SynergyPairDisplay, index: number) => React.ReactElement
}): React.ReactElement | null {
  if (items.length === 0) return null
  return (
    <>
      <div className="tooltip-section-title">{title}</div>
      {items.slice(0, MAX_SYNERGIES).map(renderItem)}
    </>
  )
}

function HeroSynergySection({
  title,
  items,
  weak,
  displayField = 'abilityDisplayName',
}: {
  title: string
  items: HeroSynergyDisplay[]
  weak?: boolean
  displayField?: 'abilityDisplayName' | 'heroDisplayName'
}): React.ReactElement | null {
  if (items.length === 0) return null
  return (
    <>
      <div className="tooltip-section-title">{title}</div>
      {items.slice(0, MAX_SYNERGIES).map((item, i) => (
        <div
          key={i}
          className={`tooltip-combo tooltip-combo-hero${weak ? ' tooltip-combo-weak' : ''}`}
        >
          - {item[displayField]}{' '}
          <span className={weak ? 'tooltip-combo-weak' : 'tooltip-combo-winrate'}>
            ({formatSynergyWr(item.synergyWinrate)})
          </span>
        </div>
      ))}
    </>
  )
}

function renderAbilitySynergy(item: SynergyPairDisplay, i: number): React.ReactElement {
  return (
    <div key={i} className="tooltip-combo">
      - {item.ability2DisplayName}{' '}
      <span className="tooltip-combo-winrate">({formatSynergyWr(item.synergyWinrate)})</span>
    </div>
  )
}

function renderWeakAbilitySynergy(item: SynergyPairDisplay, i: number): React.ReactElement {
  return (
    <div key={i} className="tooltip-combo tooltip-combo-weak">
      - {item.ability2DisplayName}{' '}
      <span className="tooltip-combo-weak">({formatSynergyWr(item.synergyWinrate)})</span>
    </div>
  )
}
