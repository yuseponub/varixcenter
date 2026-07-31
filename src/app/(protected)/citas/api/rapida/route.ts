import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createQuickAppointment, type QuickCreateInput } from '@/lib/appointments/quick-create'

/**
 * POST /citas/api/rapida - Crear una cita desde la barra de "cita rapida".
 *
 * Es una ruta y no una server action a proposito: el navegador la llama con
 * `keepalive`, asi el agendado llega al servidor y termina aunque la
 * recepcionista cierre la pestana o cambie de pagina antes de que responda.
 * Tampoco arrastra el re-render del RSC de /citas, que era la mayor parte de
 * la espera al agendar.
 *
 * El cuerpo incluye `request_id`: reenviar la misma peticion devuelve la cita
 * que ya existe en lugar de duplicarla.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'No autorizado. Por favor inicie sesion.' },
      { status: 401 }
    )
  }

  let body: QuickCreateInput
  try {
    body = (await request.json()) as QuickCreateInput
  } catch {
    return NextResponse.json({ error: 'Peticion invalida' }, { status: 400 })
  }

  const result = await createQuickAppointment(supabase, user.id, body)

  if (result.error) {
    return NextResponse.json(result, { status: 400 })
  }

  // La agenda se refresca sola desde el cliente; solo hay que invalidar la
  // lista de pacientes cuando de verdad se creo uno nuevo.
  if (result.data?.created_patient) revalidatePath('/pacientes')

  return NextResponse.json(result)
}
