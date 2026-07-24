param(
  [string]$SourceDir = 'C:\wimax',
  [string]$DestinationDir = 'D:\varix-wimax-transfer',
  [string]$SevenZipExe = 'C:\wimax\7z.exe',
  [securestring]$EncryptionPassword
)

$ErrorActionPreference = 'Stop'

$source = [IO.Path]::GetFullPath($SourceDir).TrimEnd('\')
$destination = [IO.Path]::GetFullPath($DestinationDir).TrimEnd('\')

if (-not (Test-Path -LiteralPath $source -PathType Container)) {
  throw "No existe la instalacion origen: $source"
}
if (-not (Test-Path -LiteralPath $SevenZipExe -PathType Leaf)) {
  throw "No existe 7-Zip: $SevenZipExe"
}
if ($destination.StartsWith($source + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'El destino no puede estar dentro de C:\wimax'
}

$runningFromSource = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
  try {
    $_.Path -and $_.Path.StartsWith(
      $source + '\',
      [StringComparison]::OrdinalIgnoreCase
    )
  }
  catch {
    $false
  }
})
if ($runningFromSource.Count -gt 0) {
  $names = ($runningFromSource.ProcessName | Sort-Object -Unique) -join ', '
  throw "Hay procesos de WiMAX abiertos: $names"
}

if (-not $EncryptionPassword) {
  $EncryptionPassword = Read-Host `
    'Clave temporal para cifrar la copia (no se guarda)' `
    -AsSecureString
}
if (-not $EncryptionPassword -or $EncryptionPassword.Length -lt 12) {
  throw 'La clave temporal debe tener al menos 12 caracteres'
}

$sourceFiles = @(Get-ChildItem -LiteralPath $source -File -Recurse -Force)
$sourceBytes = [long](($sourceFiles | Measure-Object Length -Sum).Sum)
$sourceLatestWrite = ($sourceFiles | Measure-Object LastWriteTimeUtc -Maximum).Maximum
$destinationRoot = [IO.Path]::GetPathRoot($destination)
$destinationDrive = Get-CimInstance Win32_LogicalDisk -Filter (
  "DeviceID='{0}'" -f $destinationRoot.TrimEnd('\')
)
if ($destinationDrive -and $destinationDrive.FreeSpace -lt ($sourceBytes + 2GB)) {
  throw 'No hay espacio libre suficiente para crear una copia verificable'
}

New-Item -ItemType Directory -Path $destination -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archive = Join-Path $destination "wimax-$stamp.7z"
$manifest = Join-Path $destination "wimax-$stamp.manifest.json"

$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
  $EncryptionPassword
)
try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
    $passwordPointer
  )
  & $SevenZipExe a -t7z -mx=3 -mmt=on -mhe=on "-p$plainPassword" `
    $archive (Join-Path $source '*')
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $archive -PathType Leaf)) {
    throw "7-Zip no termino correctamente (codigo $LASTEXITCODE)"
  }
  & $SevenZipExe t "-p$plainPassword" $archive | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "7-Zip no pudo verificar la copia (codigo $LASTEXITCODE)"
  }
}
finally {
  $plainPassword = $null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}

$afterFiles = @(Get-ChildItem -LiteralPath $source -File -Recurse -Force)
$afterBytes = [long](($afterFiles | Measure-Object Length -Sum).Sum)
$afterLatestWrite = ($afterFiles | Measure-Object LastWriteTimeUtc -Maximum).Maximum
if (
  $afterFiles.Count -ne $sourceFiles.Count -or
  $afterBytes -ne $sourceBytes -or
  $afterLatestWrite -ne $sourceLatestWrite
) {
  throw 'La instalacion cambio durante la copia; el archivo no es apto para migrar'
}

$archiveInfo = Get-Item -LiteralPath $archive
$critical = @(
  'WX.EXE',
  'WIMAX.EXE',
  'CENTER26\tmdir.dbf'
) | ForEach-Object {
  $file = Join-Path $source $_
  if (Test-Path -LiteralPath $file -PathType Leaf) {
    $info = Get-Item -LiteralPath $file
    [pscustomobject]@{
      relative_path = $_
      bytes = $info.Length
      last_write_utc = $info.LastWriteTimeUtc.ToString('o')
      sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }
}

$result = [pscustomobject]@{
  created_utc = [DateTime]::UtcNow.ToString('o')
  source = $source
  source_files = $sourceFiles.Count
  source_bytes = $sourceBytes
  source_latest_write_utc = $sourceLatestWrite.ToUniversalTime().ToString('o')
  archive = $archiveInfo.FullName
  archive_bytes = $archiveInfo.Length
  archive_sha256 = (
    Get-FileHash -LiteralPath $archive -Algorithm SHA256
  ).Hash.ToLowerInvariant()
  critical_files = @($critical)
}
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifest -Encoding UTF8
$result | ConvertTo-Json -Depth 5
