import { NextRequest, NextResponse } from 'next/server'
import { parseInvoiceImage } from '@/lib/services/invoice-ocr'

export const maxDuration = 60 // Allow up to 60 seconds for OCR processing

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido. Use JPG, PNG, WebP o PDF.' },
        { status: 400 }
      )
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'Archivo muy grande. Maximo 10MB.' },
        { status: 400 }
      )
    }

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // Call OCR service
    const result = await parseInvoiceImage(base64, file.type)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    // Transform response to match expected format
    const response = {
      proveedor: result.data.proveedor,
      fecha_factura: result.data.fecha_factura,
      numero_factura: result.data.numero_factura,
      total: result.data.total,
      productos: result.data.items.map((item) => ({
        descripcion: item.descripcion,
        codigo_producto: null, // OCR doesn't know our product codes
        cantidad: item.cantidad,
        costo_unitario: item.precio_unitario,
        confidence: item.confidence,
        needs_review: item.needs_review,
      })),
      overall_confidence: result.data.overall_confidence,
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('OCR error:', error)
    return NextResponse.json(
      { error: 'Error al procesar la factura' },
      { status: 500 }
    )
  }
}
