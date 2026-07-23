'use client'

import { signIn } from './actions'
import { useActionState } from 'react'

const initialState = { error: null as string | null }

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(
    async (_prevState: typeof initialState, formData: FormData) => {
      const result = await signIn(formData)
      return result || { error: null }
    },
    initialState
  )

  return (
    <div className="bg-white rounded-lg shadow-md p-8">
      <div className="text-center mb-8">
        <h1 className="text-[22px] font-bold text-foreground">VarixClinic</h1>
        <p className="text-muted-foreground mt-2">Iniciar sesion</p>
      </div>

      <form action={formAction} className="space-y-6">
        {state.error && (
          <div className="bg-destructive-soft text-destructive p-3 rounded-md text-sm">
            {state.error}
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-foreground">
            Correo electronico
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-ring focus:border-ring"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-foreground">
            Contrasena
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 block w-full px-3 py-2 border border-border rounded-md shadow-sm focus:outline-none focus:ring-ring focus:border-ring"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50"
        >
          {pending ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
