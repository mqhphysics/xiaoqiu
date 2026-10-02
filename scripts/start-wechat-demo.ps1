[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [string]$DevToolsRoot = 'D:\software\WeChatDevTools',
  [string]$ApiBaseUrl = 'http://127.0.0.1:3001'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$projectRoot = Join-Path $repoRoot 'apps\mini-program'
$wechatide = Join-Path $DevToolsRoot 'wechatide.cmd'
if (-not (Test-Path -LiteralPath $wechatide)) {
  throw "WeChat Developer Tools is missing: $wechatide"
}
Set-Location -LiteralPath $repoRoot

$apiReady = $false
try {
  $health = Invoke-RestMethod -Uri "$ApiBaseUrl/api/health/ready" -TimeoutSec 4
  $apiReady = $health.service -eq 'api' -and $health.status -eq 'ok'
} catch {}
if (-not $apiReady) {
  if ($ApiBaseUrl -ne 'http://127.0.0.1:3001') {
    throw "Configured API is not ready: $ApiBaseUrl"
  }
  & (Join-Path $PSScriptRoot 'start-local-demo.ps1') -NoBrowser
  if ($LASTEXITCODE -ne 0) { throw 'Local API startup failed.' }
}

if (-not $SkipBuild) {
  $previousApiBaseUrl = $env:TARO_APP_API_BASE_URL
  try {
    $env:TARO_APP_API_BASE_URL = $ApiBaseUrl
    & npm.cmd --prefix $projectRoot run build
    if ($LASTEXITCODE -ne 0) { throw 'WeChat build failed.' }
  } finally {
    $env:TARO_APP_API_BASE_URL = $previousApiBaseUrl
  }
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist-weapp\app.json'))) {
  throw 'Mini-program output is missing. Run this script without -SkipBuild.'
}

Write-Host 'Opening Xiaoqiu in the official WeChat simulator...'
$openOutput = (& $wechatide -c Codex open_project_window --project $projectRoot --window-mode fullMode | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'WeChat Developer Tools could not open the project.' }
Write-Host $openOutput
$jsonStart = $openOutput.IndexOf('{')
if ($jsonStart -lt 0) { throw 'WeChat did not return a structured result. Check its window.' }
$openResult = $openOutput.Substring($jsonStart) | ConvertFrom-Json
if (-not $openResult.ok -or $openResult.result.success -eq $false) {
  throw 'WeChat could not open the project. Complete login/test AppID setup in its window and retry.'
}
if ($openResult.status -eq 'pending' -or $openResult.result.status -eq 'pending') {
  Write-Host 'WeChat is waiting for your confirmation. Finish the prompt in its window.'
} else {
  Write-Host 'The official tool accepted the request. Check the simulator for the rendered page.'
}
