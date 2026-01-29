'use client'

import { useActionState, useEffect, useState } from 'react'
import type { MediasProduct } from '@/types/medias/products'
import { PRODUCT_TYPES, PRODUCT_SIZES } from '@/types/medias/products'
import type { ProductActionState } from '@/app/(protected)/medias/productos/actions'
import { createProduct, updateProduct } from '@/app/(protected)/medias/productos/actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ProductFormProps {
  product?: MediasProduct | null
  onSuccess?: () => void
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function ProductForm({ product, onSuccess }: ProductFormProps) {
  const isEditing = Boolean(product)

  const boundUpdateAction = product
    ? updateProduct.bind(null, product.id)
    : createProduct

  const [state, formAction, isPending] = useActionState<ProductActionState | null, FormData>(
    boundUpdateAction,
    null
  )

  const [precio, setPrecio] = useState(product?.precio || 0)
  const [tipo, setTipo] = useState<string>(product?.tipo || '')
  const [talla, setTalla] = useState<string>(product?.talla || '')

  useEffect(() => {
    if (state?.success) {
      onSuccess?.()
    }
  }, [state?.success, onSuccess])

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {/* Tipo (only editable on create) */}
      <div className="space-y-2">
        <Label htmlFor="tipo">Tipo *</Label>
        {isEditing ? (
          <>
            <Input
              id="tipo_display"
              value={product?.tipo}
              disabled
              className="bg-muted"
            />
            <input type="hidden" name="tipo" value={product?.tipo} />
            <p className="text-xs text-muted-foreground">El tipo no puede ser modificado</p>
          </>
        ) : (
          <>
            <Select value={tipo} onValueChange={setTipo} name="tipo" required>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tipo" />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="tipo" value={tipo} />
          </>
        )}
        {state?.errors?.tipo && (
          <p className="text-sm text-destructive">{state.errors.tipo[0]}</p>
        )}
      </div>

      {/* Talla (only editable on create) */}
      <div className="space-y-2">
        <Label htmlFor="talla">Talla *</Label>
        {isEditing ? (
          <>
            <Input
              id="talla_display"
              value={product?.talla}
              disabled
              className="bg-muted"
            />
            <input type="hidden" name="talla" value={product?.talla} />
            <p className="text-xs text-muted-foreground">La talla no puede ser modificada</p>
          </>
        ) : (
          <>
            <Select value={talla} onValueChange={setTalla} name="talla" required>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar talla" />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_SIZES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="talla" value={talla} />
          </>
        )}
        {state?.errors?.talla && (
          <p className="text-sm text-destructive">{state.errors.talla[0]}</p>
        )}
      </div>

      {/* Codigo (only editable on create) */}
      <div className="space-y-2">
        <Label htmlFor="codigo">Codigo *</Label>
        {isEditing ? (
          <>
            <Input
              id="codigo_display"
              value={product?.codigo}
              disabled
              className="bg-muted font-mono"
            />
            <input type="hidden" name="codigo" value={product?.codigo} />
            <p className="text-xs text-muted-foreground">El codigo no puede ser modificado</p>
          </>
        ) : (
          <Input
            id="codigo"
            name="codigo"
            placeholder="Ej: 74113"
            className="font-mono"
            required
          />
        )}
        {state?.errors?.codigo && (
          <p className="text-sm text-destructive">{state.errors.codigo[0]}</p>
        )}
      </div>

      {/* Precio (always editable) */}
      <div className="space-y-2">
        <Label htmlFor="precio">Precio (COP) *</Label>
        <Input
          id="precio"
          name="precio"
          type="number"
          min={1}
          step="any"
          placeholder="0"
          value={precio}
          onChange={(e) => setPrecio(parseFloat(e.target.value) || 0)}
          required
        />
        {precio > 0 && (
          <p className="text-sm text-muted-foreground">{formatCurrency(precio)}</p>
        )}
        {state?.errors?.precio && (
          <p className="text-sm text-destructive">{state.errors.precio[0]}</p>
        )}
      </div>

      {/* Hidden field for activo */}
      <input type="hidden" name="activo" value="true" />

      {/* Submit Button */}
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Guardando...' : isEditing ? 'Actualizar Precio' : 'Crear Producto'}
        </Button>
      </div>
    </form>
  )
}
