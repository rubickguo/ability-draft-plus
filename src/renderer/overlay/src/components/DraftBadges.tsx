import { useTranslation } from 'react-i18next'
import type { IconGuidance } from '../draft-badges'

export function DraftBadges({ guidance }: { guidance?: IconGuidance }): React.ReactElement | null {
  const { t } = useTranslation('overlay')
  if (!guidance) return null
  return (
    <>
      {guidance.rank != null && guidance.rank <= 10 && <span aria-hidden="true" className={`draft-focus-ring ${guidance.rank <= 3 ? 'draft-focus-gold' : 'draft-focus-teal'}`} />}
      {guidance.rank != null && (
        <span
          className={`draft-rank${guidance.rank <= 3 ? ' draft-rank-top' : guidance.rank <= 10 ? ' draft-rank-ten' : ' draft-rank-rest'}`}
          title={t('badges.rankTitle', { rank: guidance.rank })}
        >
          {guidance.rank}
        </span>
      )}
      {guidance.groups.length > 0 && (
        <span className="draft-combo-badges">
          {guidance.groups.slice(0, 2).map((group) => (
            <span
              key={group.key}
              className="draft-combo-badge"
              title={`${group.label}: ${group.names.join(' + ')} (${(group.winrate * 100).toFixed(1)}%)`}
            >
              {group.label}
            </span>
          ))}
          {guidance.groups.length > 2 && (
            <span
              className="draft-combo-badge"
              title={guidance.groups
                .slice(2)
                .map((g) => `${g.label}: ${g.names.join(' + ')}`)
                .join('\n')}
            >
              +{guidance.groups.length - 2}
            </span>
          )}
        </span>
      )}
    </>
  )
}
