import test from 'node:test'
import assert from 'node:assert/strict'
import { invoicePdfMetadata, storeInvoicePdf } from '../lib/colfact-pdf.mjs'

const invoice = { numero: 'FE7867', cufe: 'a'.repeat(96) }
const bytes = Buffer.from('%PDF-1.7\ncontenido')

test('genera ruta inmutable y SHA-256 para el PDF oficial', () => {
  const result = invoicePdfMetadata(invoice, bytes)
  assert.equal(result.path, `facturas/FE7867-${'a'.repeat(96)}.pdf`)
  assert.match(result.sha256, /^[0-9a-f]{64}$/)
  assert.equal(result.size, bytes.length)
})

test('un reintento acepta el mismo objeto existente pero no uno sustituido', async () => {
  const uploaded = new Map()
  const bucket = {
    async upload(path, body) {
      if (uploaded.has(path)) return { error: { message: 'Duplicate' } }
      uploaded.set(path, Buffer.from(body))
      return { error: null }
    },
    async download(path) {
      const body = uploaded.get(path)
      return body
        ? { data: new Blob([body], { type: 'application/pdf' }), error: null }
        : { data: null, error: { message: 'Missing' } }
    },
  }
  const supabase = { storage: { from: () => bucket } }

  const first = await storeInvoicePdf({ supabase, invoice, pdfBytes: bytes })
  const retry = await storeInvoicePdf({ supabase, invoice, pdfBytes: bytes })
  assert.deepEqual(retry, first)

  uploaded.set(first.path, Buffer.from('%PDF-diferente'))
  await assert.rejects(
    storeInvoicePdf({ supabase, invoice, pdfBytes: bytes }),
    /otro SHA-256/,
  )
})
