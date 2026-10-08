import { useState } from 'react'
import { TestPage } from './pages/TestPage.js'
import { Report } from './pages/Report.js'
import { Settings as SettingsPage } from './pages/Settings.js'
import { readHistory, writeHistory, clearHistory } from './lib/report-store.js'
import type { HistoryEntry } from './lib/api.js'

type Tab = 'test' | 'report' | 'settings'

export function App() {
  const [tab, setTab] = useState<Tab>('test')
  const [history, setHistory] = useState<HistoryEntry[]>(() => readHistory())

  const addEntry = (e: HistoryEntry) => setHistory((h) => writeHistory([e, ...h]))
  const onClear = () => {
    clearHistory()
    setHistory([])
  }

  return (
    <div className="app">
      <nav className="app-tabs">
        <button className={tab === 'test' ? 'is-on' : ''} onClick={() => setTab('test')}>
          测评
        </button>
        <button className={tab === 'report' ? 'is-on' : ''} onClick={() => setTab('report')}>
          报告
        </button>
        <button className={tab === 'settings' ? 'is-on' : ''} onClick={() => setTab('settings')}>
          设置
        </button>
      </nav>
      <div style={{ display: tab === 'test' ? 'contents' : 'none' }}>
        <TestPage onComplete={addEntry} onViewReport={() => setTab('report')} />
      </div>
      <div style={{ display: tab === 'report' ? 'contents' : 'none' }}>
        <Report history={history} onClear={onClear} onGoTest={() => setTab('test')} />
      </div>
      <div style={{ display: tab === 'settings' ? 'contents' : 'none' }}>
        <SettingsPage />
      </div>
    </div>
  )
}
