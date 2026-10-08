import { useEffect, useRef, useState } from 'react'
import { api, type QuestionDTO } from '../lib/api.js'
import { Result } from './Result.js'

interface Progress {
  qCount: number
  minQ: number
  maxQ: number
}

export function TestPage() {
  const [sessionId, setSessionId] = useState('')
  const [q, setQ] = useState<QuestionDTO | null>(null)
  const [msgs, setMsgs] = useState<Array<{ role: 'ai' | 'user'; text: string }>>([])
  const [input, setInput] = useState('')
  const [progress, setProgress] = useState<Progress>({ qCount: 0, minQ: 12, maxQ: 30 })
  const [conf, setConf] = useState<Record<string, number>>({ E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 })
  const [thinking, setThinking] = useState(false)
  const [done, setDone] = useState(false)
  const [resultCode, setResultCode] = useState('')
  const [clarify, setClarify] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, thinking])

  const start = async () => {
    setDone(false)
    setResultCode('')
    setMsgs([])
    setClarify('')
    const r = await api.start()
    setSessionId(r.sessionId)
    if (r.question) {
      setQ(r.question)
      setMsgs([{ role: 'ai', text: formatQ(r.question) }])
    }
    setProgress(r.progress)
    setConf(r.conf || {})
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  useEffect(() => {
    start()
  }, [])

  function formatQ(question: QuestionDTO) {
    return `${question.stem}\n\nA. ${question.optionA}\nB. ${question.optionB}`
  }

  async function send(text: string) {
    if (!text.trim() || !sessionId || thinking) return
    const t = text.trim()
    setMsgs((m) => [...m, { role: 'user', text: t }])
    setInput('')
    setClarify('')
    setThinking(true)
    const r = await api.answer(sessionId, t)
    if (r.clarify) {
      setClarify(r.text || '')
      setMsgs((m) => [...m, { role: 'ai', text: r.text || '' }])
      setProgress(r.progress)
      setConf(r.conf || {})
    } else if (r.done) {
      setDone(true)
      setResultCode(r.resultCode || '')
      setProgress(r.progress)
      setConf(r.conf || {})
      await api.stats({ type: 'done', code: r.resultCode })
    } else if (r.question) {
      const nq = r.question
      setQ(nq)
      setMsgs((m) => [...m, { role: 'ai', text: formatQ(nq) }])
      setProgress(r.progress)
      setConf(r.conf || {})
    }
    setThinking(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function quickSend(t: string) {
    send(t)
  }

  function reset() {
    api.reset(sessionId).then(() => start())
  }

  return (
    <div className="chat">
      {!done && (
        <>
          <div className="progress card">
            <div>
              已答 {progress.qCount} / 预计 {progress.minQ}–{progress.maxQ}
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: Math.min(100, (progress.qCount / (progress.maxQ || 30)) * 100) + '%' }}
              />
            </div>
            <div className="axes">
              {(['E', 'I', 'S', 'N', 'T', 'F', 'J', 'P'] as const).map((k) => (
                <div className="axis" key={k}>
                  <div>{k}</div>
                  <div className="axis-track">
                    <div className="axis-fill" style={{ width: Math.max(0, Math.min(100, (conf[k] || 0) * 100)) + '%' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="msgs" ref={scrollRef}>
            {msgs.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.text}
              </div>
            ))}
            {thinking && <div className="bubble ai">正在思考...</div>}
          </div>
          <div className="card">
            {clarify && <div style={{ color: 'var(--dim)', fontSize: 13 }}>{clarify}</div>}
            <div className="quick">
              <button onClick={() => quickSend('更像 A')}>更像 A</button>
              <button onClick={() => quickSend('更像 B')}>更像 B</button>
              <button onClick={() => quickSend('不确定')}>不确定</button>
              <button onClick={() => quickSend('视情况而定')}>视情况而定</button>
              <button onClick={() => quickSend('都有')}>都有</button>
            </div>
            <div className="input-row">
              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                placeholder="用自然语言回答即可，按 Enter 发送，Shift+Enter 换行"
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
      {done && <Result code={resultCode} onRestart={() => reset()} />}
    </div>
  )
}
