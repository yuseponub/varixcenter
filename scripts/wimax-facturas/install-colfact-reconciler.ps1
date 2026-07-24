param(
  [string]$AppDir = 'C:\varix-facturas\app',
  [string]$NodeExe = 'C:\varix-facturas\node\node.exe',
  [string]$TaskName = 'VarixWimaxColfact',
  [ValidateRange(2, 60)]
  [int]$IntervalMinutes = 5,
  [switch]$Enable
)

$ErrorActionPreference = 'Stop'

$script = Join-Path $AppDir 'reconcile-colfact.mjs'
$envFile = Join-Path $AppDir '.env'
$logDir = Join-Path $AppDir 'logs'
$logFile = Join-Path $logDir 'colfact.log'

foreach ($required in @($NodeExe, $script, $envFile)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "No existe $required"
  }
}
if (-not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$envText = Get-Content -LiteralPath $envFile -Raw
if ($Enable) {
  foreach ($pattern in @(
    '(?m)^COLFACT_RECONCILE_ENABLED\s*=\s*true\s*$',
    '(?m)^COLFACT_USERNAME\s*=\s*\S+\s*$',
    '(?m)^COLFACT_PASSWORD\s*=\s*\S+\s*$',
    '(?m)^COLFACT_EMISOR_NIT\s*=\s*\d+\s*$'
  )) {
    if ($envText -notmatch $pattern) {
      throw 'La configuracion ColFact en .env esta incompleta'
    }
  }
}

$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
if ([string]::IsNullOrWhiteSpace($userId)) {
  throw 'No fue posible resolver la cuenta actual'
}
$escapedNode = $NodeExe.Replace("'", "''")
$escapedScript = $script.Replace("'", "''")
$escapedLog = $logFile.Replace("'", "''")
$command = "& '$escapedNode' '$escapedScript' *>> '$escapedLog'"

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$command`"" `
  -WorkingDirectory $AppDir
$trigger = New-ScheduledTaskTrigger `
  -Once `
  -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal `
  -UserId $userId `
  -LogonType Interactive `
  -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -RestartCount 2 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 4)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Force | Out-Null

if ($Enable) {
  Enable-ScheduledTask -TaskName $TaskName | Out-Null
  Start-ScheduledTask -TaskName $TaskName
  Write-Output "Tarea $TaskName habilitada cada $IntervalMinutes minutos"
}
else {
  Disable-ScheduledTask -TaskName $TaskName | Out-Null
  Write-Output "Tarea $TaskName instalada y deshabilitada"
}
