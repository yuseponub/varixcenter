// Compara backups/storage/ local vs objetos en staging; sube los faltantes.
import { createClient } from '@supabase/supabase-js'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
const SRC = path.join('/mnt/c/Users/Usuario/Proyectos/varix-clinic', 'backups', 'storage')

async function walk(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(f)))
    else out.push(f)
  }
  return out
}

async function listRemote(bucket, prefix = '') {
  const files = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw new Error(error.message)
    for (const it of data) {
      const full = prefix ? `${prefix}/${it.name}` : it.name
      if (it.id === null) files.push(...(await listRemote(bucket, full)))
      else if (it.metadata && it.metadata.size > 0) files.push(full)
      else files.push(full) // registrar igual; el tamaño se valida abajo
    }
    if (data.length < 1000) break
    offset += 1000
  }
  return files
}

for (const bucket of await readdir(SRC)) {
  const local = (await walk(path.join(SRC, bucket))).map((f) =>
    path.relative(path.join(SRC, bucket), f).split(path.sep).join('/')
  )
  const remote = new Set(await listRemote(bucket))
  const missing = local.filter((f) => !remote.has(f))
  console.log(`[${bucket}] local=${local.length} remoto=${remote.size} faltan=${missing.length}`)
  for (const m of missing) {
    const body = await readFile(path.join(SRC, bucket, m))
    const { error } = await supabase.storage.from(bucket).upload(m, body, { upsert: true })
    console.log(`  reintento ${m}: ${error ? 'FALLO ' + error.message : 'OK'}`)
  }
}
