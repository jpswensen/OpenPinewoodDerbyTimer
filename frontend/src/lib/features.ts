// Feature flags. Sourced from Vite env vars (VITE_*) at build time.
// Defaults are conservative: WiFi/TCP/mDNS hidden until explicitly enabled,
// since the current firmware is serial-only.

function readBoolEnv(value: unknown, fallback: boolean): boolean {
  if (typeof value !== 'string') return fallback
  const v = value.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
  return fallback
}

export const FEATURES = {
  // Show TCP/network connection mode + mDNS discovery UI.
  // Default: false (firmware does not currently support WiFi).
  wifi: readBoolEnv(import.meta.env.VITE_ENABLE_WIFI, false),
} as const
