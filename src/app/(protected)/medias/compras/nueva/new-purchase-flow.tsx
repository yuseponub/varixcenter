'use client'

import { useState, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowLeft, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { InvoiceUpload } from '@/components/medias/compras/invoice-upload'
import { OCRProductReview } from '@/components/medias/compras/ocr-product-review'
import { PurchaseForm, calculatePurchaseTotal } from '@/components/medias/compras/purchase-form'
import { createPurchase, type PurchaseActionState } from '../actions'
import type { OCRInvoiceResult, PurchaseItemInput } from '@/types/medias/purchases'

interface Product {
  id: string
  codigo: string
  tipo: string
  talla: string
  precio: number
}

interface NewPurchaseFlowProps {
  products: Product[]
}

type FlowStep = 'upload' | 'review' | 'form' | 'saving'

export function NewPurchaseFlow({ products }: NewPurchaseFlowProps) {
  const router = useRouter()
  const [step, setStep] = useState<FlowStep>('upload')
  const [invoicePath, setInvoicePath] = useState<string | null>(null)
  const [ocrResult, setOcrResult] = useState<OCRInvoiceResult | null>(null)

  // Form state (controlled by PurchaseForm)
  const [proveedor, setProveedor] = useState('')
  const [fechaFactura, setFechaFactura] = useState('')
  const [numeroFactura, setNumeroFactura] = useState('')
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<PurchaseItemInput[]>([])

  const handleUploadComplete = (path: string, ocr?: OCRInvoiceResult) => {
    setInvoicePath(path)
    if (ocr && ocr.productos.length > 0) {
      setOcrResult(ocr)
      // Pre-fill form fields from OCR
      if (ocr.proveedor) setProveedor(ocr.proveedor)
      if (ocr.fecha_factura) setFechaFactura(ocr.fecha_factura)
      if (ocr.numero_factura) setNumeroFactura(ocr.numero_factura)
      setStep('review')
    } else {
      // No OCR results, go directly to form
      setStep('form')
    }
  }

  const handleOCRConfirm = (
    confirmedItems: PurchaseItemInput[],
    metadata: {
      proveedor?: string
      fecha_factura?: string
      numero_factura?: string
      total?: number
    }
  ) => {
    setItems(confirmedItems)
    if (metadata.proveedor && !proveedor) setProveedor(metadata.proveedor)
    if (metadata.fecha_factura && !fechaFactura) setFechaFactura(metadata.fecha_factura)
    if (metadata.numero_factura && !numeroFactura) setNumeroFactura(metadata.numero_factura)
    setStep('form')
  }

  const handleOCRSkip = () => {
    setStep('form')
  }

  const handleSubmit = async () => {
    if (!invoicePath) {
      toast.error('Debe subir la foto de la factura')
      return
    }

    if (!proveedor || !fechaFactura) {
      toast.error('Proveedor y fecha de factura son obligatorios')
      return
    }

    if (items.length === 0 || items.some((i) => !i.product_id)) {
      toast.error('Debe agregar al menos un producto')
      return
    }

    setStep('saving')

    try {
      // Build FormData for server action
      const formData = new FormData()
      formData.append('proveedor', proveedor)
      formData.append('fecha_factura', fechaFactura)
      formData.append('numero_factura', numeroFactura || '')
      formData.append('total', calculatePurchaseTotal(items).toString())
      formData.append('factura_path', invoicePath)
      formData.append('notas', notas || '')
      formData.append('items', JSON.stringify(items))

      const result = await createPurchase(null, formData)

      if (result.success && result.data) {
        toast.success('Compra registrada', {
          description: `Numero: ${result.data.numero_compra}`,
        })
        router.push(`/medias/compras/${result.data.id}`)
      } else {
        toast.error('Error', { description: result.error || 'Error desconocido' })
        setStep('form')
      }
    } catch (error) {
      toast.error('Error inesperado')
      setStep('form')
    }
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className={step === 'upload' ? 'font-bold text-primary' : ''}>
          1. Subir Factura
        </span>
        <span className="text-gray-300">{'>'}</span>
        <span className={step === 'review' ? 'font-bold text-primary' : ''}>
          2. Revisar OCR
        </span>
        <span className="text-gray-300">{'>'}</span>
        <span className={step === 'form' || step === 'saving' ? 'font-bold text-primary' : ''}>
          3. Confirmar
        </span>
      </div>

      {/* Step 1: Upload Invoice */}
      {step === 'upload' && (
        <InvoiceUpload
          onUploadComplete={handleUploadComplete}
          onError={(msg) => toast.error(msg)}
        />
      )}

      {/* Step 2: Review OCR Results */}
      {step === 'review' && ocrResult && (
        <OCRProductReview
          ocrResult={ocrResult}
          products={products}
          onConfirm={handleOCRConfirm}
          onSkip={handleOCRSkip}
        />
      )}

      {/* Step 3: Form (using PurchaseForm component) */}
      {(step === 'form' || step === 'saving') && (
        <div className="space-y-6">
          <PurchaseForm
            products={products}
            proveedor={proveedor}
            setProveedor={setProveedor}
            fechaFactura={fechaFactura}
            setFechaFactura={setFechaFactura}
            numeroFactura={numeroFactura}
            setNumeroFactura={setNumeroFactura}
            notas={notas}
            setNotas={setNotas}
            items={items}
            setItems={setItems}
            disabled={step === 'saving'}
          />

          {/* Actions */}
          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={() => setStep('upload')}
              disabled={step === 'saving'}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Cambiar Factura
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={step === 'saving' || !invoicePath || items.length === 0}
            >
              {step === 'saving' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Registrar Compra
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
