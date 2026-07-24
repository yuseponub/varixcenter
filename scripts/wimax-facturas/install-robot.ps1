param(
  [string]$AppDir = 'C:\varix-facturas\app',
  [string]$NodeExe = 'C:\varix-facturas\node\node.exe',
  [string]$TaskName = 'VarixWimaxRobot',
  [switch]$Enable
)

$ErrorActionPreference = 'Stop'

$robot = Join-Path $AppDir 'robot.mjs'
$driver = Join-Path $AppDir 'gui-driver.ps1'
$startupDriver = Join-Path $AppDir 'wimax-startup-driver.ps1'
$envFile = Join-Path $AppDir '.env'
$logDir = Join-Path $AppDir 'logs'
$logFile = Join-Path $logDir 'robot.log'

foreach ($required in @($NodeExe, $robot, $driver, $startupDriver, $envFile)) {
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
    '(?m)^WIMAX_UI_PROFILE[ \t]*=[ \t]*["'']?([^\r\n"'']+?)["'']?[ \t]*\r?$'
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
  $fixedSession = $profile.sessionId -is [int] -or $profile.sessionId -is [long]
  $validSession = ($fixedSession -and [long]$profile.sessionId -ge 1) -or `
    [string]$profile.sessionId -ceq 'current'
  if ($profile.calibrated -ne $true -or -not $validSession) {
    throw 'El perfil UI debe estar calibrado y usar una sesion positiva o current'
  }

  $autoStart = $envText -match '(?m)^WIMAX_AUTO_START_ENABLED\s*=\s*true\s*$'
  if ($autoStart) {
    $startupProfileMatch = [regex]::Match(
      $envText,
      '(?m)^WIMAX_STARTUP_PROFILE[ \t]*=[ \t]*["'']?([^\r\n"'']+?)["'']?[ \t]*\r?$'
    )
    if (-not $startupProfileMatch.Success) {
      throw 'El autoarranque requiere WIMAX_STARTUP_PROFILE en .env'
    }
    $startupProfilePath = $startupProfileMatch.Groups[1].Value.Trim()
    if (-not [System.IO.Path]::IsPathRooted($startupProfilePath)) {
      $startupProfilePath = Join-Path $AppDir $startupProfilePath
    }
    if (-not (Test-Path -LiteralPath $startupProfilePath)) {
      throw "No existe el perfil de arranque configurado: $startupProfilePath"
    }
    $startupProfile = Get-Content -LiteralPath $startupProfilePath -Raw | ConvertFrom-Json
    if ($startupProfile.calibrated -ne $true) {
      throw 'El perfil de arranque WiMAX no esta calibrado'
    }
    $passwordMatch = [regex]::Match(
      $envText,
      '(?m)^WIMAX_COMPANY_PASSWORD[ \t]*=[ \t]*(.+?)[ \t]*\r?$'
    )
    if (-not $passwordMatch.Success) {
      throw 'El autoarranque requiere la clave local de empresa WiMAX'
    }
    $passwordValue = $passwordMatch.Groups[1].Value.Trim().Trim('"', "'")
    if ([string]::IsNullOrWhiteSpace($passwordValue)) {
      throw 'El autoarranque requiere la clave local de empresa WiMAX'
    }
    $passwordValue = $null
    $passwordMatch = $null

    $executable = [string]$startupProfile.executable.path
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
      throw 'No existe el WIMAX.EXE calibrado para autoarranque'
    }
    $item = Get-Item -LiteralPath $executable
    $hash = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash
    if (
      $item.Length -ne [long]$startupProfile.executable.length -or
      $hash -ine [string]$startupProfile.executable.sha256
    ) {
      throw 'WIMAX.EXE cambio; recalibre el perfil antes de habilitar el robot'
    }
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
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
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
