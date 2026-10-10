import type { DraftRecommendation } from '@core/domain/contextual-ranking'
import { useMousePassthrough } from '../hooks/use-mouse-passthrough'

export function BestChoicePanel({
  recommendation,
}: {
  recommendation: DraftRecommendation
}): React.ReactElement {
  const { onMouseEnter, onMouseLeave } = useMousePassthrough()
  // Use the same first element as the numbered badges, even during a refresh.
  const best = recommendation.choices[0]
  const alternatives = recommendation.choices.slice(1, 3)
  const waitText =
    recommendation.waitPicks === null
      ? '选取顺序尚未确认'
      : recommendation.waitPicks === 0
        ? '这手与下一手之间无人插选'
        : `这手选完到你再选，中间隔 ${recommendation.waitPicks} 手`
  return (
    <section
      className="best-choice-panel overlay-interactive"
      aria-label="本手首选"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="best-choice-heading">
        本手首选 <span>模型与技能统一排名</span>
      </div>
      {best ? (
        <>
          <div className="best-choice-title">
            <span className="best-choice-number">1</span>
            <strong>{best.displayName}</strong>
          </div>
          <div className="best-choice-reasons">
            {best.reasons.slice(0, 2).map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
          </div>
          {recommendation.waitPicks === 0 && best.followUp && (
            <div className="best-choice-followup">连选搭配：{best.followUp.displayName}</div>
          )}
          {alternatives.length > 0 && (
            <div className="best-choice-alternatives" aria-label="备选">
              <span>备选</span>
              {alternatives.map((choice) => (
                <span key={choice.key} title={choice.reasons.join('；')}>
                  <b>{choice.rank}</b> {choice.displayName}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="best-choice-empty">暂无可推荐的合法选项，请重新识别当前技能池。</p>
      )}
      <div className="best-choice-wait">{waitText}</div>
      {recommendation.notes.length > 0 && (
        <details className="best-choice-notes">
          <summary>
            {recommendation.notes.find((note) => !note.startsWith('分数是推荐指数')) ??
              '查看推荐依据'}
          </summary>
          {recommendation.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
          <p>排名用于比较当前选项，不是本局的预测胜率。</p>
        </details>
      )}
    </section>
  )
}
