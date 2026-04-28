// Feature flags. Sourced from Vite env vars (VITE_*) at build time.
// The firmware exposes a SoftAP + UDP transport simultaneously with serial
// (PWDTIMER_ENABLE_WIFI=1, default ON), so the Wi-Fi UI is on by default.
// Set VITE_ENABLE_WIFI=0 at build time to hide the network/UDP modes.

function readBoolEnv(value: unknown, fallback: boolean): boolean {
  if (typeof value !== 'string') return fallback
  const v = value.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
  return fallback
}

export const FEATURES = {
  // Show TCP (mDNS) and Wi-Fi (UDP) connection modes in Settings.
  wifi: readBoolEnv(import.meta.env.VITE_ENABLE_WIFI, true),
} as const
