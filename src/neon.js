import { createClient } from '@neondatabase/neon-js'
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters'

const authUrl = import.meta.env.VITE_NEON_AUTH_URL
const dataApiUrl = import.meta.env.VITE_NEON_DATA_API_URL

if (!authUrl) {
  throw new Error('VITE_NEON_AUTH_URL não configurada')
}

if (!dataApiUrl) {
  throw new Error('VITE_NEON_DATA_API_URL não configurada')
}

export const neon = createClient({
  auth: {
    adapter: BetterAuthReactAdapter(),
    url: authUrl,
  },
  dataApi: {
    url: dataApiUrl,
  },
})
