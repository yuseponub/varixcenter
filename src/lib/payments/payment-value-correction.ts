/**
 * Corregir el valor de un pago de consulta/procedimiento.
 *
 * Logica pura compartida por el dialogo "Corregir Valor" y la accion de
 * servidor: a partir del pago vigente y lo que escribio la persona, arma el
 * payload del RPC `corregir_valor_pago` y valida lo mismo que exige la base
 * (suma de items = subtotal, suma de metodos = total, total > 0).
 *
 * Reglas del negocio que se conservan (061): el total NO tiene que ser igual
 * a subtotal - descuento; solo se sugiere. El descuento no se edita aqui.
 */

export const PAYMENT_VALUE_EDIT_MOTIVO = 'Valor editado por error'
export const PAYMENT_VALUE_EDIT_NOTA_MAX = 300

export type CorrectableMethodKind = 'efectivo' | 'tarjeta' | 'transferencia' | 'nequi'

export interface CorrectableItem {
  id: string
  service_name: string
  quantity: number
  unit_price: number
}

export interface CorrectableMethod {
  id: string
  metodo: CorrectableMethodKind
  monto: number
  comprobante_path: string | null
}

export interface CorrectablePayment {
  subtotal: number
  descuento: number
  total: number
  items: CorrectableItem[]
  methods: CorrectableMethod[]
}

export interface PaymentValueDraft {
  /** Precio unitario por item, tal como esta en cada input (texto). */
  itemPrices: Record<string, string>
  /** Cantidad por item, tal como esta en cada input (texto). */
  itemQuantities: Record<string, string>
  /** Total del pago tal como esta en el input (texto). */
  total: string
  /** Monto por metodo (solo se usa cuando hay mas de un metodo). */
  methodAmounts: Record<string, string>
}

export interface PaymentValuePayload {
  items: Array<{ item_id: string; unit_price: number; quantity: number }>
  total: number
  methods: Array<{
    metodo: CorrectableMethodKind
    monto: number
    comprobante_path: string | null
  }>
}

export type PaymentValueCorrectionResult =
  | { ok: true; payload: PaymentValuePayload; subtotal: number }
  | { ok: false; error: string }

/**
 * Convierte lo que escribio la persona en un numero de pesos.
 * Acepta "150000", "150000.50" y separadores de miles con punto ("150.000").
 * Devuelve null si esta vacio, no es numero o es negativo.
 */
export function parseMoneyInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  // "150.000" (miles con punto) -> "150000"; "150.000,50" -> "150000.50"
  const normalized = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(trimmed)
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed.replace(',', '.')

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null

  const value = Number(normalized)
  if (!Number.isFinite(value) || value < 0) return null
  return value
}

function parseQuantityInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return value >= 1 ? value : null
}

function sameMoney(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100)
}

/** Total que se sugiere al cambiar precios: subtotal menos el descuento vigente. */
export function suggestedTotal(subtotal: number, descuento: number): number {
  return Math.max(0, Math.round((subtotal - descuento) * 100) / 100)
}

/** Deja los inputs con los valores vigentes, para abrir el dialogo. */
export function draftFromPayment(payment: CorrectablePayment): PaymentValueDraft {
  return {
    itemPrices: Object.fromEntries(
      payment.items.map((item) => [item.id, String(item.unit_price)])
    ),
    itemQuantities: Object.fromEntries(
      payment.items.map((item) => [item.id, String(item.quantity)])
    ),
    total: String(payment.total),
    methodAmounts: Object.fromEntries(
      payment.methods.map((method) => [method.id, String(method.monto)])
    ),
  }
}

/** Subtotal con los precios/cantidades del borrador, o null si algo no es valido. */
export function computeDraftSubtotal(
  payment: CorrectablePayment,
  draft: PaymentValueDraft
): number | null {
  let subtotal = 0
  for (const item of payment.items) {
    const price = parseMoneyInput(draft.itemPrices[item.id] ?? '')
    const quantity = parseQuantityInput(draft.itemQuantities[item.id] ?? '')
    if (price === null || quantity === null) return null
    subtotal += price * quantity
  }
  return Math.round(subtotal * 100) / 100
}

/**
 * Valida el borrador y arma el payload completo del RPC.
 * Con un solo metodo de pago, su monto se ajusta solo al total nuevo. Con
 * varios, la persona reparte los montos y la suma debe cuadrar con el total.
 * Falla si algun valor no es valido o si nada cambio respecto a lo registrado.
 */
export function buildPaymentValueCorrection(
  payment: CorrectablePayment,
  draft: PaymentValueDraft
): PaymentValueCorrectionResult {
  const items: PaymentValuePayload['items'] = []
  let subtotal = 0
  let itemsChanged = false

  for (const item of payment.items) {
    const price = parseMoneyInput(draft.itemPrices[item.id] ?? '')
    if (price === null) {
      return { ok: false, error: `El precio de ${item.service_name} debe ser un numero valido` }
    }
    const quantity = parseQuantityInput(draft.itemQuantities[item.id] ?? '')
    if (quantity === null) {
      return { ok: false, error: `La cantidad de ${item.service_name} debe ser al menos 1` }
    }

    subtotal += price * quantity
    if (!sameMoney(price, item.unit_price) || quantity !== item.quantity) {
      itemsChanged = true
    }
    items.push({ item_id: item.id, unit_price: price, quantity })
  }
  subtotal = Math.round(subtotal * 100) / 100

  const total = parseMoneyInput(draft.total)
  if (total === null) {
    return { ok: false, error: 'El total debe ser un numero valido' }
  }
  if (total <= 0) {
    return { ok: false, error: 'El total debe ser mayor a 0' }
  }

  if (payment.methods.length === 0) {
    return { ok: false, error: 'El pago no tiene metodos de pago' }
  }

  let methods: PaymentValuePayload['methods']
  if (payment.methods.length === 1) {
    const [only] = payment.methods
    methods = [{ metodo: only.metodo, monto: total, comprobante_path: only.comprobante_path }]
  } else {
    methods = []
    let methodsSum = 0
    for (const method of payment.methods) {
      const monto = parseMoneyInput(draft.methodAmounts[method.id] ?? '')
      if (monto === null || monto <= 0) {
        return { ok: false, error: 'Cada metodo de pago debe tener un monto mayor a 0' }
      }
      methodsSum += monto
      methods.push({ metodo: method.metodo, monto, comprobante_path: method.comprobante_path })
    }
    if (!sameMoney(methodsSum, total)) {
      return { ok: false, error: 'La suma de los metodos de pago debe ser igual al total' }
    }
  }

  const totalChanged = !sameMoney(total, payment.total)
  const methodsChanged = methods.some(
    (method, index) => !sameMoney(method.monto, payment.methods[index].monto)
  )

  if (!itemsChanged && !totalChanged && !methodsChanged) {
    return { ok: false, error: 'No hay ningun valor distinto al registrado' }
  }

  return { ok: true, payload: { items, total, methods }, subtotal }
}
