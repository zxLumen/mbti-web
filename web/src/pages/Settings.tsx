import { useEffect, useState } from 'react'
import { api, type AppSettings } from '../lib/api.js'
import { THEMES, readTheme, saveTheme, readAtype, clearTypeTheme } from '../lib/theme.js'

export function Settings() {
  const [theme, setTheme] = useState<string>(() => readTheme())
  const [atype, setAtype] = useState<string>(() => readAtype())
  const [s, setS] = useState<AppSettings>({
    provider: 'zxGateway',
    baseURL: '',
    model: '',
    maxTokens: 2048,
    temperature: 0.6,
    reasoningEffort: 'none',
  })
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.getSettings().then((r) => {
      setS(r)
      setHasKey(Boolean(r.hasKey))
      setIsOwner(Boolean(r.isOwner))
    })
  }, [])

  const save = async () => {
    const r = await api.saveSettings({ ...s, apiKey })
    if (r.error) {
      setMsg(r.message || '保存失败：仅站长可修改')
      setTimeout(() => setMsg(''), 3000)
      return
    }
    setHasKey(Boolean(r.hasKey))
    setApiKey('')
    setMsg('已保存')
    setTimeout(() => setMsg(''), 2500)
  }

  const set = (patch: Partial<AppSettings>) => setS((prev) => ({ ...prev, ...patch }))
  const dis = !isOwner

  return (
    <div className="settings card">
      <h1>设置</h1>
      {atype && (
        <div className="type-banner">
          <span>
            已完成测评，界面已切换为 <b>{atype}</b> 的专属极光配色
          </span>
          <button
            className="link-btn"
            onClick={() => {
              clearTypeTheme()
              setAtype('')
              setTheme(readTheme())
            }}
          >
            恢复我选择的主题
          </button>
        </div>
      )}
      <div className="field">
        <label>界面主题（立即生效，仅本机）</label>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-tile${theme === t.id ? ' on' : ''}`}
              onClick={() => {
                setTheme(t.id)
                setAtype('')
                saveTheme(t.id)
              }}
              title={t.desc}
            >
              <span className="theme-swatch" style={{ background: t.swatch }} />
              <span className="theme-name">{t.name}</span>
              <span className="theme-desc">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>
      {!isOwner && (
        <p className="settings-readonly">当前为只读视图 · 仅站长可修改</p>
      )}
      <div className="field">
        <label>服务商</label>
        <select value={s.provider} disabled={dis} onChange={(e) => set({ provider: e.target.value })}>
          <option value="zxGateway">博客 AI 网关（zxGateway）</option>
          <option value="custom">自定义（OpenAI 兼容）</option>
        </select>
      </div>
      <div className="field">
        <label>API Base URL</label>
        <input
          value={s.baseURL}
          disabled={dis}
          onChange={(e) => set({ baseURL: e.target.value })}
          placeholder={
            s.provider === 'zxGateway'
              ? '留空则用环境变量 ZX_AI_GATEWAY_URL（本地默认 http://localhost:3000/api/ai/v1）'
              : '如 https://api.openai.com/v1'
          }
        />
      </div>
      <div className="field">
        <label>API Key {hasKey ? '（已保存，留空则不修改）' : ''}</label>
        <input
          type="password"
          value={apiKey}
          disabled={dis}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={hasKey ? '已配置，留空保持不变' : '粘贴网关应用令牌或供应商 Key'}
        />
      </div>
      <div className="field">
        <label>模型（model）</label>
        <input value={s.model} disabled={dis} onChange={(e) => set({ model: e.target.value })} placeholder="如 deepseek-v4.1-flash" />
      </div>
      <div className="field">
        <label>maxTokens（思考型模型建议 ≥ 2048）</label>
        <input type="number" value={s.maxTokens} disabled={dis} onChange={(e) => set({ maxTokens: Number(e.target.value) })} />
      </div>
      <div className="field">
        <label>temperature（0.4–0.9，对话式偏高更自然）</label>
        <input
          type="number"
          step="0.1"
          min="0"
          max="1"
          value={s.temperature}
          disabled={dis}
          onChange={(e) => set({ temperature: Number(e.target.value) })}
        />
      </div>
      <div className="field">
        <label>思考强度（关闭 = 更快更省）</label>
        <select
          value={s.reasoningEffort || 'none'}
          disabled={dis}
          onChange={(e) => set({ reasoningEffort: e.target.value })}
        >
          <option value="none">关闭（推荐：直接作答，首字更快）</option>
          <option value="low">低</option>
          <option value="default">默认（交给模型，可能较慢）</option>
        </select>
      </div>
      {isOwner && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn" onClick={save}>
            保存
          </button>
          {msg && <span style={{ color: 'var(--good)', fontSize: 13 }}>{msg}</span>}
        </div>
      )}
      <p style={{ color: 'var(--dim)', fontSize: 12 }}>
        未配置模型时测评仍可用，但会退回「直接展示题库题」的简易模式。配好后即变为有温度的对话式场景。
      </p>
    </div>
  )
}
