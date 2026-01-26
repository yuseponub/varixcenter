import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function applyMigration() {
  console.log('Checking if diagrama_piernas column exists...')

  // Try to select the column to see if it exists
  const { error: checkError } = await supabase
    .from('medical_records')
    .select('diagrama_piernas')
    .limit(1)

  if (checkError && checkError.message.includes('does not exist')) {
    console.log('Column does not exist. Applying migration...')

    // Use the database function to execute SQL (if available)
    // Otherwise, provide instructions
    console.log('\n⚠️  Cannot apply migration directly via REST API.')
    console.log('\n📋 Please run this SQL in Supabase Dashboard -> SQL Editor:\n')
    console.log('--------------------------------------------------')
    console.log(`ALTER TABLE medical_records
ADD COLUMN IF NOT EXISTS diagrama_piernas TEXT;

COMMENT ON COLUMN medical_records.diagrama_piernas IS
'JSON string containing fabric.js objects representing vein markings on leg diagram. Editable - strokes can be added/removed.';`)
    console.log('--------------------------------------------------')
    console.log('\n🔗 Go to: https://supabase.com/dashboard/project/gojqjfuszghfqvdnjjxa/sql/new')

  } else if (checkError) {
    console.log('Error checking column:', checkError.message)
  } else {
    console.log('✅ Column diagrama_piernas already exists!')
  }
}

applyMigration()
