import { Card } from '../components/ui/Card'

export function HomePage() {
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-2xl font-semibold">PWDTimer</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Modernized race management (FastAPI + React + SQLite + ESP32 firmware).
        </p>
      </Card>

      <div className="text-sm text-slate-600 dark:text-slate-300">
        Use the sidebar to manage racers, schedule heats, and run races.
      </div>
    </div>
  )
}
