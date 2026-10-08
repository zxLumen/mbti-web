import { useState } from 'react'
import { TestPage } from './pages/TestPage.js'
import { Settings as SettingsPage } from './pages/Settings.js'

type Tab = 'test' | 'settings'

export function App() {
  const [tab, setTab] = useState<Tab>('test')
  return (
    <div className="app">
      <nav className="app-tabs">
        <button className={tab === 'test' ? 'is-on' : ''} onClick={() => setTab('test')}>
          测评
        </button>
        <button className={tab === 'settings' ? 'is-on' : ''} onClick={() => setTab('settings')}>
          设置
        </button>
      </nav>
      {tab === 'test' && <TestPage />}
      {tab === 'settings' && <SettingsPage />}
    </div>
  )
}
