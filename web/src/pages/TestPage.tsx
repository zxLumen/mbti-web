import { useEffect, useRef, useState } from 'react'
import { api, streamTurn, type HistoryEntry, type Progress, type Tendency, type TurnResp } from '../lib/api.js'
import { applyTypeTheme } from '../lib/theme.js'
import { unlockType } from '../lib/report-store.js'
import { typeMeta } from '../lib/mbti-meta.js'
import { Mascot } from '../components/Mascot.js'

interface Msg {
  role: 'ai' | 'user'
  text: string
}
interface SavedSession {
  sessionId: string
  msgs: Msg[]
  hints: string[]
  progress: Progress
  degraded: boolean
  done: boolean
  resultCode: string
  summary: string
  tendencies: Tendency[]
}

const S_KEY = 'mbti.session.v1'
const DEFAULT_PROGRESS: Progress = { qCount: 0, minQ: 12, maxQ: 30 }

function readSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(S_KEY)
    return raw ? (JSON.parse(raw) as SavedSession) : null
  } catch {
    return null
  }
}
function writeSession(s: SavedSession) {
  try {
    localStorage.setItem(S_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}
function clearSession() {
  try {
    localStorage.removeItem(S_KEY)
  } catch {
    /* ignore */
  }
}

/** AI 气泡按空行分段,避免挤成一坨 */
function AiText({ text }: { text: string }) {
  const parts = text
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length <= 1) return <>{text}</>
  return (
    <>
      {parts.map((p, i) => (
        <p key={i} className={i === parts.length - 1 ? 'ai-para ai-para-q' : 'ai-para'}>
          {p}
        </p>
      ))}
    </>
  )
}

export function TestPage({
  onComplete,
  onViewReport,
}: {
  onComplete: (e: HistoryEntry) => void
  onViewReport: () => void
}) {
  const [sessionId, setSessionId] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [hints, setHints] = useState<string[]>([])
  const [progress, setProgress] = useState<Progress>(DEFAULT_PROGRESS)
  const [thinking, setThinking] = useState(false)
  const [streamText, setStreamText] = useState<string | null>(null)
  const [degraded, setDegraded] = useState(false)
  const [done, setDone] = useState(false)
  const [resultCode, setResultCode] = useState('')
  const [summary, setSummary] = useState('')
  const [tendencies, setTendencies] = useState<Tendency[]>([])
  const [hydrated, setHydrated] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const streamRef = useRef('')

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, thinking, streamText])

  const beginStream = () => {
    streamRef.current = ''
    setStreamText('')
    setThinking(false)
  }
  const pushDelta = (t: string) => {
    setThinking(false)
    streamRef.current = t
    setStreamText(t)
  }

  const start = async () => {
    clearSession()
    setDone(false)
    setResultCode('')
    setSummary('')
    setTendencies([])
    setMsgs([])
    setHints([])
    setDegraded(false)
    setThinking(true)
    streamRef.current = ''
    setStreamText(null)
    await streamTurn('/api/mbti/start', {}, {
      onStart: beginStream,
      onDelta: pushDelta,
      onEnd: (p: TurnResp) => {
        const full = streamRef.current
        setStreamText(null)
        streamRef.current = ''
        setSessionId(p.sessionId || '')
        const text = full || p.message || ''
        if (text) setMsgs([{ role: 'ai', text }])
        setHints(p.hints || [])
        if (p.progress) setProgress(p.progress)
        setDegraded(Boolean(p.degraded))
        setThinking(false)
      },
      onError: () => {
        setThinking(false)
        setStreamText(null)
        streamRef.current = ''
        setMsgs([{ role: 'ai', text: '（刚才没接上，刷新一下页面再试，或点「重新开始」）' }])
      },
    })
    setThinking(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  useEffect(() => {
    ;(async () => {
      const saved = readSession()
      if (saved && saved.sessionId) {
        setSessionId(saved.sessionId)
        setMsgs(saved.msgs || [])
        setHints(saved.hints || [])
        setProgress(saved.progress || DEFAULT_PROGRESS)
        setDegraded(Boolean(saved.degraded))
        if (saved.done) {
          setDone(true)
          setResultCode(saved.resultCode || '')
          setSummary(saved.summary || '')
          setTendencies(saved.tendencies || [])
          setHydrated(true)
          return
        }
        const meta = await api.resume(saved.sessionId)
        if (meta) {
          setProgress(meta.progress || DEFAULT_PROGRESS)
          setHints(meta.hints || [])
          if (meta.done) {
            setDone(true)
            setResultCode(meta.resultCode || '')
            setSummary(meta.summary || '')
            setTendencies(meta.tendencies || [])
          }
          setHydrated(true)
          return
        }
        clearSession()
        setMsgs([])
        setHints([])
      }
      setHydrated(true)
      start()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated) return
    if (!sessionId && msgs.length === 0) return
    writeSession({ sessionId, msgs, hints, progress, degraded, done, resultCode, summary, tendencies })
  }, [hydrated, sessionId, msgs, hints, progress, degraded, done, resultCode, summary, tendencies])

  async function send(text: string) {
    if (!text.trim() || !sessionId || thinking) return
    const t = text.trim()
    setMsgs((m) => [...m, { role: 'user', text: t }])
    setInput('')
    setHints([])
    setThinking(true)
    streamRef.current = ''
    setStreamText(null)
    await streamTurn('/api/mbti/answer', { sessionId, text: t }, {
      onStart: beginStream,
      onDelta: pushDelta,
      onEnd: (p: TurnResp) => {
        const full = streamRef.current
        setStreamText(null)
        streamRef.current = ''
        if (p.progress) setProgress(p.progress)
        if (p.done) {
          const summaryText = p.summary || full
          const entry: HistoryEntry = {
            code: p.resultCode || '',
            summary: summaryText,
            tendencies: p.tendencies || [],
            at: Date.now(),
          }
          onComplete(entry)
          applyTypeTheme(entry.code)
          unlockType(entry.code)
          setDone(true)
          setResultCode(entry.code)
          setSummary(summaryText)
          setTendencies(entry.tendencies)
          api.stats({ type: 'done', code: p.resultCode })
        } else {
          setMsgs((m) => [...m, { role: 'ai', text: full || p.message || '' }])
          setHints(p.hints || [])
          setDegraded(Boolean(p.degraded))
        }
        setThinking(false)
      },
      onError: () => {
        setThinking(false)
        setStreamText(null)
        streamRef.current = ''
        setMsgs((m) => [...m, { role: 'ai', text: '（刚才没接上，把你刚才的话再发一次就好）' }])
      },
    })
    setThinking(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function reset() {
    api.reset(sessionId).then(() => start())
  }
  function confirmReset() {
    if (window.confirm('重新开始？当前这次的选择会被清空（历史结果会保留）。')) reset()
  }

  const pct = Math.min(100, (progress.qCount / (progress.maxQ || 30)) * 100)

  return (
    <div className="chat">
      {!done && (
        <>
          <div className="progress card soft">
            <div className="progress-top">
              <span className="progress-note">顺着聊就好，不用急着得出结论 ~</span>
              <button className="link-btn" onClick={confirmReset}>
                重新开始
              </button>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: pct + '%' }} />
            </div>
            {degraded && (
              <div className="degraded-note">简易模式：模型未生效，正在用题库题（站长可在「设置」检查配置）</div>
            )}
          </div>
          <div className="msgs" ref={scrollRef}>
            {msgs.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.role === 'ai' ? <AiText text={m.text} /> : m.text}
              </div>
            ))}
            {streamText !== null && (
              <div className="bubble ai">
                <AiText text={streamText} />
                {streamText === '' && '…'}
              </div>
            )}
            {thinking && streamText === null && <div className="bubble ai">我想想…</div>}
          </div>
          <div className="card">
            {hints.length > 0 && (
              <div className="quick">
                <span className="quick-label">也许：</span>
                {hints.map((h, i) => (
                  <button key={i} onClick={() => send(h)}>
                    {h}
                  </button>
                ))}
              </div>
            )}
            <div className="input-row">
              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                placeholder="想到什么就说什么，怎么舒服怎么来 ~（Enter 发送，Shift+Enter 换行）"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send(input)
                  }
                }}
              />
              <button className="btn" onClick={() => send(input)}>
                发送
              </button>
            </div>
          </div>
        </>
      )}
      {done && (
        <div className="result-wrap">
          <div className="card done-card">
            <Mascot code={resultCode} variant="banner" />
            <h1 style={{ textAlign: 'center' }}>这一轮聊完啦</h1>
            <div className="result-code">{resultCode}</div>
            {typeMeta(resultCode) && (
              <div className="done-name">
                {typeMeta(resultCode)!.name} · {typeMeta(resultCode)!.alias}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn" onClick={onViewReport}>
                查看报告
              </button>
              <button className="btn ghost" onClick={reset}>
                重新聊聊
              </button>
            </div>
            <p className="disclaimer">结果已存入「报告」，随时可以回来查看或保存图片。</p>
          </div>
        </div>
      )}
    </div>
  )
}
