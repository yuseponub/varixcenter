import { createClient } from '@supabase/supabase-js'
import { stat, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
const SRC = path.join(process.cwd(), 'backups', 'storage')
async function walk(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(f)))
    else out.push(f)
  }
  return out
}
async function remoteSizes(bucket, prefix = '') {
  const m = new Map()
  let offset = 0
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw new Error(error.message)
    for (const it of data) {
      const full = prefix ? `${prefix}/${it.name}` : it.name
      if (it.id === null) for (const [k, v] of await remoteSizes(bucket, full)) m.set(k, v)
      else m.set(full, it.metadata?.size ?? -1)
    }
    if (data.length < 1000) break
    offset += 1000
  }
  return m
}
for (const bucket of await readdir(SRC)) {
  const remote = await remoteSizes(bucket)
  let bad = 0
  for (const f of await walk(path.join(SRC, bucket))) {
    const rel = path.relative(path.join(SRC, bucket), f).split(path.sep).join('/')
    const localSize = (await stat(f)).size
    const remoteSize = remote.get(rel)
    if (remoteSize !== localSize) {
      bad++
      console.log(`MISMATCH ${rel}: local=${localSize} remoto=${remoteSize} -> resubiendo`)
      const { error } = await supabase.storage.from(bucket).upload(rel, await readFile(f), { upsert: true })
      console.log(error ? `  FALLO: ${error.message}` : '  OK')
    }
  }
  console.log(`[${bucket}] verificados por tamano, mismatches=${bad}`)
}
