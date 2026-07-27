# Trabajar desde otro computador

Esta es la ruta reproducible para continuar el desarrollo sin depender de los
archivos locales del computador anterior. El código fuente vive en GitHub, la
aplicación web en Vercel, la base de datos en Supabase y el robot de facturación
solamente en el PC `CONTABILIDAD`.

## 1. Preparar el equipo

Instalar Git, Node.js 20.9 o superior y Tailscale. Comprobar las versiones:

```bash
git --version
node --version
npm --version
```

Clonar la rama compartida y usar el lockfile exacto:

```bash
git clone https://github.com/yuseponub/varixcenter.git
cd varixcenter
git switch mejoras-2026-07
npm ci
```

Si GitHub solicita autenticación, usar la cuenta autorizada o `gh auth login`.
No copiar la carpeta completa por OneDrive ni mantener el mismo worktree abierto
en dos equipos.

## 2. Recuperar la configuración web

El proyecto de Vercel se llama `varixcenter-v2`. Iniciar sesión, vincular el
clon y traer sus variables de desarrollo:

```bash
npx vercel@latest login
npx vercel@latest link --project varixcenter-v2
npx vercel@latest env pull .env.local
```

`.env.local` y `.vercel/` están ignorados por Git. Nunca copiarlos a un commit,
un chat o una carpeta compartida. Para arrancar y validar:

```bash
npm run type-check
npm run lint
npm run test:outlook
npm run build
npm run dev
```

## 3. Supabase sin duplicar migraciones

Vincular el proyecto y revisar el plan antes de escribir en producción:

```bash
npx supabase@latest login
npx supabase@latest link --project-ref gojqjfuszghfqvdnjjxa
npx supabase@latest migration list --linked
npx supabase@latest db push --dry-run
```

El `dry-run` debe listar únicamente las migraciones nuevas del trabajo actual o
indicar que no hay cambios. Si intenta aplicar archivos antiguos, detenerse: el
historial remoto necesita revisión. Sólo una persona debe ejecutar `db push` por
cada entrega.

## 4. Robot de WiMAX y ColFact

El robot no se ejecuta en el portátil de desarrollo. Permanece en el escritorio
Windows de `CONTABILIDAD`, donde están WiMAX, los DBF y las credenciales de
ColFact. Para administrarlo desde otro equipo:

1. Iniciar sesión en la misma red de Tailscale.
2. Confirmar que resuelve `contabilidad.tail191a18.ts.net`.
3. Usar la cuenta SSH autorizada y su llave privada local. La llave nunca se
   guarda dentro de este repositorio.
4. Seguir `scripts/wimax-facturas/README.md` y
   `docs/ROBOT-FACTURACION-WIMAX.md` para desplegar o diagnosticar.

El `.env` real y los perfiles calibrados del robot se conservan únicamente en
`CONTABILIDAD`. Git contiene ejemplos sin secretos. Actualizar código del robot
no autoriza emitir facturas: cada factura real sigue requiriendo la autorización
expresa y las barreras documentadas.

## 5. Cambio seguro entre computadores

Antes de dejar un equipo:

```bash
git status
git add <archivos-revisados>
git commit -m "descripcion concreta"
git push origin mejoras-2026-07
```

Al empezar en el otro:

```bash
git switch mejoras-2026-07
git status
git pull --ff-only
npm ci
```

`git status` debe estar limpio antes de cambiar de computador. Para trabajo en
paralelo, crear una rama distinta por tarea; no editar la misma rama sin hacer
primero `pull --ff-only`.

## 6. Lista de verificación de entrega

- `git status` limpio y commits visibles en GitHub.
- `npm ci`, tipos, lint, pruebas y build pasan desde un clon limpio.
- `supabase db push --dry-run` no intenta repetir migraciones aplicadas.
- Vercel está vinculado a `varixcenter-v2` y el despliegue responde.
- Tailscale alcanza `CONTABILIDAD`, sin copiar secretos al repositorio.
- El robot conserva una sola instancia y no tiene trabajos activos antes de un
  despliegue.
