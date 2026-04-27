import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Users,
  Flame,
  Play,
  Trophy,
  Award,
  Settings,
  Upload,
  Timer,
  ArrowRight,
} from 'lucide-react'

import { Card } from '../components/ui/Card'
import { listGroups } from '../api/endpoints/groups'
import { listRacers } from '../api/endpoints/racers'
import { listRaces } from '../api/endpoints/races'

type QuickAction = {
  to: string
  label: string
  description: string
  icon: React.ReactNode
  color: string
}

const quickActions: QuickAction[] = [
  {
    to: '/racers',
    label: 'Manage Racers',
    description: 'Add, edit, or import racers and groups',
    icon: <Users size={22} />,
    color: 'from-blue-500 to-blue-600',
  },
  {
    to: '/heats',
    label: 'Schedule Heats',
    description: 'Create races and generate heat brackets',
    icon: <Flame size={22} />,
    color: 'from-orange-500 to-orange-600',
  },
  {
    to: '/race',
    label: 'Run Race',
    description: 'Connect to timer and run live heats',
    icon: <Play size={22} />,
    color: 'from-emerald-500 to-emerald-600',
  },
  {
    to: '/results',
    label: 'View Results',
    description: 'Standings, times, and PDF export',
    icon: <Trophy size={22} />,
    color: 'from-amber-500 to-amber-600',
  },
  {
    to: '/certificates',
    label: 'Certificates',
    description: 'Generate winner & participation certificates',
    icon: <Award size={22} />,
    color: 'from-purple-500 to-purple-600',
  },
  {
    to: '/settings',
    label: 'Settings',
    description: 'Timer connection, lanes, and sound',
    icon: <Settings size={22} />,
    color: 'from-slate-500 to-slate-600',
  },
]

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  accent: string
}) {
  return (
    <Card className="flex items-center gap-4">
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-sm`}
      >
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
      </div>
    </Card>
  )
}

export function HomePage() {
  const groupsQ = useQuery({ queryKey: ['groups'], queryFn: listGroups })
  const racersQ = useQuery({ queryKey: ['racers', null], queryFn: () => listRacers() })
  const racesQ = useQuery({ queryKey: ['races'], queryFn: listRaces })

  const groupCount = groupsQ.data?.length ?? 0
  const racerCount = racersQ.data?.length ?? 0
  const raceCount = racesQ.data?.length ?? 0

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md">
          <Timer size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pinewood Derby Timer</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage racers, schedule heats, and run your derby — all in one place.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Groups"
          value={groupCount}
          icon={<Upload size={22} />}
          accent="from-indigo-500 to-indigo-600"
        />
        <StatCard
          label="Racers"
          value={racerCount}
          icon={<Users size={22} />}
          accent="from-blue-500 to-blue-600"
        />
        <StatCard
          label="Races"
          value={raceCount}
          icon={<Trophy size={22} />}
          accent="from-emerald-500 to-emerald-600"
        />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) => (
            <Link key={action.to} to={action.to} className="group">
              <Card className="flex h-full items-start gap-4 transition-shadow hover:shadow-md">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${action.color} text-white shadow-sm`}
                >
                  {action.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 font-semibold text-slate-900 dark:text-white">
                    {action.label}
                    <ArrowRight
                      size={14}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </div>
                  <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                    {action.description}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
