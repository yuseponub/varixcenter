import { createHash } from 'node:crypto'

export const COLFACT_PDF_BUCKET = 'wimax-invoices'
const MAX_PDF_BYTES = 10 * 1024 * 1024

function normalizedIdentity(invoice) {
  const numero = String(invoice?.numero ?? '').trim().toUpperCase()
  const cufe = String(invoice?.cufe ?? '').trim().toLowerCase()
  if (!/^FE\d+$/.test(numero) || !/^[0-9a-f]{96}$/.test(cufe)) {
    throw new Error('COLFACT_PDF: identidad de factura invalida')
  }
  return { numero, cufe }
}

export function invoicePdfMetadata(invoice, pdfBytes) {
  const { numero, cufe } = normalizedIdentity(invoice)
  const bytes = Buffer.from(pdfBytes ?? [])
  if (
    bytes.length < 5 ||
    bytes.length > MAX_PDF_BYTES ||
    bytes.subarray(0, 5).toString('ascii') !== '%PDF-'
  ) {
    throw new Error('COLFACT_PDF: contenido PDF invalido')
  }
  return {
    path: `facturas/${numero}-${cufe}.pdf`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
    bytes,
  }
}

export async function storeInvoicePdf({ supabase, invoice, pdfBytes }) {
  const metadata = invoicePdfMetadata(invoice, pdfBytes)
  const bucket = supabase.storage.from(COLFACT_PDF_BUCKET)
  const { error: uploadError } = await bucket.upload(metadata.path, metadata.bytes, {
    cacheControl: '31536000',
    contentType: 'application/pdf',
    upsert: false,
  })

  if (uploadError) {
    // Deterministic immutable paths make retries safe. If the first attempt
    // reached Storage but its following DB transaction failed, accept the
    // existing object only after comparing its SHA-256 byte-for-byte.
    const { data: existing, error: downloadError } = await bucket.download(metadata.path)
    if (downloadError || !existing) {
      throw new Error(`COLFACT_STORAGE: ${uploadError.message}`)
    }
    const existingBytes = Buffer.from(await existing.arrayBuffer())
    const existingSha = createHash('sha256').update(existingBytes).digest('hex')
    if (existingSha !== metadata.sha256) {
      throw new Error('COLFACT_STORAGE: el PDF existente tiene otro SHA-256')
    }
  }

  return {
    path: metadata.path,
    sha256: metadata.sha256,
    size: metadata.size,
  }
}
