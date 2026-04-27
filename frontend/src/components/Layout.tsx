import { NavLink, Outlet } from 'react-router-dom'
import { useMemo, useState } from 'react'
import {
  Home,
  Users,
  Flame,
  Play,
  Trophy,
  Award,
  Settings,
  Sun,
  Moon,
  Menu,
  X,
  Timer,
} from 'lucide-react'

import { useTheme } from '../context/theme'
import { cn } from '../lib/cn'

type NavItem = { to: string; label: string; icon: React.ReactNode }

export function Layout() {
  const { mode, toggle } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)

  const nav = useMemo<NavItem[]>(
    () => [
      { to: '/', label: 'Home', icon: <Home size={18} /> },
      { to: '/racers', label: 'Racers', icon: <Users size={18} /> },
      { to: '/heats', label: 'Heats', icon: <Flame size={18} /> },
      { to: '/race', label: 'Race', icon: <Play size={18} /> },
      { to: '/results', label: 'Results', icon: <Trophy size={18} /> },
      { to: '/certificates', label: 'Certificates', icon: <Award size={18} /> },
      { to: '/settings', label: 'Settings', icon: <Settings size={18} /> },
    ],
    [],
  )

  return (
    <div className="min-h-full">
      <header className="no-print sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex items-center gap-6 px-6 py-0">
          {/* Logo / Title */}
          <NavLink to="/" className="flex shrink-0 items-center gap-2.5 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm">
              <Timer size={18} />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              PWDTimer
            </span>
          </NavLink>

          {/* Desktop nav */}
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200',
                  )
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Right controls */}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
            >
              {mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 md:hidden"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile nav dropdown */}
        {mobileOpen && (
          <nav className="border-t border-slate-200/80 bg-white px-4 pb-3 pt-2 dark:border-slate-800 dark:bg-slate-950 md:hidden">
            <div className="flex flex-col gap-1">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
                    )
                  }
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main className="w-full px-6 py-6">
        <Outlet />
      </main>
    </div>
  )
}
