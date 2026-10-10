import { useCallback } from 'react'
import type { HeroModelDisplay, SlotCoordinate } from '@shared/types'
import type { IconGuidance } from '../draft-badges'
import { DraftBadges } from './DraftBadges'

interface HeroModelHotspotProps {
  guidance?: IconGuidance
  model: HeroModelDisplay
  coord: SlotCoordinate
  scaleFactor: number
  isMyModel: boolean
  onHover: (model: HeroModelDisplay, rect: DOMRect) => void
  onLeave: () => void
}

export function HeroModelHotspot({
  guidance,
  model,
  coord,
  scaleFactor,
  isMyModel,
  onHover,
  onLeave,
}: HeroModelHotspotProps): React.ReactElement {
  const style: React.CSSProperties = {
    left: coord.x / scaleFactor,
    top: coord.y / scaleFactor,
    width: coord.width / scaleFactor,
    height: coord.height / scaleFactor,
  }

  let className = 'hero-model-hotspot'

  if (isMyModel) {
    className += ' is-my-model'
  } else if (model.isGeneralTopTier) {
    className += ' shimmer-gold'
  }

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      onHover(model, e.currentTarget.getBoundingClientRect())
    },
    [model, onHover],
  )

  return (
    <div
      className={className}
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onLeave}
      data-hero-name={model.heroDisplayName}
      aria-label={model.heroDisplayName}
      id={`hero-model-hotspot-${model.heroOrder}`}
    >
      <DraftBadges guidance={guidance} />
      {/* Corner marker: recommended because of the linked profile's stats */}
      {model.isPersonallyDriven && <span className="personal-marker" />}
    </div>
  )
}
