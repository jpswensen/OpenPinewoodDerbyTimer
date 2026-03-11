import { useEffect, useMemo, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'

function useDarkMode() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  return { isDark, setIsDark }
}

function HomePage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">PWDTimer</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Modernized race management (FastAPI + React + SQLite + ESP32 firmware).
      </p>
    </div>
  )
}

function SettingsPage() {
  return (
    <div className="space-y-2">
      <h2 className="text-xl font-semibold">Settings</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Connection and theme settings will live here.
      </p>
    </div>
  )
}

export default function App() {
  const { isDark, setIsDark } = useDarkMode()

  const nav = useMemo(
    () => [
      { to: '/', label: 'Home' },
      { to: '/settings', label: 'Settings' },
    ],
    [],
  )

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-4 text-sm">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <button
            type="button"
            className="rounded-md border border-slate-200 px-3 py-1 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            onClick={() => setIsDark(!isDark)}
          >
            {isDark ? 'Dark' : 'Light'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
