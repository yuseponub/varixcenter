import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ numero: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { numero: rawNumero } = await params
  let numero: string
  try {
    numero = decodeURIComponent(rawNumero).trim().toUpperCase()
  } catch {
    return NextResponse.json({ error: 'Factura inválida' }, { status: 400 })
  }
  if (!/^FE\d+$/.test(numero)) {
    return NextResponse.json({ error: 'Factura inválida' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { data: role } = await supabase.rpc('get_user_role')
  if (role !== 'admin' && role !== 'secretaria') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { data: invoice, error } = await supabase
    .from('wimax_facturas')
    .select('pdf_storage_path')
    .eq('numero', numero)
    .single()
  if (error || !invoice?.pdf_storage_path) {
    return NextResponse.json({ error: 'PDF todavía no disponible' }, { status: 404 })
  }

  const { data, error: signError } = await supabase.storage
    .from('wimax-invoices')
    .createSignedUrl(invoice.pdf_storage_path, 300, {
      download: `${numero}.pdf`,
    })
  if (signError || !data?.signedUrl) {
    return NextResponse.json({ error: 'No fue posible abrir el PDF' }, { status: 502 })
  }

  return NextResponse.redirect(data.signedUrl, 302)
}
