import type { PaymentItem } from '@/types/payments'

export const WIMAX_CATALOG = [
  { reference: '41651001CONSULT', description: 'CONSULTA VALORACION' },
  { reference: '41651002ECOREA', description: 'ECO REABSORCION' },
  { reference: '41651003CONTROL', description: 'CONTROL' },
  { reference: '41651004DUPLEX', description: 'DUPLEX' },
  { reference: '41651005ECOREAB', description: 'ECOREABSORCION' },
  { reference: '41651006FLEBECT', description: 'FLEBECTOMIA' },
  { reference: '41651007FOTOPLE', description: 'FOTOPLETISMO' },
  { reference: '41651009LASEREN', description: 'LASER ENDOVASCULAR' },
  { reference: '41651010PRESOT', description: 'PRESOTERAPIA' },
  { reference: '41651010LASERSU', description: 'LASER SUPERFICIAL' },
  { reference: '41651011SCANEO', description: 'SCANEO' },
  { reference: '41651012SCANEPR', description: 'SCANEO PRE-TTO' },
  { reference: '41651013DEPILAC', description: 'HIPERTRICOSIS' },
  { reference: '41651014FOTOREJ', description: 'FOTOREJUVENECIMIENTO' },
  { reference: '41651015ESCLER', description: 'ESCLEROTERAPIA SESION' },
  { reference: '41651016INSUMO', description: 'MEDIAS' },
  { reference: '41651017INSUMO', description: 'FRAGMIN' },
  { reference: 'SES', description: 'SESION' },
  { reference: 'CREMA ARNICA', description: 'CREMA ARNICA' },
  { reference: 'FRAXIPARINE', description: 'FRAXIPARINE' },
  { reference: 'VAES', description: 'VAES' },
] as const

export type WimaxCatalogReference = (typeof WIMAX_CATALOG)[number]['reference']

export interface WimaxInvoiceItemInput {
  referencia: WimaxCatalogReference | ''
  cantidad: number
  precio_unitario: number
  sourceItemId?: string
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function suggestWimaxReference(serviceName: string): WimaxCatalogReference | '' {
  const name = normalize(serviceName)

  if (/FRAXIPARINE/.test(name)) return 'FRAXIPARINE'
  if (/FRAGMIN/.test(name)) return '41651017INSUMO'
  if (/ARNICA/.test(name)) return 'CREMA ARNICA'
  if (/MEDIAS?/.test(name)) return '41651016INSUMO'
  if (/ESCLER/.test(name)) return '41651015ESCLER'
  if (/VALORACION|CONSULTA/.test(name)) return '41651001CONSULT'
  if (/CONTROL/.test(name)) return '41651003CONTROL'
  if (/DUPLEX/.test(name)) return '41651004DUPLEX'
  if (/FLEBECT/.test(name)) return '41651006FLEBECT'
  if (/FOTOPLET/.test(name)) return '41651007FOTOPLE'
  if (/LASER.*ENDOV|ENDOV.*LASER/.test(name)) return '41651009LASEREN'
  if (/LASER.*SUPER|SUPER.*LASER/.test(name)) return '41651010LASERSU'
  if (/PRESOT/.test(name)) return '41651010PRESOT'
  if (/SCANEO.*PRE|PRE.*SCANEO/.test(name)) return '41651012SCANEPR'
  if (/SCANEO/.test(name)) return '41651011SCANEO'
  if (/HIPERTRICOS|DEPIL/.test(name)) return '41651013DEPILAC'
  if (/FOTOREJ/.test(name)) return '41651014FOTOREJ'
  if (/ECO.*REA|ECOR|REABSOR/.test(name)) return '41651005ECOREAB'
  if (/\bVAES\b/.test(name)) return 'VAES'
  if (/SESION|PIERNAS/.test(name)) return 'SES'
  return ''
}

/**
 * Build editable WiMAX lines from the immutable payment snapshot. If a payment
 * has a discount, apply it to one line so the default still equals the amount
 * actually paid. The user can change the mapping, quantity and price later.
 */
export function defaultWimaxItems(
  paymentItems: PaymentItem[],
  paymentTotal: number
): WimaxInvoiceItemInput[] {
  const items = paymentItems.map((item) => ({
    referencia: suggestWimaxReference(item.service_name),
    cantidad: item.quantity,
    precio_unitario: Number(item.unit_price),
    sourceItemId: item.id,
  }))

  if (items.length === 0) return items

  const currentTotal = items.reduce(
    (sum, item) => sum + item.cantidad * item.precio_unitario,
    0
  )
  const difference = Math.round((paymentTotal - currentTotal) * 100) / 100
  if (Math.abs(difference) < 0.01) return items

  const preferredIndex = items.findIndex(
    (item) => item.cantidad === 1 && item.precio_unitario + difference > 0
  )
  const index = preferredIndex >= 0 ? preferredIndex : 0
  const adjusted =
    items[index].precio_unitario + difference / items[index].cantidad
  const rounded = Math.round(adjusted * 100) / 100

  if (rounded > 0) {
    items[index] = { ...items[index], precio_unitario: rounded }
  }
  return items
}

export function isWimaxReference(value: string): value is WimaxCatalogReference {
  return WIMAX_CATALOG.some((item) => item.reference === value)
}
