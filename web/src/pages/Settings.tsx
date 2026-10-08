import { useEffect, useState } from 'react'

const KEY = 'mbti.settings.v1'

export function Settings() {
  const [settings, setSettings] = useState<any>({
    provider: 'zxGateway',
    baseURL: '',
    apiKey: '',
    model: 'deepseek-chat',
    maxTokens: 1024,
    temperature: 0.4
  })

  useEffect(()=>{
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) setSettings({...settings, ...JSON.parse(raw)})
    } catch {}
  },[])

  function save(){
    try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch {}
    alert('已保存（仅保存在本地浏览器）')
  }

  return (
    <div className="settings card">
      <h1>设置</h1>
      <div className="field">
        <label>服务商</label>
        <select value={settings.provider} onChange={e=>setSettings({...settings, provider:e.target.value})}>
          <option value="zxGateway">博客 AI 网关（zxGateway）</option>
          <option value="custom">自定义（OpenAI 兼容）</option>
        </select>
      </div>
      <div className="field">
        <label>API Base URL</label>
        <input value={settings.baseURL} onChange={e=>setSettings({...settings, baseURL:e.target.value})} placeholder={settings.provider==='zxGateway'?'留空则使用博客网关默认地址':''}/>
      </div>
      <div className="field">
        <label>API Key</label>
        <input type="password" value={settings.apiKey} onChange={e=>setSettings({...settings, apiKey:e.target.value})} placeholder={settings.provider==='zxGateway'?'可填网关 Token':''}/>
      </div>
      <div className="field">
        <label>模型（model）</label>
        <input value={settings.model} onChange={e=>setSettings({...settings, model:e.target.value})}/>
      </div>
      <div className="field">
        <label>maxTokens</label>
        <input type="number" value={settings.maxTokens} onChange={e=>setSettings({...settings, maxTokens:Number(e.target.value)})}/>
      </div>
      <div className="field">
        <label>temperature（0.2–0.6 较适合分类）</label>
        <input type="number" step="0.1" min="0" max="1" value={settings.temperature} onChange={e=>setSettings({...settings, temperature:Number(e.target.value)})}/>
      </div>
      <div style={{display:'flex', gap:8}}>
        <button className="btn" onClick={save}>保存</button>
        <button className="btn ghost" onClick={()=>{ localStorage.removeItem(KEY); alert('已清除本地设置') }}>清除</button>
      </div>
      <p style={{color:'var(--dim)', fontSize:12}}>配置仅保存在本地浏览器。服务端也会读取 data/settings.json（站长可直接配置）。</p>
    </div>
  )
}
