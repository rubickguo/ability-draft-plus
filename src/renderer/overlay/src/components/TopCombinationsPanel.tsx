import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { OverlayDataPayload } from '@shared/types'
import { topPoolPairs } from '../ranking'
import { useMousePassthrough } from '../hooks/use-mouse-passthrough'

export function TopCombinationsPanel({ data }: { data: OverlayDataPayload }): React.ReactElement {
  const { t } = useTranslation('overlay')
  const [open, setOpen] = useState(() => localStorage.getItem('topCombinationsVisible') !== 'false')
  const { onMouseEnter, onMouseLeave } = useMousePassthrough()
  const pairs = topPoolPairs(data)
  return (
    <section
      className="top-combinations overlay-interactive"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        className="overlay-btn overlay-btn-purple"
        aria-expanded={open}
        onClick={() =>
          setOpen((value) => {
            localStorage.setItem('topCombinationsVisible', String(!value))
            return !value
          })
        }
      >
        {t(open ? 'topCombinations.hide' : 'topCombinations.show')}
      </button>
      {open && (
        <div className="top-combinations-content">
          <div className="tooltip-section-title">{t('topCombinations.title')}</div>
          <div className="top-combinations-note">{t('topCombinations.note')}</div>
          {!data.rankingData ? (
            <p>{t('topCombinations.loading')}</p>
          ) : pairs.length === 0 ? (
            <p>{t('topCombinations.empty')}</p>
          ) : (
            <ol>
              {pairs.map((pair, index) => (
                <li key={pair.key}>
                  <span className="combo-position">{index + 1}</span>
                  <span>{pair.names.join(' + ')}</span>
                  <strong>{(pair.synergyWinrate * 100).toFixed(1)}%</strong>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  )
}
