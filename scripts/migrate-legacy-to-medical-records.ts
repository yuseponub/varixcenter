/**
 * Backwards-compatible entry point for the former one-time migration.
 *
 * The conversion is now incremental and idempotent. Prefer running it as the
 * final step of scripts/sync-access/sync.mjs, or directly with:
 *
 *   node scripts/sync-access/legacy-medical-resync.mjs
 *
 * This wrapper remains so existing operational commands keep working.
 */

import { createClient } from '@supabase/supabase-js'
import { syncLegacyMedicalRecords } from './sync-access/legacy-medical-resync.mjs'

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or service role key'
  )
  process.exit(1)
}

const dryRun = process.argv.includes('--dry-run')
const limitArgument = process.argv.find((argument) =>
  argument.startsWith('--limit=')
)
const limit = limitArgument
  ? Number.parseInt(limitArgument.split('=')[1], 10)
  : null

if (limitArgument && (!Number.isFinite(limit) || (limit ?? -1) < 0)) {
  console.error('--limit must be a non-negative integer')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

syncLegacyMedicalRecords(supabase, { dryRun, limit })
  .then((stats) => {
    console.log('Legacy medical resync complete.', JSON.stringify(stats))
    process.exit(stats.medical_errors > 0 ? 1 : 0)
  })
  .catch((error: Error) => {
    console.error('Legacy medical resync failed:', error.message)
    process.exit(1)
  })
