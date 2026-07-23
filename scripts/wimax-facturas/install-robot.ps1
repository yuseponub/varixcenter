param(
  [string]$AppDir = 'C:\varix-facturas\app',
  [string]$NodeExe = 'C:\varix-facturas\node\node.exe',
  [string]$TaskName = 'VarixWimaxRobot',
  [switch]$Enable
)

$ErrorActionPreference = 'Stop'

$robot = Join-Path $AppDir 'robot.mjs'
$driver = Join-Path $AppDir 'gui-driver.ps1'
$envFile = Join-Path $AppDir '.env'
$logDir = Join-Path $AppDir 'logs'
$logFile = Join-Path $logDir 'robot.log'

foreach ($required in @($NodeExe, $robot, $driver, $envFile)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "No existe $required"
  }
}

if (-not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$envText = Get-Content -LiteralPath $envFile -Raw
if ($Enable -and $envText -notmatch '(?m)^WIMAX_ROBOT_ENABLED\s*=\s*true\s*$') {
  throw 'Para habilitar, WIMAX_ROBOT_ENABLED=true debe estar explicito en .env'
}
if ($Enable) {
  $profileMatch = [regex]::Match(
    $envText,
    '(?m)^WIMAX_UI_PROFILE\s*=\s*["'']?([^"'']+)["'']?\s*$'
  )
  if (-not $profileMatch.Success) {
    throw 'Para habilitar, WIMAX_UI_PROFILE debe estar configurado en .env'
  }
  $profilePath = $profileMatch.Groups[1].Value.Trim()
  if (-not [System.IO.Path]::IsPathRooted($profilePath)) {
    $profilePath = Join-Path $AppDir $profilePath
  }
  if (-not (Test-Path -LiteralPath $profilePath)) {
    throw "No existe el perfil UI configurado: $profilePath"
  }
  $profile = Get-Content -LiteralPath $profilePath -Raw | ConvertFrom-Json
  if ($profile.calibrated -ne $true -or [int]$profile.sessionId -ne 1) {
    throw 'El perfil UI debe estar calibrado y fijado a la sesion interactiva 1'
  }
}

$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
if ([string]::IsNullOrWhiteSpace($userId)) {
  throw 'No fue posible resolver la cuenta interactiva actual'
}
$escapedNode = $NodeExe.Replace("'", "''")
$escapedRobot = $robot.Replace("'", "''")
$escapedLog = $logFile.Replace("'", "''")
$command = "& '$escapedNode' '$escapedRobot' *>> '$escapedLog'"

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$command`"" `
  -WorkingDirectory $AppDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal `
  -UserId $userId `
  -LogonType Interactive `
  -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

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
  Write-Output "Tarea $TaskName habilitada en modo interactivo para $userId"
}
else {
  Disable-ScheduledTask -TaskName $TaskName | Out-Null
  Write-Output "Tarea $TaskName instalada y DESHABILITADA; calibre el perfil antes de activarla"
}
