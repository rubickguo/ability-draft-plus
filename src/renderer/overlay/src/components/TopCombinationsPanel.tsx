import { useState } from 'react'
import type { DraftRecommendation, DraftThreat } from '@core/domain/contextual-ranking'
import { useMousePassthrough } from '../hooks/use-mouse-passthrough'

const KIND_LABEL: Record<DraftThreat['kind'], string> = {
  enemy: '敌方半套',
  own: '自身可补全',
  ally: '队友可补全',
  potential: '池内潜在组合',
}

function ThreatRow({ threat, index }: { threat: DraftThreat; index: number }): React.ReactElement {
  const seat =
    threat.ownerPlayerIndex == null ? '' : ` · 第 ${(threat.ownerPlayerIndex % 5) + 1} 行`
  const canDeny = threat.kind === 'enemy' && threat.actionable
  return (
    <li className={`threat-row${canDeny ? ' threat-row-actionable' : ''}`}>
      <span className="combo-position">{index + 1}</span>
      <div className="threat-row-body">
        <div className="threat-row-heading">
          <span>
            {KIND_LABEL[threat.kind]}
            {threat.kind === 'enemy' || threat.kind === 'ally' ? seat : ''}
          </span>
          {threat.kind === 'enemy' && threat.imminent && (
            <span className="threat-urgent">可能先于你补齐</span>
          )}
        </div>
        {threat.ownedNames.length > 0 ? (
          <>
            <div className="threat-owned">已有：{threat.ownedNames.join(' + ')}</div>
            <div className={canDeny ? 'threat-deny' : 'threat-missing'}>
              {canDeny ? '可截胡：' : '尚缺：'}
              {threat.missingNames.join(' + ')}
            </div>
          </>
        ) : (
          <div className="threat-names">{threat.names.join(' + ')}</div>
        )}
        <div className="threat-stats">
          历史胜率 <strong>{(threat.synergyWinrate * 100).toFixed(1)}%</strong>
          <span>
            {' '}
            ·{' '}
            {threat.numPicks == null
              ? '样本量缺失'
              : `${threat.numPicks.toLocaleString('zh-CN')} 场`}
          </span>
          {threat.evidence === 'limited' && <span> · 证据有限</span>}
        </div>
        <div className="threat-reason">{threat.reason}</div>
      </div>
    </li>
  )
}

export function TopCombinationsPanel({
  recommendation,
}: {
  recommendation: DraftRecommendation
}): React.ReactElement {
  const [open, setOpen] = useState(() => localStorage.getItem('topCombinationsVisible') !== 'false')
  const [sort, setSort] = useState<'priority' | 'winrate'>('priority')
  const { onMouseEnter, onMouseLeave } = useMousePassthrough()
  const threats = recommendation.threats
  const enemies = threats.filter((threat) => threat.kind === 'enemy').slice(0, 10)
  const others = threats.filter((threat) => threat.kind !== 'enemy').slice(0, 10 - enemies.length)
  const winrateOrder = [...threats].sort((a, b) => b.synergyWinrate - a.synergyWinrate).slice(0, 10)
  return (
    <section
      className="top-combinations overlay-interactive"
      aria-label="组合与截胡"
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
        {open ? '隐藏组合与截胡' : '显示组合与截胡'}
      </button>
      {open && (
        <div className="top-combinations-content">
          <div className="combination-sort" role="group" aria-label="组合排序方式">
            <button aria-pressed={sort === 'priority'} onClick={() => setSort('priority')}>
              威胁优先
            </button>
            <button aria-pressed={sort === 'winrate'} onClick={() => setSort('winrate')}>
              历史胜率
            </button>
          </div>
          <p className="top-combinations-note">
            {sort === 'priority'
              ? '优先查看敌方已拿一半的组合；截胡应兼顾自身收益。'
              : '按已收录组合的历史胜率排列；不等于当前选取建议。'}
          </p>
          {threats.length === 0 ? (
            <p className="top-combinations-empty">当前没有可用的组合记录，请先识别技能池。</p>
          ) : sort === 'winrate' ? (
            <ol>
              {winrateOrder.map((threat, index) => (
                <ThreatRow key={threat.key} threat={threat} index={index} />
              ))}
            </ol>
          ) : (
            <>
              {enemies.length > 0 ? (
                <ol>
                  {enemies.map((threat, index) => (
                    <ThreatRow key={threat.key} threat={threat} index={index} />
                  ))}
                </ol>
              ) : (
                <p className="top-combinations-empty">当前未识别到敌方可补全的组合。</p>
              )}
              {others.length > 0 && (
                <details className="potential-combinations">
                  <summary>池内与己方组合（{others.length}）</summary>
                  <ol>
                    {others.map((threat, index) => (
                      <ThreatRow key={threat.key} threat={threat} index={enemies.length + index} />
                    ))}
                  </ol>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
