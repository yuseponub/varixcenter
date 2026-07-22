# Espejo de facturas WiMAX

Agente de una sola via: lee las facturas FE del mes actual y el anterior en
WiMAX/FoxPro y las refleja en Supabase. No crea, modifica ni elimina archivos
dentro de `WIMAX_DIR`.

## Instalacion en el PC de contabilidad

1. Instalar Node.js 20 o posterior.
2. Copiar esta carpeta al PC y ejecutar `npm ci`.
3. Copiar `.env.example` como `.env` y completar las tres variables.
4. Probar manualmente con `npm start`.
5. Programar `npm start` en el Programador de tareas de Windows con el usuario
   que ya tiene acceso de lectura a `C:\wimax`.

El agente registra cada intento en `sync_runs` con
`source='wimax_facturas'`. Al terminar el upsert llama
`cruzar_facturacion_wimax()`.

Para una prueba integral contra staging con DBF sinteticos temporales:

```powershell
$env:SUPABASE_URL="https://...supabase.co"
$env:SUPABASE_SERVICE_KEY="..."
npm run test:staging
```

La prueba compara hashes antes/despues para demostrar que el agente no modifica
los DBF y elimina de staging sus dos facturas sinteticas al finalizar.

Los campos FoxPro principales se buscan primero por sus nombres verificados
(`TIPO`, `NUMERO`, `EMISION`, `CLAVE`, `TOTAL`; `DIREC4` en `tmdir.dbf`) y se
aceptan alias comunes para tolerar variaciones de version. Si falta un campo
obligatorio, el agente falla mostrando los campos disponibles en el log.
