import { useEffect, useRef, useState } from 'react'
import { api, streamTurn, type Progress, type Tendency, type TurnResp } from '../lib/api.js'
import { Result } from './Result.js'

export function TestPage() {
  const [sessionId, setSessionId] = useState('')
  const [msgs, setMsgs] = useState<Array<{ role: 'ai' | 'user'; text: string }>>([])
  const [input, setInput] = useState('')
  const [hints, setHints] = useState<string[]>([])
  const [progress, setProgress] = useState<Progress>({ qCount: 0, minQ: 12, maxQ: 30 })
  const [thinking, setThinking] = useState(false)
  const [streamText, setStreamText] = useState<string | null>(null)
  const [degraded, setDegraded] = useState(false)
  const [done, setDone] = useState(false)
  const [resultCode, setResultCode] = useState('')
  const [summary, setSummary] = useState('')
  const [tendencies, setTendencies] = useState<Tendency[]>([])
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
    streamRef.current += t
    setStreamText(streamRef.current)
  }

  const start = async () => {
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
    })
    setThinking(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  useEffect(() => {
    start()
  }, [])

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
          setDone(true)
          setResultCode(p.resultCode || '')
          setSummary(p.summary || full)
          setTendencies(p.tendencies || [])
          api.stats({ type: 'done', code: p.resultCode })
        } else {
          setMsgs((m) => [...m, { role: 'ai', text: full || p.message || '' }])
          setHints(p.hints || [])
          setDegraded(Boolean(p.degraded))
        }
        setThinking(false)
      },
    })
    setThinking(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function reset() {
    api.reset(sessionId).then(() => start())
  }

  const pct = Math.min(100, (progress.qCount / (progress.maxQ || 30)) * 100)

  return (
    <div className="chat">
      {!done && (
        <>
          <div className="progress card soft">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: pct + '%' }} />
            </div>
            <div className="progress-note">顺着聊就好，不用急着得出结论 ~</div>
            {degraded && (
              <div className="degraded-note">简易模式：模型未生效，正在用题库题（站长可在「设置」检查配置）</div>
            )}
          </div>
          <div className="msgs" ref={scrollRef}>
            {msgs.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.text}
              </div>
            ))}
            {streamText !== null && <div className="bubble ai">{streamText || '…'}</div>}
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
      {done && <Result code={resultCode} summary={summary} tendencies={tendencies} onRestart={() => reset()} />}
    </div>
  )
}
