@echo off
REM Sincronizacion Access -> Supabase (VarixCenter)
REM Este archivo lo ejecuta el Programador de tareas de Windows cada hora.

cd /d "%~dp0"
echo [%date% %time%] Iniciando sincronizacion >> sync.log
node sync.mjs >> sync.log 2>&1
echo [%date% %time%] Termino con codigo %errorlevel% >> sync.log
