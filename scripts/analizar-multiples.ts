import * as fs from 'fs'

const data = JSON.parse(fs.readFileSync('scripts/citas-matched-fonetico.json', 'utf-8'))
const multiples = data.filter((c: any) => c.status === 'multiple')

// Analizar cuáles son obvios (primer candidato coincide muy bien)
const obvious: any[] = []
const needReview: any[] = []

multiples.forEach((c: any) => {
  const nombre = c.nombreExtraido?.toUpperCase() || ''
  const cand1 = c.candidates?.[0]
  if (!cand1) return

  const cand1Name = `${cand1.nombre} ${cand1.apellido}`.toUpperCase()

  // Verificar si el primer candidato coincide muy bien
  const nombreWords = nombre.split(/\s+/).filter((w: string) => w.length > 2)
  const cand1Words = cand1Name.split(/\s+/).filter((w: string) => w.length > 2)

  let matchCount = 0
  for (const w of nombreWords) {
    if (cand1Words.some((cw: string) => cw.includes(w) || w.includes(cw))) {
      matchCount++
    }
  }

  const matchRatio = nombreWords.length > 0 ? matchCount / nombreWords.length : 0

  if (matchRatio >= 0.7) {
    obvious.push({ ...c, suggestedMatch: cand1 })
  } else {
    needReview.push(c)
  }
})

console.log(`=== MATCHES OBVIOS (${obvious.length}) - Asignar candidato 1 ===\n`)
obvious.forEach((c, i) => {
  console.log(
    `${i + 1}. ${c.nombreExtraido} → ${c.suggestedMatch.nombre} ${c.suggestedMatch.apellido} (CC ${c.suggestedMatch.cedula})`
  )
})

console.log(`\n\n=== NECESITAN REVISIÓN MANUAL (${needReview.length}) ===\n`)
needReview.forEach((c, i) => {
  console.log(`${i + 1}. ${c.nombreExtraido}`)
  console.log(`   Summary: ${c.summary}`)
  c.candidates?.slice(0, 3).forEach((p: any, j: number) => {
    console.log(`   [${j + 1}] ${p.nombre} ${p.apellido} (CC ${p.cedula})`)
  })
  console.log()
})
