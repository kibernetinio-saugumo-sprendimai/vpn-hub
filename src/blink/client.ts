import { createClient } from '@blinkdotnew/sdk'

export const blink = createClient({
  projectId: import.meta.env.VITE_BLINK_PROJECT_ID || 'vpn-admin-platform-0fpu9pd1',
  publishableKey: import.meta.env.VITE_BLINK_PUBLISHABLE_KEY || 'blnk_pk_3hPvgalA_Jw6F-7XNa4LpBrJJ7j4-BP1',
  authRequired: false,
  auth: { mode: 'managed' },
})
