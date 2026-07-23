[CmdletBinding()]
param(
  [string]$ApiUrl = 'https://varixcenter-v2.vercel.app/api/integrations/outlook/desktop-sync',
  [string]$CalendarName = 'Mi calendario',
  [string]$DeviceId = $env:COMPUTERNAME.ToLowerInvariant(),
  [ValidateRange(0, 365)][int]$PastDays = 30,
  [ValidateRange(30, 730)][int]$FutureDays = 400,
  [switch]$UseExistingToken,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$TaskName = 'VarixCenter Outlook Bridge'
$BridgeRoot = Join-Path $env:LOCALAPPDATA 'VarixCenter\OutlookBridge'
$AgentPath = Join-Path $BridgeRoot 'varix-outlook-bridge.ps1'
$ConfigPath = Join-Path $BridgeRoot 'bridge-config.json'
$TokenPath = Join-Path $BridgeRoot 'token.protected'
$AgentDownload = 'https://varixcenter-v2.vercel.app/downloads/varix-outlook-bridge.ps1'

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host 'Tarea automatica desinstalada. Los archivos locales se conservaron como respaldo.'
  exit 0
}

if ($DeviceId -notmatch '^[A-Za-z0-9._-]{1,64}$') {
  throw 'El nombre del equipo no es valido para el puente.'
}

New-Item -ItemType Directory -Path $BridgeRoot -Force | Out-Null
Write-Host 'Descargando agente oficial de VarixCenter...'
Invoke-WebRequest -Uri $AgentDownload -OutFile $AgentPath -UseBasicParsing

if ($UseExistingToken) {
  if (-not (Test-Path $TokenPath)) {
    throw 'No existe un token protegido para reutilizar.'
  }
} else {
  $secureToken = Read-Host 'Pegue el token del puente (no se mostrara)' -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try {
    $tokenLength = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Length
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
  if ($tokenLength -lt 32) { throw 'El token del puente es invalido.' }

  $secureToken | ConvertFrom-SecureString | Set-Content -LiteralPath $TokenPath -Encoding UTF8
}
$config = [ordered]@{
  apiUrl = $ApiUrl
  deviceId = $DeviceId
  calendarName = $CalendarName
  pastDays = $PastDays
  futureDays = $FutureDays
}
$config | ConvertTo-Json | Set-Content -LiteralPath $ConfigPath -Encoding UTF8

$powershell = Join-Path $PSHOME 'powershell.exe'
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$AgentPath`""
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments
$triggerParameters = @{
  Once = $true
  At = (Get-Date).AddMinutes(1)
  RepetitionInterval = (New-TimeSpan -Minutes 1)
  RepetitionDuration = (New-TimeSpan -Days 3650)
}
$trigger = New-ScheduledTaskTrigger @triggerParameters
$settingsParameters = @{
  AllowStartIfOnBatteries = $true
  DontStopIfGoingOnBatteries = $true
  StartWhenAvailable = $true
  ExecutionTimeLimit = (New-TimeSpan -Minutes 5)
}
$settings = New-ScheduledTaskSettingsSet @settingsParameters
$principalParameters = @{
  UserId = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  LogonType = 'Interactive'
  RunLevel = 'Limited'
}
$principal = New-ScheduledTaskPrincipal @principalParameters

$taskParameters = @{
  TaskName = $TaskName
  Action = $action
  Trigger = $trigger
  Settings = $settings
  Principal = $principal
  Description = 'Sincroniza Mi calendario de Outlook clasico con VarixCenter cada minuto.'
  Force = $true
}
Register-ScheduledTask @taskParameters | Out-Null

Write-Host 'Probando la primera sincronizacion en la sesion de Outlook...'
$startedAt = Get-Date
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2
$deadline = (Get-Date).AddMinutes(3)
do {
  $task = Get-ScheduledTask -TaskName $TaskName
  if ($task.State -ne 'Running') { break }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)

$taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
if ($task.State -eq 'Running' -or $taskInfo.LastRunTime -lt $startedAt.AddSeconds(-5) -or $taskInfo.LastTaskResult -ne 0) {
  Write-Warning "La tarea quedo instalada, pero la prueba fallo. Revise $BridgeRoot\bridge.log"
  exit 1
}

Write-Host 'Puente Outlook-Varix instalado y sincronizando cada minuto.' -ForegroundColor Green
