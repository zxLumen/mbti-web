import { useEffect, useRef, useState } from 'react'
import { api, streamTurn, type Progress, type Tendency, type TurnResp } from '../lib/api.js'
import { Result } from './Result.js'

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
export interface HistoryEntry {
  code: string
  summary: string
  at: number
}

const S_KEY = 'mbti.session.v1'
const H_KEY = 'mbti.history.v1'
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
function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(H_KEY)
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : []
  } catch {
    return []
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

export function TestPage() {
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
  const [history, setHistory] = useState<HistoryEntry[]>([])
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

  // 首次挂载:优先恢复存档;服务端仍在则续,否则重开
  useEffect(() => {
    ;(async () => {
      setHistory(readHistory())
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
  }, [])

  // 存档(仅在恢复完成后)
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
          setDone(true)
          setResultCode(p.resultCode || '')
          setSummary(summaryText)
          setTendencies(p.tendencies || [])
          const entry: HistoryEntry = { code: p.resultCode || '', summary: summaryText, at: Date.now() }
          setHistory((h) => {
            const nh = [entry, ...h].slice(0, 12)
            try {
              localStorage.setItem(H_KEY, JSON.stringify(nh))
            } catch {
              /* ignore */
            }
            return nh
          })
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

  function clearHistory() {
    try {
      localStorage.removeItem(H_KEY)
    } catch {
      /* ignore */
    }
    setHistory([])
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
          <Result
            code={resultCode}
            summary={summary}
            tendencies={tendencies}
            history={history}
            onRestart={() => reset()}
            onClearHistory={clearHistory}
          />
        </div>
      )}
    </div>
  )
}
