import { NavLink, Outlet } from 'react-router-dom'
import { useMemo, useState } from 'react'

import { useTheme } from '../context/theme'
import { Button } from './ui/Button'
import { cn } from '../lib/cn'

type NavItem = { to: string; label: string }

export function Layout() {
  const { mode, toggle } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)

  const nav = useMemo<NavItem[]>(
    () => [
      { to: '/', label: 'Home' },
      { to: '/racers', label: 'Racers' },
      { to: '/heats', label: 'Heats' },
      { to: '/race', label: 'Race' },
      { to: '/results', label: 'Results' },
      { to: '/certificates', label: 'Certificates' },
      { to: '/settings', label: 'Settings' },
    ],
    [],
  )

  return (
    <div className="min-h-full">
      <header className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="md:hidden" onClick={() => setMobileOpen((v) => !v)}>
              Menu
            </Button>
            <div className="text-sm font-semibold">PWDTimer</div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={toggle}>
              {mode === 'dark' ? 'Dark' : 'Light'}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl gap-4 px-4 py-4">
        <aside
          className={cn(
            'no-print w-56 shrink-0 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900',
            'md:block',
            mobileOpen ? 'block' : 'hidden',
          )}
        >
          <nav className="flex flex-col">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
                    isActive ? 'bg-slate-100 font-semibold dark:bg-slate-800' : null,
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
