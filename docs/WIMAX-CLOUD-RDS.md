# WiMAX en nube con sesion dedicada para el robot

## Objetivo

Ejecutar WiMAX y el robot sin depender de un PC fisico de la oficina y sin
compartir foco con la persona de contabilidad.

La topologia objetivo usa un unico Windows Server con los datos de WiMAX en su
disco local y dos sesiones RDS separadas:

```text
Contabilidad -> sesion RDS humana ----+
                                      +-> C:\wimax\CENTER26 -> Conexus/DIAN
Robot ------> sesion RDS dedicada ----+
```

No se deben mantener dos copias escribibles de `CENTER26`. Tras el corte, la
copia de nube es la fuente autoritativa y la copia del PC anterior queda solo
como respaldo de recuperacion.

## Plataforma base propuesta

- Windows Server con Desktop Experience.
- 4 vCPU, 16 GB de RAM y disco de sistema de al menos 128 GB.
- WiMAX y todos sus DBF en el mismo disco/servidor; nunca abrir DBF por SMB a
  traves de Internet.
- Sesion local dedicada `varixrobot`, resolucion fija 1920x1080 y perfil del
  agente con `sessionId: "current"`.
- Sesion independiente para contabilidad mediante RDS licenciado.
- Acceso administrativo por Tailscale o un bastion; no dejar RDP publicado a
  todo Internet.
- Copia nocturna versionada cuando WiMAX no este escribiendo.

Un contenedor web convencional no sirve: el flujo requiere Windows completo,
un escritorio interactivo y foco real para los controles Xbase++.

## Limites de licencia

Se puede probar una copia de la instalacion que pertenece a la empresa usando
los mecanismos normales del programa. No se modifica el ejecutable, no se
emula hardware y no se evita una pantalla de activacion. Si WiMAX exige una
reactivacion que no puede completarse normalmente, la prueba se detiene en ese
punto.

Windows Server con varias sesiones productivas requiere licenciamiento RDS.
Las sesiones administrativas no se usan como sustituto de RDS en produccion.

## Fase 1: prueba aislada, sin emitir

1. Crear una VM temporal sin datos clinicos y registrar costo/fecha de
   expiracion de la prueba.
2. Crear una regla de Firewall de Windows que bloquee salida a Internet para
   los ejecutables bajo `C:\wimax` mientras se valida la interfaz. RDP,
   Tailscale y el agente permanecen disponibles.
3. Instalar el runtime Microsoft Visual C++ 2008 x86 que usa la instalacion
   actual.
4. Cerrar WiMAX en la oficina y ejecutar `export-wimax-copy.ps1` fuera del
   horario de trabajo. Transferir el archivo cifrado por canal privado y
   verificar su SHA-256 antes de extraerlo.
5. Abrir WiMAX en la copia, iniciar la empresa `CENTER26` y validar consultas,
   directorio, catalogo y preparacion de una factura. Abortar antes del asiento
   contable irreversible.
6. Ejecutar el lector DBF y comparar conteos/ultima FE contra la copia origen.
7. Abrir dos sesiones simultaneas sobre la copia para comprobar bloqueo de
   archivos y que el foco del robot no afecte la sesion humana.
8. Destruir la VM si falla compatibilidad o activacion normal. La oficina sigue
   intacta durante toda esta fase.

## Fase 2: corte controlado

1. Definir una ventana sin usuarios y detener WiMAX en la oficina.
2. Crear una copia final, verificar el hash y restaurarla en nube.
3. Comparar la ultima FE, clientes, tamanos y fechas de los DBF criticos.
4. Impedir nuevas escrituras en la copia de la oficina para evitar una base
   dividida.
5. Configurar RDS, usuarios, impresora virtual, Tailscale, tareas y respaldos.
6. Habilitar la salida de WiMAX y hacer una unica emision supervisada.
7. Verificar `trafac`, CUFE, portal DIAN y VarixCenter antes de liberar el lote.

## Criterios de no avance

- WiMAX o sus componentes piden eludir una activacion.
- Los DBF cambian durante la copia o no coinciden al restaurar.
- La sesion del robot se bloquea o pierde la resolucion al desconectarse.
- Dos sesiones causan errores de bloqueo o corrupcion en una copia de prueba.
- No existe respaldo verificable anterior al corte.
- La emision de prueba no puede detenerse antes del paso irreversible.
