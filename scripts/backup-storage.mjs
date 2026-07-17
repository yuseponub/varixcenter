// Descarga todos los buckets de Supabase Storage a backups/storage/
// Uso: node --env-file=.env.local scripts/backup-storage.mjs
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)
const OUT = path.join(process.cwd(), 'backups', 'storage')

async function listAll(bucket, prefix = '') {
  const files = []
  let offset = 0
  const limit = 1000
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`)
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id === null) {
        // carpeta: recursar
        files.push(...(await listAll(bucket, full)))
      } else {
        files.push(full)
      }
    }
    if (data.length < limit) break
    offset += limit
  }
  return files
}

const { data: buckets, error: bErr } = await supabase.storage.listBuckets()
if (bErr) {
  console.error('Error listando buckets:', bErr.message)
  process.exit(1)
}
console.log(`Buckets encontrados: ${buckets.map((b) => b.name).join(', ') || '(ninguno)'}`)

let total = 0
let skipped = 0
let failed = 0
for (const bucket of buckets) {
  const files = await listAll(bucket.name)
  console.log(`\n[${bucket.name}] ${files.length} archivos`)
  for (const file of files) {
    const dest = path.join(OUT, bucket.name, file)
    if (existsSync(dest)) {
      skipped++
      continue
    }
    const { data, error } = await supabase.storage.from(bucket.name).download(file)
    if (error) {
      console.error(`  FALLO ${file}: ${error.message}`)
      failed++
      continue
    }
    await mkdir(path.dirname(dest), { recursive: true })
    await writeFile(dest, Buffer.from(await data.arrayBuffer()))
    total++
    if (total % 100 === 0) console.log(`  ...${total} descargados`)
  }
}
console.log(`\nListo: ${total} descargados, ${skipped} ya existían, ${failed} fallidos`)
process.exit(failed > 0 ? 1 : 0)
