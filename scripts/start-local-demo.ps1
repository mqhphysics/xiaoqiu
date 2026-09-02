[CmdletBinding()]
param(
  [switch]$PrepareOnly,
  [switch]$SkipSeed
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$composeFile = Join-Path $repoRoot 'infra\compose.yaml'
$composeEnv = Join-Path $repoRoot 'infra\.env.example'
$databaseUrl = 'postgresql://xiaoqiu:xiaoqiu-local-only@localhost:5432/xiaoqiu'

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory)]
    [string]$Name,
    [Parameter(Mandatory)]
    [scriptblock]$Command
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE."
  }
}

function Test-ApiReady {
  param([Parameter(Mandatory)][string]$Uri)

  try {
    $response = Invoke-RestMethod -Uri $Uri -TimeoutSec 3
    return $response.service -eq 'api' -and $response.status -eq 'ok'
  } catch {
    return $false
  }
}

function Test-H5Ready {
  param([Parameter(Mandatory)][string]$Uri)

  try {
    $response = Invoke-WebRequest -Uri $Uri -TimeoutSec 3 -UseBasicParsing
    return $response.StatusCode -eq 200 -and $response.Content -match '<title>晓球</title>'
  } catch {
    return $false
  }
}

function Start-VisiblePowerShell {
  param(
    [Parameter(Mandatory)][string]$Command,
    [Parameter(Mandatory)][string]$Title
  )

  $shell = Get-Command pwsh -ErrorAction SilentlyContinue
  if (-not $shell) {
    $shell = Get-Command powershell -ErrorAction Stop
  }
  $windowCommand = "`$Host.UI.RawUI.WindowTitle = '$Title'; $Command"
  $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($windowCommand))
  Start-Process -FilePath $shell.Source -ArgumentList '-NoExit', '-EncodedCommand', $encodedCommand -WorkingDirectory $repoRoot -WindowStyle Normal | Out-Null
}

Set-Location -LiteralPath $repoRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is not available. Start Docker Desktop and try again.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm is not available. Install Node.js 22 or newer and try again.'
}

Write-Host '[1/4] Starting PostgreSQL...'
Invoke-CheckedCommand 'docker compose' {
  docker compose --env-file $composeEnv -f $composeFile up -d postgres
}

$env:DATABASE_URL = $databaseUrl
Write-Host '[2/4] Applying database migrations...'
Invoke-CheckedCommand 'database migration' {
  npm --prefix apps/api run db:migrate:deploy
}

if (-not $SkipSeed) {
  Write-Host '[3/4] Restoring the five demo accounts...'
  Invoke-CheckedCommand 'demo seed' {
    npm --prefix apps/api run db:seed
  }
} else {
  Write-Host '[3/4] Demo seed skipped.'
}

if ($PrepareOnly) {
  Write-Host 'Local database preparation completed.' -ForegroundColor Green
  exit 0
}

Write-Host '[4/4] Starting API and H5 in separate windows...'
$apiHealthUrl = 'http://127.0.0.1:3001/api/health/ready'
$h5Url = 'http://127.0.0.1:10087/'

if (-not (Test-ApiReady -Uri $apiHealthUrl)) {
  Start-VisiblePowerShell -Title '晓球 API :3001' -Command "`$env:DATABASE_URL='$databaseUrl'; `$env:API_PORT='3001'; npm --prefix apps/api run dev"
  $apiReady = $false
  foreach ($attempt in 1..60) {
    Start-Sleep -Seconds 1
    if (Test-ApiReady -Uri $apiHealthUrl) {
      $apiReady = $true
      break
    }
  }
  if (-not $apiReady) {
    throw 'API did not become ready on port 3001. Check the API window for details.'
  }
}

if (-not (Test-H5Ready -Uri $h5Url)) {
  Start-VisiblePowerShell -Title '晓球 H5 :10087' -Command "`$env:TARO_APP_API_BASE_URL='http://127.0.0.1:3001'; npm --prefix apps/mini-program run dev:h5"
  $h5Ready = $false
  foreach ($attempt in 1..90) {
    Start-Sleep -Seconds 1
    if (Test-H5Ready -Uri $h5Url) {
      $h5Ready = $true
      break
    }
  }
  if (-not $h5Ready) {
    throw 'H5 did not become ready on port 10087. Check the H5 window for details.'
  }
}

Write-Host ''
Write-Host '晓球本地演示已启动：' -ForegroundColor Green
Write-Host "  H5: $h5Url"
Write-Host "  API: $apiHealthUrl"
Write-Host '  用户名: student / player / captain / reporter / admin'
Write-Host '  共同密码: Xiaoqiu2026!'
