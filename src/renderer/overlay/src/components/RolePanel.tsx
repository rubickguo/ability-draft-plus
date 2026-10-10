import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMousePassthrough } from '../hooks/use-mouse-passthrough'
import type { AppSettings, RoleContextDisplay } from '@shared/types'

// @DEV-GUIDE: Overlay quick control for role-aware suggestions. In AD you decide
// your role AFTER seeing your model and the pool, so the mode must be togglable
// mid-draft: Off / position numbers (multi-select = fixed mode) / Auto (dynamic).
// Settings writes trigger a cached-data rerank immediately. Automatic team-role
// inference still uses the latest accepted scan; manual positions need no capture.
// Interactive element on a click-through window: hover opt-in via
// useMousePassthrough, same as ControlsPanel.

type RoleMode = AppSettings['roleMode']

const POSITIONS = [1, 2, 3, 4, 5] as const

interface RolePanelProps {
  roleContext: RoleContextDisplay | undefined
  hasScanData: boolean
  /** LIVE spot selection (broadcast immediately on manual click or GSI
   * auto-detection) — used to override a stale per-scan 'noSpot' status. */
  mySpotSelected: boolean
  /** Auto draft tracking hides the manual My Spot buttons, so a 'noSpot'
   * status must say "waiting for detection", not "select your spot". */
  autoTracking: boolean
  onSettingsChanged?: () => void
}

export function RolePanel({
  roleContext,
  hasScanData,
  mySpotSelected,
  autoTracking,
  onSettingsChanged,
}: RolePanelProps): React.ReactElement {
  const { t } = useTranslation('overlay')
  const { onMouseEnter, onMouseLeave } = useMousePassthrough()
  const [mode, setMode] = useState<RoleMode>('off')
  const [positions, setPositions] = useState<number[]>([])
  const [settingsError, setSettingsError] = useState(false)

  useEffect(() => {
    window.electronApi.invoke('settings:get').then((settings) => {
      setMode(settings.roleMode)
      setPositions(settings.roleFixedPositions)
    })
  }, [])

  const apply = (nextMode: RoleMode, nextPositions: number[]): void => {
    setMode(nextMode)
    setPositions(nextPositions)
    window.electronApi
      .invoke('settings:set', {
        roleMode: nextMode,
        roleFixedPositions: nextPositions,
      })
      .then(() => {
        setSettingsError(false)
        onSettingsChanged?.()
      })
      .catch(() => setSettingsError(true))
  }

  const handleOff = (): void => apply('off', positions)
  const handleAuto = (): void => apply(mode === 'dynamic' ? 'off' : 'dynamic', positions)
  const handlePosition = (pos: number): void => {
    // Clicking a position always means fixed mode; toggling the last one off
    // falls back to Off rather than a fixed mode with nothing selected.
    const active = mode === 'fixed' && positions.includes(pos)
    const next = active
      ? positions.filter((p) => p !== pos)
      : [...new Set([...positions, pos])].sort((a, b) => a - b)
    apply(next.length === 0 ? 'off' : 'fixed', mode === 'fixed' ? next : [pos])
  }

  const status = ((): string => {
    if (settingsError) return '设置未保存，请重试'
    if (mode === 'off') return t('role.offStatus')
    if (!hasScanData) return t('role.appliesNextScan')
    if (mode === 'fixed') return t('role.scoringFor', { positions: positions.join('+') })
    // Context absent on a processed scan = that scan predates the mode toggle
    if (roleContext === undefined) return t('role.appliesNextScan')
    if (roleContext.status === 'noData') return t('role.needData')
    if (roleContext.status === 'noSpot') {
      // Spot arrived after the last scan (GSI detection lands ~20s in) —
      // the layer activates on the next rescan
      if (mySpotSelected) return t('role.appliesNextScan')
      return autoTracking ? t('role.waitingSpot') : t('role.needSpot')
    }
    if (roleContext.mode === 'dynamic') {
      return roleContext.dynamicGateOpen && roleContext.effectivePositions.length > 0
        ? t('role.teamNeeds', {
            positions: roleContext.effectivePositions.join('+'),
          })
        : t('role.watching')
    }
    return t('role.scoringFor', {
      positions: roleContext.effectivePositions.join('+'),
    })
  })()

  return (
    <div
      className="role-panel overlay-interactive"
      role="toolbar"
      aria-label={t('role.aria')}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="role-button-row">
        <span className="role-label">{t('role.label')}</span>
        <button
          className={`role-btn${mode === 'off' ? ' role-btn-active' : ''}`}
          onClick={handleOff}
        >
          {t('role.off')}
        </button>
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            className={`role-btn${
              mode === 'fixed' && positions.includes(pos) ? ' role-btn-active' : ''
            }`}
            onClick={() => handlePosition(pos)}
          >
            {pos}
          </button>
        ))}
        <button
          className={`role-btn${mode === 'dynamic' ? ' role-btn-active' : ''}`}
          onClick={handleAuto}
        >
          {t('role.auto')}
        </button>
      </div>
      <div className="role-status">{status}</div>
    </div>
  )
}
