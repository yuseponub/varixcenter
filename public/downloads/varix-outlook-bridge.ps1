[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$BridgeRoot = Join-Path $env:LOCALAPPDATA 'VarixCenter\OutlookBridge'
$ConfigPath = Join-Path $BridgeRoot 'bridge-config.json'
$TokenPath = Join-Path $BridgeRoot 'token.protected'
$StatePath = Join-Path $BridgeRoot 'state.json'
$LogPath = Join-Path $BridgeRoot 'bridge.log'
$MaxLogBytes = 2MB

function Write-BridgeLog {
  param([string]$Message)
  if (Test-Path $LogPath) {
    $log = Get-Item $LogPath -ErrorAction SilentlyContinue
    if ($log -and $log.Length -gt $MaxLogBytes) {
      Move-Item $LogPath "$LogPath.previous" -Force
    }
  }
  Add-Content -LiteralPath $LogPath -Value "$(Get-Date -Format o) $Message" -Encoding UTF8
}

function Convert-SecureValueToText {
  param([Security.SecureString]$SecureValue)
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Get-Sha256 {
  param([string]$Value)
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Add-SkipReason {
  param([hashtable]$Reasons, [string]$Name)
  if ($Reasons.ContainsKey($Name)) {
    $Reasons[$Name]++
  } else {
    $Reasons[$Name] = 1
  }
}

function Get-CalendarFolders {
  param($Folder)
  $result = New-Object Collections.Generic.List[object]
  foreach ($child in @($Folder.Folders)) {
    try {
      if ([int]$child.DefaultItemType -eq 1) {
        $result.Add($child)
      }
      foreach ($nested in @(Get-CalendarFolders -Folder $child)) {
        $result.Add($nested)
      }
    } catch {
      # Some special Outlook folders cannot be traversed; they are irrelevant.
    }
  }
  return $result
}

function Find-CalendarFolder {
  param($Namespace, [string]$CalendarName)
  $bestFolder = $null
  $bestScore = [int]::MinValue
  foreach ($store in @($Namespace.Stores)) {
    try {
      $root = $store.GetRootFolder()
      foreach ($folder in @(Get-CalendarFolders -Folder $root)) {
        if ($folder.Name -ieq $CalendarName) {
          $score = 0
          if ($store.DisplayName -match 'Archivo de datos|Outlook Data') { $score += 10 }
          if ($score -gt $bestScore) {
            $bestFolder = $folder
            $bestScore = $score
          }
        }
      }
    } catch {
      # Continue with the remaining stores.
    }
  }
  return $bestFolder
}

function Read-State {
  $mapping = @{}
  if (Test-Path $StatePath) {
    try {
      $saved = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($saved.mappings) {
        foreach ($property in $saved.mappings.PSObject.Properties) {
          $mapping[$property.Name] = [string]$property.Value
        }
      }
    } catch {
      Write-BridgeLog 'WARN state.json no se pudo leer; se reconstruira.'
    }
  }
  return $mapping
}

function Save-State {
  param([hashtable]$Mappings)
  $payload = [ordered]@{
    updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    mappings = $Mappings
  }
  $temporary = "$StatePath.tmp"
  $payload | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temporary -Encoding UTF8
  Move-Item -LiteralPath $temporary -Destination $StatePath -Force
}

$mutex = New-Object Threading.Mutex($false, 'Local\VarixCenterOutlookBridge')
$hasMutex = $false
try {
  $hasMutex = $mutex.WaitOne(0)
  if (-not $hasMutex) { exit 0 }

  if (-not (Test-Path $ConfigPath) -or -not (Test-Path $TokenPath)) {
    throw 'El puente no esta instalado o le falta configuracion.'
  }

  $config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $protectedToken = (Get-Content -LiteralPath $TokenPath -Raw -Encoding UTF8).Trim()
  $secureToken = ConvertTo-SecureString $protectedToken
  $token = Convert-SecureValueToText $secureToken
  if ([string]::IsNullOrWhiteSpace($token)) { throw 'El token local esta vacio.' }

  try {
    $outlook = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
  } catch {
    $outlook = New-Object -ComObject Outlook.Application
  }
  $namespace = $outlook.GetNamespace('MAPI')
  $calendarFolder = Find-CalendarFolder -Namespace $namespace -CalendarName ([string]$config.calendarName)
  if (-not $calendarFolder) {
    throw "No se encontro el calendario '$($config.calendarName)' en Outlook clasico."
  }

  $now = Get-Date
  $windowStartLocal = $now.Date.AddDays(-[int]$config.pastDays)
  $windowEndLocal = $now.Date.AddDays([int]$config.futureDays + 1)
  $items = $calendarFolder.Items
  $items.Sort('[Start]')
  $items.IncludeRecurrences = $true
  $culture = [Globalization.CultureInfo]::CurrentCulture
  $startFilter = $windowStartLocal.ToString('g', $culture)
  $endFilter = $windowEndLocal.ToString('g', $culture)
  $restricted = $items.Restrict("[Start] < '$endFilter' AND [End] > '$startFilter'")

  $mappings = Read-State
  $events = New-Object Collections.Generic.List[object]
  $skipped = 0
  $skipReasons = @{}
  $limitExceeded = $false
  foreach ($item in @($restricted)) {
    if ($events.Count -ge 5000) {
      $limitExceeded = $true
      break
    }
    try {
      if ([int]$item.Class -ne 26) { continue }
      $start = ([DateTime]$item.Start).ToUniversalTime()
      $end = ([DateTime]$item.End).ToUniversalTime()
      if ($end -le $start) {
        $end = $start.AddMinutes(15)
        Add-SkipReason -Reasons $skipReasons -Name 'adjusted-range'
      }
      $entryId = [string]$item.EntryID
      $globalId = [string]$item.GlobalAppointmentID
      if ([string]::IsNullOrWhiteSpace($entryId) -and [string]::IsNullOrWhiteSpace($globalId)) {
        $skipped++
        Add-SkipReason -Reasons $skipReasons -Name 'missing-id'
        continue
      }
      $identitySeed = if ([bool]$item.IsRecurring) {
        "$globalId|$($start.ToString('o'))"
      } else {
        "$globalId|$entryId"
      }
      $externalId = Get-Sha256 $identitySeed
      $categories = @()
      if (-not [string]::IsNullOrWhiteSpace([string]$item.Categories)) {
        $categories = @(([string]$item.Categories -split '[,;]') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
      }
      $busyNames = @('free', 'tentative', 'busy', 'oof', 'workingElsewhere')
      $busyIndex = [int]$item.BusyStatus
      $showAs = if ($busyIndex -ge 0 -and $busyIndex -lt $busyNames.Count) {
        $busyNames[$busyIndex]
      } else {
        'busy'
      }

      $events.Add([ordered]@{
        externalId = $externalId
        globalId = if ($globalId) { Get-Sha256 $globalId } else { $null }
        subject = if ([string]::IsNullOrWhiteSpace([string]$item.Subject)) { '(Sin asunto)' } else { [string]$item.Subject }
        start = $start.ToString('o')
        end = $end.ToString('o')
        isAllDay = [bool]$item.AllDayEvent
        showAs = $showAs
        location = if ([string]::IsNullOrWhiteSpace([string]$item.Location)) { $null } else { [string]$item.Location }
        categories = $categories
        lastModifiedAt = ([DateTime]$item.LastModificationTime).ToUniversalTime().ToString('o')
        appointmentId = if ($mappings.ContainsKey($externalId)) { $mappings[$externalId] } else { $null }
      })

    } catch {
      $skipped++
      $reason = "line-$([int]$_.InvocationInfo.ScriptLineNumber)-$($_.Exception.GetType().Name)"
      Add-SkipReason -Reasons $skipReasons -Name $reason
    }
  }
  if ($limitExceeded) { throw 'El calendario supera el limite seguro de 5000 eventos.' }

  $snapshot = [ordered]@{
    deviceId = [string]$config.deviceId
    calendarName = [string]$config.calendarName
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    windowStart = $windowStartLocal.ToUniversalTime().ToString('o')
    windowEnd = $windowEndLocal.ToUniversalTime().ToString('o')
    complete = $true
    events = $events
  }
  $json = $snapshot | ConvertTo-Json -Depth 8 -Compress
  $headers = @{ Authorization = "Bearer $token" }
  $requestParameters = @{
    Uri = [string]$config.apiUrl
    Method = 'Post'
    Headers = $headers
    ContentType = 'application/json; charset=utf-8'
    Body = [Text.Encoding]::UTF8.GetBytes($json)
    TimeoutSec = 120
  }
  $response = Invoke-RestMethod @requestParameters

  if (-not $response.ok) { throw 'Varix rechazo el snapshot sin detalle.' }
  foreach ($mapping in @($response.mappings)) {
    if ($mapping.externalId -and $mapping.appointmentId) {
      $mappings[[string]$mapping.externalId] = [string]$mapping.appointmentId
    }
  }
  Save-State -Mappings $mappings
  $reasonSummary = ($skipReasons.GetEnumerator() | Sort-Object Name | ForEach-Object {
    "$($_.Name):$($_.Value)"
  }) -join ','
  Write-BridgeLog "OK enviados=$($events.Count) omitidos=$skipped vinculados=$($response.stats.matched) razones=$reasonSummary"
} catch {
  $safeMessage = ([string]$_.Exception.Message).Replace("`r", ' ').Replace("`n", ' ')
  $safeType = $_.Exception.GetType().FullName
  $safeLine = [int]$_.InvocationInfo.ScriptLineNumber
  Write-BridgeLog "ERROR type=$safeType line=$safeLine $safeMessage"
  exit 1
} finally {
  if ($hasMutex) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
