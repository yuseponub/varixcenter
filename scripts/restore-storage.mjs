// Sube el contenido de backups/storage/ a un proyecto Supabase destino.
// Uso: SUPABASE_URL=https://xxx.supabase.co SUPABASE_KEY=<service_role> node scripts/restore-storage.mjs
import { createClient } from '@supabase/supabase-js'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_KEY
if (!url || !key) {
  console.error('Faltan SUPABASE_URL / SUPABASE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)
const SRC = path.join(process.cwd(), 'backups', 'storage')

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else out.push(full)
  }
  return out
}

const contentTypeFor = (file) => {
  const ext = path.extname(file).toLowerCase()
  return {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.pdf': 'application/pdf', '.webm': 'audio/webm',
  }[ext] ?? 'application/octet-stream'
}

let ok = 0, skip = 0, fail = 0
for (const bucket of await readdir(SRC)) {
  const files = await walk(path.join(SRC, bucket))
  console.log(`[${bucket}] ${files.length} archivos`)
  for (const file of files) {
    const objectPath = path.relative(path.join(SRC, bucket), file).split(path.sep).join('/')
    const body = await readFile(file)
    const { error } = await supabase.storage.from(bucket).upload(objectPath, body, {
      contentType: contentTypeFor(file),
      // upsert: la restauración de la BD ya insertó las filas de storage.objects
      // (sin bytes detrás); hay que sobreescribir esas entradas fantasma.
      upsert: true,
    })
    if (error) {
      console.error(`  FALLO ${objectPath}: ${error.message}`)
      fail++
      continue
    }
    ok++
    if (ok % 50 === 0) console.log(`  ...${ok} subidos`)
  }
}
console.log(`Listo: ${ok} subidos, ${skip} ya existían, ${fail} fallidos`)
process.exit(fail > 0 ? 1 : 0)
