[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [string]$WorkspaceRoot = '',
  [string]$DevToolsRoot = 'D:\software\WeChatDevTools',
  [string]$ApiBaseUrl = 'http://127.0.0.1:3001'
)

$ErrorActionPreference = 'Stop'
$repoRoot = if ($WorkspaceRoot) {
  (Resolve-Path -LiteralPath $WorkspaceRoot).Path
} else {
  (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
}
$projectRoot = Join-Path $repoRoot 'apps\mini-program'
$wechatide = Join-Path $DevToolsRoot 'wechatide.cmd'
if (-not (Test-Path -LiteralPath $wechatide)) {
  throw "WeChat Developer Tools is missing: $wechatide"
}
Set-Location -LiteralPath $repoRoot

function Invoke-WeChatTool {
  param([string]$Tool, [string[]]$ToolArguments = @())

  $outputText = (& $wechatide -c Codex $Tool @ToolArguments | Out-String).Trim()
  $exitCode = $LASTEXITCODE
  $jsonStart = $outputText.IndexOf('{')
  if ($jsonStart -lt 0) {
    throw "WeChat tool '$Tool' returned no structured result (exit code $exitCode). Check its window."
  }
  try {
    $reply = $outputText.Substring($jsonStart) | ConvertFrom-Json
  } catch {
    throw "WeChat tool '$Tool' returned an unreadable result. Check its window."
  }
  if ($exitCode -ne 0 -and $reply.ok) {
    throw "WeChat tool '$Tool' exited with code $exitCode."
  }
  return $reply
}

function Assert-WeChatToolSucceeded {
  param([object]$Reply)

  if ($Reply.ok -and $Reply.result.success -ne $false) { return }
  $code = if ($Reply.code) { $Reply.code } elseif ($Reply.result.code) { $Reply.result.code } else { $Reply.errorType }
  $detail = if ($Reply.message) { $Reply.message } else { $Reply.result.message }
  $reason = "[$code] $detail"
  if ($code -in @('CONNECT_ERROR', 'AUTH_TASK_ERROR')) {
    throw "WeChat CLI connection/authorization failed. In WeChat Developer Tools, allow the Codex connection, then retry. The mini-program build is not the cause. Original error: $reason"
  }
  if ($code -in @('AUTH_DENIED', 'AUTH_ERROR')) {
    throw "WeChat did not authorize Codex. Check its authorization window. Original error: $reason"
  }
  if ($code -eq 'APPID_ERROR') {
    throw "WeChat rejected the project AppID. Configure a valid test AppID in project.private.config.json. Original error: $reason"
  }
  throw "WeChat tool request failed. Original error: $reason"
}

function Test-WeChatConfirmationPending {
  param([object]$Reply)

  if ($Reply.status -ne 'pending' -and $Reply.result.status -ne 'pending') { return $false }
  Write-Host 'WeChat is waiting for your confirmation. Click Allow in its Codex authorization window, then run this launcher again.'
  Write-Host 'The launcher has paused; the simulator has not opened yet.'
  return $true
}

# Check the official connection before starting services or rebuilding the package.
function Open-WeChatDesktop {
  # Use the same large Electron executable that the official CLI selects.
  $guiExecutable = Get-ChildItem -LiteralPath $DevToolsRoot -Filter '*.exe' -File |
    Where-Object { $_.Length -gt 50MB } | Sort-Object Length -Descending | Select-Object -First 1
  if (-not $guiExecutable) { throw 'The WeChat desktop executable is missing.' }
  $visibleWindow = @(Get-Process | Where-Object {
    $_.Path -eq $guiExecutable.FullName -and $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle
  })
  if ($visibleWindow.Count) { return }
  Write-Host 'Starting the WeChat desktop window before connecting its CLI...'
  Start-Process -FilePath $guiExecutable.FullName -WorkingDirectory $DevToolsRoot
  $deadline = (Get-Date).AddSeconds(20)
  do {
    Start-Sleep -Milliseconds 250
    $visibleWindow = @(Get-Process | Where-Object {
      $_.Path -eq $guiExecutable.FullName -and $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle
    })
  } while (-not $visibleWindow.Count -and (Get-Date) -lt $deadline)
  if (-not $visibleWindow.Count) {
    throw 'The WeChat desktop window did not become ready. Open the tool manually and retry.'
  }
}

Open-WeChatDesktop
Write-Host 'Checking the official WeChat connection first. If a Codex authorization window appears, click Allow there.'
$skillFile = Join-Path $DevToolsRoot 'resources\app.asar.unpacked\wechatide-skill\SKILL.md'
if (-not (Test-Path -LiteralPath $skillFile)) {
  throw 'The official WeChat skill is missing. Check or update WeChat Developer Tools.'
}
$skillVersion = [regex]::Match((Get-Content -LiteralPath $skillFile -Raw), '(?m)^version:\s*(\S+)').Groups[1].Value
if (-not $skillVersion) { throw 'The official WeChat skill version is missing.' }
$status = Invoke-WeChatTool -Tool 'check_wechatide_status' -ToolArguments @('--skill-version', $skillVersion)
Assert-WeChatToolSucceeded -Reply $status
if (Test-WeChatConfirmationPending -Reply $status) { return }
if ($status.result.versionRelation -notin @('equal', 'agent_ahead')) {
  throw "WeChat skill compatibility is not confirmed: $($status.result.versionRelation). Check the installed official skill."
}
if ($status.result.loginExpired -ne $false) {
  throw 'WeChat login is not ready. Sign in with your WeChat account in the developer tool, then retry.'
}
if ($status.result.cliTokenRequired -or $status.result.tokenRequired) {
  throw 'WeChat requires its configured CLI access token. Supply it through the official CLI settings before retrying; do not save it in this project.'
}

$apiReady = $false
try {
  $health = Invoke-RestMethod -Uri "$ApiBaseUrl/api/health/ready" -TimeoutSec 4
  $apiReady = $health.service -eq 'api' -and $health.status -eq 'ok'
} catch {}
if (-not $apiReady) {
  if ($ApiBaseUrl -ne 'http://127.0.0.1:3001') {
    throw "Configured API is not ready: $ApiBaseUrl"
  }
  & (Join-Path $repoRoot 'scripts\start-local-demo.ps1') -NoBrowser
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
$openResult = Invoke-WeChatTool -Tool 'open_project_window' -ToolArguments @('--project', $projectRoot, '--window-mode', 'fullMode')
Assert-WeChatToolSucceeded -Reply $openResult
if (Test-WeChatConfirmationPending -Reply $openResult) { return }
Write-Host 'The official tool accepted the request. Check the simulator for the rendered page.'
