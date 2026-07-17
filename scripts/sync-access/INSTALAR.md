# Instalación del sincronizador Access → Sistema Nuevo

Este agente copia automáticamente **los pacientes nuevos y las historias/planes**
que se registren en el Access de la clínica hacia el sistema nuevo (Supabase).
Corre solo, cada hora, en el PC de la clínica donde está el archivo Access.

**Regla de oro**: solo agrega y actualiza datos que vienen de Access. Nunca
borra ni modifica lo que se haya creado en el sistema nuevo.

## Requisitos

- El PC de la clínica con Windows e internet
- Saber la ruta del archivo Access (ej: `C:\clinica\historias.mdb`)

## Pasos (una sola vez, ~15 minutos)

### 1. Instalar Node.js

1. Descargar Node.js LTS desde https://nodejs.org (botón verde, versión LTS)
2. Instalar con todo por defecto (siguiente, siguiente, finalizar)

### 2. Copiar esta carpeta

Copiar la carpeta `sync-access` completa a `C:\varix-sync\` en el PC de la clínica
(por USB, correo o Drive).

### 3. Configurar

1. Dentro de `C:\varix-sync\`, copiar el archivo `.env.example` y renombrar la
   copia a `.env` (exactamente así, con el punto).
2. Abrir `.env` con el Bloc de notas y llenar:
   - `SUPABASE_SERVICE_KEY=` → la clave (te la paso yo por canal seguro)
   - `ACCESS_DB_PATH=` → la ruta real del archivo Access
3. Guardar y cerrar.

### 4. Instalar dependencias y probar

Abrir **Símbolo del sistema** (cmd) y ejecutar:

```
cd C:\varix-sync
npm install
node sync.mjs
```

Debe terminar diciendo `Sincronizacion completa` con las estadísticas.
Si dice que no encuentra una tabla, revisar los nombres de tabla en `.env`.

### 5. Programar la ejecución automática (cada hora)

En el mismo cmd, ejecutar (una sola línea):

```
schtasks /create /tn "VarixSyncAccess" /tr "C:\varix-sync\run-sync.bat" /sc hourly /st 07:00 /f
```

Esto crea una tarea que corre cada hora desde las 7:00 am. Verificar con:

```
schtasks /query /tn "VarixSyncAccess"
```

## ¿Cómo sé que está funcionando?

- En el sistema nuevo, el dashboard de administrador muestra
  **"Última sincronización con Access: hace X minutos/horas"**.
- En el PC de la clínica queda un archivo `C:\varix-sync\sync.log` con el
  historial de cada corrida.

## Solución de problemas

| Problema | Solución |
|---|---|
| "node no se reconoce como comando" | Reinstalar Node.js y abrir un cmd nuevo |
| "faltan SUPABASE_URL / SUPABASE_SERVICE_KEY" | El archivo `.env` no existe o está vacío |
| "tabla PACIENTES no encontrada" | Ajustar `ACCESS_TABLE_*` en `.env` con el nombre real |
| No encuentra el .mdb | Revisar `ACCESS_DB_PATH` (usar la ruta completa) |
| El dashboard dice que hace días no sincroniza | Revisar `sync.log` en el PC de la clínica |
