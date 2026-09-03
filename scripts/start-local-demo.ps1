[CmdletBinding()]
param(
  [switch]$PrepareOnly,
  [switch]$SkipSeed,
  [switch]$Seed,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$composeFile = Join-Path $repoRoot 'infra\compose.yaml'
$composeEnv = Join-Path $repoRoot 'infra\.env.example'
$databaseUrl = 'postgresql://xiaoqiu:xiaoqiu-local-only@localhost:5432/xiaoqiu'
$logDirectory = Join-Path $repoRoot 'private-data\runtime'

if ($Seed -and $SkipSeed) {
  throw 'Choose either -Seed or -SkipSeed, not both.'
}

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
    $expectedTitle = '<title>' + [char]0x6653 + [char]0x7403 + '</title>'
    return $response.StatusCode -eq 200 -and $response.Content.Contains($expectedTitle)
  } catch {
    return $false
  }
}

function Start-BackgroundServer {
  param(
    [Parameter(Mandatory)][string]$Command,
    [Parameter(Mandatory)][string]$Name
  )

  $shell = Get-Command pwsh -ErrorAction SilentlyContinue
  if (-not $shell) {
    $shell = Get-Command powershell -ErrorAction Stop
  }
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
  $escapedRoot = $repoRoot.Replace("'", "''")
  $windowCommand = "Set-Location -LiteralPath '$escapedRoot'; $Command"
  $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($windowCommand))
  Start-Process -FilePath $shell.Source -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encodedCommand -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory "$Name.log") -RedirectStandardError (Join-Path $logDirectory "$Name.error.log") | Out-Null
}

function Test-DockerReady {
  try {
    & docker info --format '{{.ServerVersion}}' *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Assert-PortAvailable {
  param([int]$Port)
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    throw "Port $Port is occupied but the service is not ready. Check the existing process before retrying."
  }
}

Set-Location -LiteralPath $repoRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is not available. Start Docker Desktop and try again.'
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw 'npm is not available. Install Node.js 22 or newer and try again.'
}
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'apps\api\node_modules\.bin\prisma.cmd'))) {
  throw 'Dependencies are missing. Run pnpm install in the repository first.'
}

if (-not (Test-DockerReady)) {
  $dockerDesktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (-not (Test-Path -LiteralPath $dockerDesktop)) {
    throw 'Start Docker Desktop, wait for the engine to be ready, then try again.'
  }
  Write-Host 'Starting Docker Desktop; this may take a few minutes...'
  Start-Process -FilePath $dockerDesktop -WindowStyle Hidden | Out-Null
  $deadline = (Get-Date).AddMinutes(3)
  while (-not (Test-DockerReady)) {
    if ((Get-Date) -gt $deadline) {
      throw 'Docker engine is not ready. Open Docker Desktop and check its status.'
    }
    Start-Sleep -Seconds 3
  }
}

Write-Host '[1/4] Starting PostgreSQL...'
Invoke-CheckedCommand 'docker compose' {
  docker compose --env-file $composeEnv -f $composeFile up -d --wait --wait-timeout 120 postgres
}

$env:DATABASE_URL = $databaseUrl
Write-Host '[2/4] Applying database migrations...'
Invoke-CheckedCommand 'database migration' {
  npm.cmd --prefix apps/api run db:migrate:deploy
}

if ($Seed) {
  Write-Host '[3/4] Restoring demo data (explicit -Seed request)...'
  Invoke-CheckedCommand 'demo seed' {
    npm.cmd --prefix apps/api run db:seed
  }
} else {
  Write-Host '[3/4] Keeping existing data. Use -Seed only to initialize or restore demo data.'
}

if ($PrepareOnly) {
  Write-Host 'Local database preparation completed.' -ForegroundColor Green
  exit 0
}

Write-Host '[4/4] Starting API and H5 in the background...'
$apiHealthUrl = 'http://127.0.0.1:3001/api/health/ready'
$h5Url = 'http://127.0.0.1:10087/'

if (-not (Test-ApiReady -Uri $apiHealthUrl)) {
  Assert-PortAvailable -Port 3001
  Start-BackgroundServer -Name 'api' -Command "`$env:DATABASE_URL='$databaseUrl'; `$env:API_PORT='3001'; npm.cmd --prefix apps/api run dev"
  $apiReady = $false
  foreach ($attempt in 1..60) {
    Start-Sleep -Seconds 1
    if (Test-ApiReady -Uri $apiHealthUrl) {
      $apiReady = $true
      break
    }
  }
  if (-not $apiReady) {
    throw "API did not become ready on port 3001. Check $logDirectory\api.error.log and api.log."
  }
}

if (-not (Test-H5Ready -Uri $h5Url)) {
  Assert-PortAvailable -Port 10087
  Start-BackgroundServer -Name 'h5' -Command "`$env:TARO_APP_API_BASE_URL='http://127.0.0.1:3001'; npm.cmd --prefix apps/mini-program run dev:h5"
  $h5Ready = $false
  foreach ($attempt in 1..90) {
    Start-Sleep -Seconds 1
    if (Test-H5Ready -Uri $h5Url) {
      $h5Ready = $true
      break
    }
  }
  if (-not $h5Ready) {
    throw "H5 did not become ready on port 10087. Check $logDirectory\h5.error.log and h5.log."
  }
}

Write-Host ''
Write-Host 'Xiaoqiu local demo is ready.' -ForegroundColor Green
Write-Host "  H5: $h5Url"
Write-Host "  API: $apiHealthUrl"
Write-Host "  Logs: $logDirectory"
if (-not $NoBrowser) {
  Start-Process $h5Url
}
