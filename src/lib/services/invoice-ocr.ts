/**
 * Invoice OCR Service
 *
 * Uses OpenAI GPT-4o vision API to extract structured data from purchase invoices.
 * Returns parsed data with confidence scores for user review before saving.
 */

/**
 * Parsed item from invoice
 */
export interface ParsedInvoiceItem {
  descripcion: string
  cantidad: number
  precio_unitario: number | null
  /** Confidence score for this item (0-1) */
  confidence: number
  /** Flag for items that need manual review */
  needs_review: boolean
}

/**
 * Parsed invoice data with confidence scores
 */
export interface ParsedInvoice {
  proveedor: string | null
  fecha_factura: string | null
  numero_factura: string | null
  total: number | null
  items: ParsedInvoiceItem[]
  /** Overall confidence score (0-1) */
  overall_confidence: number
  /** Raw response for debugging */
  raw_response?: string
}

/**
 * OCR result wrapper
 */
export type OCRResult =
  | { success: true; data: ParsedInvoice }
  | { success: false; error: string }

/**
 * OpenAI structured output schema for invoice extraction
 */
const INVOICE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    proveedor: {
      type: ['string', 'null'],
      description: 'Nombre del proveedor o vendedor'
    },
    fecha_factura: {
      type: ['string', 'null'],
      description: 'Fecha de la factura en formato ISO (YYYY-MM-DD)'
    },
    numero_factura: {
      type: ['string', 'null'],
      description: 'Numero de factura o documento'
    },
    total: {
      type: ['number', 'null'],
      description: 'Total de la factura en pesos colombianos'
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          descripcion: {
            type: 'string',
            description: 'Descripcion del producto'
          },
          cantidad: {
            type: 'number',
            description: 'Cantidad del producto'
          },
          precio_unitario: {
            type: ['number', 'null'],
            description: 'Precio unitario en pesos colombianos'
          }
        },
        required: ['descripcion', 'cantidad'],
        additionalProperties: false
      }
    },
    confidence: {
      type: 'number',
      description: 'Confianza general de la extraccion (0-1)'
    }
  },
  required: ['items', 'confidence'],
  additionalProperties: false
} as const

/**
 * System prompt for invoice OCR
 */
const SYSTEM_PROMPT = `Eres un experto en extraer datos de facturas de compra de proveedores.

INSTRUCCIONES:
1. Extrae todos los productos listados con sus cantidades y precios unitarios
2. Identifica el proveedor/vendedor de la factura
3. Extrae la fecha de la factura (convertir a formato YYYY-MM-DD)
4. Extrae el numero de factura si esta visible
5. Extrae el total de la factura

IMPORTANTE:
- Los montos estan en pesos colombianos (COP)
- Si no puedes leer un campo claramente, usa null
- La confianza debe reflejar que tan legible es la factura (0.0 = ilegible, 1.0 = perfectamente claro)
- Para fechas como "26/01/2026" convertir a "2026-01-26"
- Si hay productos sin precio unitario visible, registrar precio_unitario como null

PRODUCTOS ESPERADOS (medias de compresion):
- Muslo (Muslo M, Muslo L, Muslo XL)
- Panty (Panty M, Panty L, Panty XL)
- Rodilla (Rodilla M, Rodilla L, Rodilla XL, Rodilla Plus, Rodilla Plus XL)`

/**
 * Parse an invoice image using OpenAI GPT-4o vision API
 *
 * @param base64Image - Base64 encoded image (with or without data URI prefix)
 * @param mimeType - Image MIME type (default: image/jpeg)
 * @returns Parsed invoice data or error
 */
export async function parseInvoiceImage(
  base64Image: string,
  mimeType: string = 'image/jpeg'
): Promise<OCRResult> {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return {
      success: false,
      error: 'OPENAI_API_KEY no configurado'
    }
  }

  // Remove data URI prefix if present
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '')

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extrae los datos de esta factura de compra de medias de compresion.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${cleanBase64}`,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'invoice_data',
            strict: true,
            schema: INVOICE_JSON_SCHEMA
          }
        },
        max_tokens: 4096,
        temperature: 0.1 // Low temperature for more consistent extraction
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenAI API error:', errorText)

      // Parse error for user-friendly message
      try {
        const errorJson = JSON.parse(errorText)
        const errorMessage = errorJson.error?.message || 'Error al procesar imagen'
        return {
          success: false,
          error: `Error de API: ${errorMessage}`
        }
      } catch {
        return {
          success: false,
          error: `Error de API (${response.status}): ${response.statusText}`
        }
      }
    }

    const result = await response.json()
    const content = result.choices?.[0]?.message?.content

    if (!content) {
      return {
        success: false,
        error: 'Respuesta vacia del servicio OCR'
      }
    }

    // Parse the structured response
    const parsed = JSON.parse(content) as {
      proveedor: string | null
      fecha_factura: string | null
      numero_factura: string | null
      total: number | null
      items: Array<{
        descripcion: string
        cantidad: number
        precio_unitario: number | null
      }>
      confidence: number
    }

    // Transform items with confidence scores
    const LOW_CONFIDENCE_THRESHOLD = 0.7
    const items: ParsedInvoiceItem[] = parsed.items.map((item) => {
      // Items without price need manual review
      const needsReview = item.precio_unitario === null
      // Individual item confidence based on completeness
      const itemConfidence = item.precio_unitario !== null ? parsed.confidence : parsed.confidence * 0.6

      return {
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        confidence: itemConfidence,
        needs_review: needsReview || itemConfidence < LOW_CONFIDENCE_THRESHOLD
      }
    })

    // Flag low confidence result
    const overall_confidence = parsed.confidence
    const hasLowConfidenceItems = items.some(item => item.needs_review)

    return {
      success: true,
      data: {
        proveedor: parsed.proveedor,
        fecha_factura: parsed.fecha_factura,
        numero_factura: parsed.numero_factura,
        total: parsed.total,
        items,
        overall_confidence,
        raw_response: content
      }
    }

  } catch (error) {
    console.error('Invoice OCR error:', error)

    if (error instanceof SyntaxError) {
      return {
        success: false,
        error: 'Error al procesar respuesta del servicio OCR'
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido al procesar factura'
    }
  }
}

/**
 * Validate and normalize a parsed date string
 * Returns ISO date string or null if invalid
 */
export function normalizeInvoiceDate(dateStr: string | null): string | null {
  if (!dateStr) return null

  // Try parsing as ISO date
  const isoDate = new Date(dateStr)
  if (!isNaN(isoDate.getTime())) {
    return isoDate.toISOString().split('T')[0]
  }

  // Try DD/MM/YYYY format (common in Colombia)
  const ddmmyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]
    }
  }

  return null
}
