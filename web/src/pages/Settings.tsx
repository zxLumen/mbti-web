import { useEffect, useState } from 'react'
import { api, type AppSettings } from '../lib/api.js'

export function Settings() {
  const [s, setS] = useState<AppSettings>({
    provider: 'zxGateway',
    baseURL: '',
    model: '',
    maxTokens: 1024,
    temperature: 0.4,
  })
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.getSettings().then((r) => {
      setS(r)
      setHasKey(Boolean(r.hasKey))
    })
  }, [])

  const save = async () => {
    const r = await api.saveSettings({ ...s, apiKey })
    setHasKey(Boolean(r.hasKey))
    setApiKey('')
    setMsg('已保存到服务端')
    setTimeout(() => setMsg(''), 2500)
  }

  const set = (patch: Partial<AppSettings>) => setS((prev) => ({ ...prev, ...patch }))

  return (
    <div className="settings card">
      <h1>模型设置</h1>
      <div className="field">
        <label>服务商</label>
        <select value={s.provider} onChange={(e) => set({ provider: e.target.value })}>
          <option value="zxGateway">博客 AI 网关（zxGateway）</option>
          <option value="custom">自定义（OpenAI 兼容）</option>
        </select>
      </div>
      <div className="field">
        <label>API Base URL</label>
        <input
          value={s.baseURL}
          onChange={(e) => set({ baseURL: e.target.value })}
          placeholder={s.provider === 'zxGateway' ? '留空则用环境变量 ZX_GATEWAY_BASE_URL' : '如 https://api.openai.com/v1'}
        />
      </div>
      <div className="field">
        <label>API Key {hasKey ? '（已保存，留空则不修改）' : ''}</label>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
      </div>
      <div className="field">
        <label>模型（model）</label>
        <input value={s.model} onChange={(e) => set({ model: e.target.value })} placeholder="如 gpt-4o-mini" />
      </div>
      <div className="field">
        <label>maxTokens</label>
        <input type="number" value={s.maxTokens} onChange={(e) => set({ maxTokens: Number(e.target.value) })} />
      </div>
      <div className="field">
        <label>temperature（0.2–0.6 较适合归类任务）</label>
        <input
          type="number"
          step="0.1"
          min="0"
          max="1"
          value={s.temperature}
          onChange={(e) => set({ temperature: Number(e.target.value) })}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn" onClick={save}>
          保存
        </button>
        {msg && <span style={{ color: 'var(--good)', fontSize: 13 }}>{msg}</span>}
      </div>
      <p style={{ color: 'var(--dim)', fontSize: 12 }}>
        未配置模型时，测评仍可用：会退回本地规则判断 A/B。配置后可识别「有点偏 A」「说不清」这类自然表达。
      </p>
    </div>
  )
}
