param([string]$Go = 'go')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Game build failed' }
  $webTarget = [IO.Path]::GetFullPath((Join-Path $projectRoot 'launcher/web'))
  $expected = [IO.Path]::GetFullPath($projectRoot) + [IO.Path]::DirectorySeparatorChar + 'launcher' + [IO.Path]::DirectorySeparatorChar + 'web'
  if ($webTarget -ne $expected) { throw 'Unexpected launcher output path' }
  if (Test-Path -LiteralPath $webTarget) {
    if ((Resolve-Path -LiteralPath $webTarget).Path -ne $expected) { throw 'Launcher output resolves outside the project' }
    Remove-Item -LiteralPath $webTarget -Recurse -Force
  }
  New-Item -ItemType Directory -Path $webTarget -Force | Out-Null
  Copy-Item -Path (Join-Path $projectRoot 'dist/*') -Destination $webTarget -Recurse -Force
  Push-Location (Join-Path $projectRoot 'launcher')
  try {
    & $Go test -p=2 ./...
    if ($LASTEXITCODE -ne 0) { throw 'Launcher tests failed' }
    & $Go build -p=2 -trimpath -ldflags='-s -w -H=windowsgui' -o ../releases/GeneralsNoLimits.exe .
    if ($LASTEXITCODE -ne 0) { throw 'Launcher build failed' }
  } finally { Pop-Location }
  $checksum = (Get-FileHash -LiteralPath 'releases/GeneralsNoLimits.exe' -Algorithm SHA256).Hash.ToLower()
  Set-Content -LiteralPath 'releases/SHA256SUMS.txt' -Value ($checksum + '  releases/GeneralsNoLimits.exe')
} finally { Pop-Location }
