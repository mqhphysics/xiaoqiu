[CmdletBinding()]
param(
  [switch]$NoBrowser,
  [string]$ApiBaseUrl = 'http://127.0.0.1:3001',
  [string]$OrganizationId
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$adminRoot = Join-Path $repoRoot 'apps\admin-web'
$runtimeRoot = Join-Path $repoRoot 'private-data\runtime'
$adminUrl = 'http://127.0.0.1:5173/'
$apiUrl = $ApiBaseUrl.TrimEnd('/') -replace '/api$', ''
$mutex = $null
$ownsMutex = $false

function Test-AdminReady {
  try {
    $page = Invoke-WebRequest -Uri $adminUrl -UseBasicParsing -TimeoutSec 3
    return $page.StatusCode -eq 200 -and $page.Content.Contains('xiaoqiu-admin-center')
  } catch { return $false }
}

try {
  $uri = [Uri]$apiUrl
  if ($uri.Scheme -notin @('http', 'https') -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) { throw 'API 地址必须为有效的 HTTP/HTTPS 服务地址。' }
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 并在项目目录安装依赖。' }
  if (-not (Test-Path -LiteralPath (Join-Path $adminRoot 'node_modules\vite\bin\vite.js'))) { throw '管理中心依赖尚未安装，请由集成负责人执行 pnpm install。' }
  if ($OrganizationId -and $OrganizationId -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') { throw '组织编号必须为 UUID。' }

  # Reuse the API; prepare it with the established launcher when unavailable.
  # No Seed is run and the public H5 service is never replaced.
  try { $health = Invoke-RestMethod -Uri "$apiUrl/api/health/ready" -TimeoutSec 3 } catch { $health = $null }
  if (-not $health -or $health.status -ne 'ok' -or $health.service -ne 'api') {
    if ($apiUrl -ne 'http://127.0.0.1:3001') { throw '指定的 API 尚未就绪，请先启动该数据服务。' }
    Write-Host '正在准备晓球本地数据服务，保留现有数据……'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'scripts\start-local-demo.ps1') -NoBrowser
    if ($LASTEXITCODE -ne 0) { throw "数据服务启动失败（退出码 $LASTEXITCODE）。" }
  }
  try { $definition = Invoke-RestMethod -Uri "$apiUrl/api/openapi.json" -TimeoutSec 5 } catch { throw '无法核对当前 API 的管理中心接口，请检查数据服务版本。' }
  if (-not ($definition.paths.PSObject.Properties.Name -contains '/api/admin/center/overview')) {
    throw '当前 API 版本尚未包含管理中心。请由集成负责人接入本任务代码并重启 API，再打开管理中心。'
  }

  if (-not $OrganizationId -and $apiUrl -eq 'http://127.0.0.1:3001') {
    # This is a public fixture selector, not a credential. Other organizations
    # pass -OrganizationId or enter their ID on the login page.
    $OrganizationId = '00000000-0000-4000-8000-000000000001'
  }
  if (-not $OrganizationId) { $OrganizationId = '' }
  $hash = [Security.Cryptography.SHA256]::Create()
  try { $key = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($repoRoot.ToLowerInvariant()))).Replace('-', '') } finally { $hash.Dispose() }
  $mutex = New-Object Threading.Mutex($false, "Local\Xiaoqiu.AdminCenter.$key")
  try { $ownsMutex = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
  if (-not $ownsMutex) { Write-Host '管理中心正在另一个窗口启动，请等待该窗口完成。'; exit 0 }

  if (-not (Test-AdminReady)) {
    if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) { throw '5173 端口被其他服务占用。请检查现有进程后重试，不会自动更换端口。' }
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    $rootEscaped = $repoRoot.Replace("'", "''")
    $apiEscaped = $apiUrl.Replace("'", "''")
    $orgEscaped = $OrganizationId.Replace("'", "''")
    $shortPasswords = if ($apiUrl -eq 'http://127.0.0.1:3001') { '1' } else { '0' }
    $command = "Set-Location -LiteralPath '$rootEscaped'; `$env:VITE_API_BASE_URL='/api'; `$env:VITE_API_PROXY_TARGET='$apiEscaped'; `$env:VITE_ORGANIZATION_ID='$orgEscaped'; `$env:VITE_LOCAL_SHORT_PASSWORDS='$shortPasswords'; npm.cmd --prefix apps/admin-web run dev"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
    Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeRoot 'admin-center.log') -RedirectStandardError (Join-Path $runtimeRoot 'admin-center.error.log') | Out-Null
    $deadline = (Get-Date).AddSeconds(60)
    while (-not (Test-AdminReady)) {
      if ((Get-Date) -gt $deadline) { throw '管理中心未在 60 秒内就绪，请查看 private-data/runtime/admin-center.error.log。' }
      Start-Sleep -Milliseconds 750
    }
  }
  if (-not $NoBrowser) { Start-Process $adminUrl }
  Write-Host "晓球管理中心已就绪：$adminUrl"
  Write-Host '请使用现有的获授权管理员账号登录。服务在后台运行，可关闭此窗口。'
} catch {
  Write-Error ('管理中心启动未完成：' + $_.Exception.Message)
  exit 1
} finally {
  if ($ownsMutex) { $mutex.ReleaseMutex() }
  if ($mutex) { $mutex.Dispose() }
}
