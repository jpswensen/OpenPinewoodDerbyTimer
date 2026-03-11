import { Route, Routes } from 'react-router-dom'

import { Layout } from '../components/Layout'
import { HomePage } from '../pages/HomePage'
import { RacersPage } from '../pages/RacersPage'
import { HeatsPage } from '../pages/HeatsPage'
import { RacePage } from '../pages/RacePage'
import { ResultsPage } from '../pages/ResultsPage'
import { CertificatesPage } from '../pages/CertificatesPage'
import { SettingsPage } from '../pages/SettingsPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="/racers" element={<RacersPage />} />
        <Route path="/heats" element={<HeatsPage />} />
        <Route path="/race" element={<RacePage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/certificates" element={<CertificatesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
