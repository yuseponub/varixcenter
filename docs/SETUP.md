# VarixClinic - Guia de Configuracion

Esta guia explica como configurar el entorno de desarrollo para VarixClinic.

## Requisitos Previos

- Node.js 18+ (recomendado 20 LTS)
- npm o pnpm
- Cuenta de Supabase (https://supabase.com)
- Git
- Docker (opcional, para desarrollo local con Supabase CLI)

## 1. Clonar y Configurar el Proyecto

```bash
git clone <url-del-repositorio>
cd varix-clinic
npm install
```

## 2. Configurar Supabase

### 2.1 Crear Proyecto en Supabase

1. Ir a https://supabase.com/dashboard
2. Click "New project"
3. Configurar:
   - **Name:** `varixclinic` (o el nombre que prefieras)
   - **Database Password:** Generar y guardar en lugar seguro
   - **Region:** South America (Sao Paulo) - mas cercano a Colombia
4. Esperar a que el proyecto se cree (~2 minutos)

### 2.2 Obtener Credenciales

En Supabase Dashboard -> Project Settings -> API:

1. **Project URL:** Copiar la URL (ejemplo: `https://xxx.supabase.co`)
2. **anon public key:** Copiar la clave anonima (empieza con `eyJ...`)
3. **service_role key:** Copiar la clave de servicio (secreto, solo para backend)

> **IMPORTANTE:** La clave `service_role` tiene acceso total a la base de datos.
> Nunca exponerla en el cliente o en repositorios publicos.

### 2.3 Configurar Variables de Entorno

```bash
cp .env.local.example .env.local
```

Editar `.env.local` con las credenciales obtenidas:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJ...tu-service-role-key
```

## 3. Aplicar Migraciones a la Base de Datos

### Opcion A: Via Supabase Dashboard (Recomendado para Produccion)

1. Ir a SQL Editor en Supabase Dashboard
2. Ejecutar cada archivo de migracion en orden:

```
supabase/migrations/001_user_roles.sql
supabase/migrations/002_audit_infrastructure.sql
supabase/migrations/003_custom_access_token_hook.sql
supabase/migrations/004_audit_user_roles.sql
supabase/migrations/005_rls_verification.sql
supabase/seed.sql
```

> **Nota:** Copiar el contenido de cada archivo y pegarlo en el SQL Editor.
> Ejecutar uno a la vez y verificar que no haya errores.

### Opcion B: Via Supabase CLI (Desarrollo Local)

```bash
# Instalar Supabase CLI si no esta instalado
npm install -g supabase

# Vincular al proyecto remoto
supabase login
supabase link --project-ref <tu-project-ref>

# Aplicar migraciones al proyecto remoto
supabase db push
```

### Opcion C: Desarrollo Local con Docker

```bash
# Iniciar Supabase local (requiere Docker)
supabase start

# Las migraciones se aplican automaticamente desde supabase/migrations/
```

## 4. Habilitar Custom Access Token Hook

**Este paso es CRITICO. Sin esto, los roles no funcionaran correctamente.**

1. Ir a **Authentication -> Hooks** en Supabase Dashboard
2. Buscar la seccion **"Customize Access Token (JWT) Claims"**
3. Habilitar el toggle (switch a ON)
4. En el selector de funcion, elegir: `public.custom_access_token_hook`
5. Click en **Save** (Guardar)

### Verificar que el Hook esta Activo

Despues de habilitar el hook:
- El hook debe mostrar estado "Enabled" (verde)
- El nombre de la funcion debe aparecer como `custom_access_token_hook`

## 5. Crear el Primer Usuario Administrador

### 5.1 Crear Usuario en Supabase Auth

1. Ir a **Authentication -> Users** en Supabase Dashboard
2. Click **Add user**
3. Completar:
   - **Email:** tu-email@ejemplo.com
   - **Password:** Una contrasena segura
4. Click **Create user**

### 5.2 Asignar Rol de Administrador

Hay dos opciones para asignar el rol de admin:

**Opcion A - Via SQL Editor (si aun no has hecho login):**

```sql
-- Primero, obtener el UUID del usuario recien creado
SELECT id, email FROM auth.users WHERE email = 'tu-email@ejemplo.com';

-- Luego, asignar rol admin (reemplazar UUID con el obtenido arriba)
INSERT INTO public.user_roles (user_id, role)
VALUES ('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 'admin');
```

**Opcion B - Via la funcion bootstrap (despues de hacer login):**

```sql
-- Ejecutar como el usuario autenticado (en el SQL Editor)
SELECT public.bootstrap_first_admin();
```

> **IMPORTANTE:** Despues de asignar el rol, debes cerrar sesion y volver
> a ingresar para que el token JWT se actualice con el nuevo rol.

## 6. Iniciar Servidor de Desarrollo

```bash
npm run dev
```

Abrir http://localhost:3000 en el navegador.

## 7. Verificar la Configuracion

### 7.1 Verificar Login y Rol

1. Ir a `/login`
2. Ingresar las credenciales del usuario admin creado
3. El dashboard debe mostrar:
   - Tu email
   - Tu rol: "Administrador"

### 7.2 Verificar RLS (Row Level Security)

En el SQL Editor de Supabase, ejecutar:

```sql
SELECT * FROM public.verify_rls_enabled();
```

**Resultado esperado:** 0 filas (todas las tablas tienen RLS habilitado)

Alternativamente:

```sql
SELECT public.rls_check_passed();
```

**Resultado esperado:** `true`

### 7.3 Verificar Auditoria

Despues de crear un usuario o asignar un rol, verificar en SQL Editor:

```sql
SELECT * FROM public.audit_log ORDER BY changed_at DESC LIMIT 10;
```

Deberias ver registros de los cambios realizados.

## 8. Solucionar Problemas Comunes

### "Sin rol asignado" en el dashboard

**Causas posibles:**
1. El Custom Access Token Hook no esta habilitado
2. No existe registro en `user_roles` para el usuario
3. No has cerrado sesion despues de asignar el rol

**Solucion:**
1. Verificar que el hook esta activo en Authentication -> Hooks
2. Verificar en SQL: `SELECT * FROM public.user_roles WHERE user_id = 'tu-uuid';`
3. Cerrar sesion y volver a ingresar

### Error de autenticacion

**Causas posibles:**
1. Variables de entorno incorrectas
2. Proyecto Supabase pausado o inactivo
3. URL o clave incorrectas

**Solucion:**
1. Verificar `.env.local` tiene los valores correctos
2. Verificar que el proyecto Supabase esta activo en Dashboard
3. Revisar la consola del navegador (F12) para ver errores especificos

### RLS bloqueando consultas

**Causas posibles:**
1. Usuario no tiene rol asignado
2. Politicas RLS de la tabla no permiten la operacion

**Solucion:**
1. Asignar rol al usuario
2. Revisar las politicas de la tabla en Database -> Tables -> [tabla] -> Policies
3. Para depuracion temporal, usar `service_role` key (solo en desarrollo)

### Error "relation does not exist"

**Causa:** Las migraciones no se han aplicado correctamente.

**Solucion:** Aplicar las migraciones en orden (ver Seccion 3).

## 9. Crear Usuarios Adicionales

Solo el administrador puede crear usuarios para la clinica.

### Crear usuario via Dashboard:
1. Ir a Authentication -> Users
2. Click Add user
3. Completar email y contrasena

### Asignar rol al nuevo usuario:

```sql
-- Usar la funcion auxiliar (requiere ser admin)
SELECT public.assign_role('email-del-usuario@ejemplo.com', 'medico');

-- Roles disponibles: admin, medico, enfermera, secretaria
```

## 10. Estructura del Proyecto

```
varix-clinic/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/          # Pagina de inicio de sesion
│   │   │       ├── page.tsx
│   │   │       └── actions.ts  # Server actions para auth
│   │   └── (protected)/
│   │       ├── layout.tsx      # Layout con navbar y usuario
│   │       └── dashboard/      # Pagina principal protegida
│   │           └── page.tsx
│   ├── lib/
│   │   └── supabase/
│   │       ├── client.ts       # Cliente para componentes client-side
│   │       ├── server.ts       # Cliente para Server Components
│   │       └── middleware.ts   # Cliente para middleware
│   └── types/
│       ├── index.ts            # Tipos de usuario y roles
│       └── supabase.ts         # Tipos generados de Supabase
├── supabase/
│   ├── migrations/             # Migraciones SQL
│   │   ├── 001_user_roles.sql
│   │   ├── 002_audit_infrastructure.sql
│   │   ├── 003_custom_access_token_hook.sql
│   │   ├── 004_audit_user_roles.sql
│   │   └── 005_rls_verification.sql
│   ├── seed.sql                # Funciones de bootstrap y utilidades
│   └── config.toml             # Configuracion para desarrollo local
├── docs/
│   └── SETUP.md                # Esta guia
├── .env.local.example          # Plantilla de variables de entorno
└── middleware.ts               # Middleware de Next.js para auth
```

## 11. Comandos Utiles

```bash
# Desarrollo
npm run dev          # Iniciar servidor de desarrollo
npm run build        # Compilar para produccion
npm run start        # Iniciar servidor de produccion
npm run lint         # Ejecutar linter

# Supabase CLI (si lo usas)
supabase start       # Iniciar Supabase local
supabase stop        # Detener Supabase local
supabase db push     # Aplicar migraciones a proyecto vinculado
supabase gen types   # Generar tipos TypeScript desde la base de datos
```

## 12. Lista de Verificacion Final

Antes de considerar el entorno listo:

- [ ] Proyecto Supabase creado y activo
- [ ] Variables de entorno configuradas en `.env.local`
- [ ] Todas las migraciones aplicadas sin errores
- [ ] Custom Access Token Hook habilitado
- [ ] Usuario admin creado y con rol asignado
- [ ] Login funciona y muestra el rol correcto
- [ ] `verify_rls_enabled()` retorna 0 filas
- [ ] `audit_log` registra cambios en `user_roles`

---

**Soporte:** Si encuentras problemas no documentados aqui, revisar los logs
en la consola del navegador y los logs de Supabase Dashboard -> Logs.
