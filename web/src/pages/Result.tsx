import type { Tendency } from '../lib/api.js'
import type { HistoryEntry } from './TestPage.js'

function fmt(at: number): string {
  try {
    return new Date(at).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function Result({
  code,
  summary,
  tendencies,
  history,
  onRestart,
  onClearHistory,
}: {
  code: string
  summary: string
  tendencies: Tendency[]
  history: HistoryEntry[]
  onRestart: () => void
  onClearHistory: () => void
}) {
  return (
    <div className="card" style={{ gap: 18 }}>
      <h1 style={{ textAlign: 'center' }}>你的性格类型</h1>
      <div className="result-code">{code}</div>
      {summary && <p className="result-summary">{summary}</p>}
      {tendencies.length > 0 && (
        <div className="result-axes">
          {tendencies.map((t) => (
            <div key={t.dim} className="result-row">
              <div className="label">{t.posLabel}</div>
              <div className="bar">
                <div className="fill" style={{ width: t.posPct + '%' }} />
              </div>
              <div className="label" style={{ textAlign: 'right' }}>
                {t.negLabel}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="disclaimer">
        本测评基于 MBTI 理论，用于自我探索，不作为心理诊断、医疗、就业或其他关键决策的唯一依据。
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button className="btn ghost" onClick={onRestart}>
          重新聊聊
        </button>
        <button
          className="btn"
          onClick={() => {
            navigator.clipboard.writeText('我的性格类型：' + code + ' · https://mbti.zxlumen.cn')
          }}
        >
          复制分享
        </button>
      </div>

      {history.length > 0 && (
        <div className="history">
          <div className="history-head">
            <span>历史测试 · {history.length} 次</span>
            <button className="history-clear" onClick={onClearHistory}>
              清空
            </button>
          </div>
          {history.map((h, i) => (
            <details key={i} className="history-item">
              <summary>
                <b>{h.code || '—'}</b>
                <span className="history-date">{fmt(h.at)}</span>
              </summary>
              <p>{h.summary}</p>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}
