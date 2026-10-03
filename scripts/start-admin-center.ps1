[CmdletBinding()]
param(
  [switch]$NoBrowser,
  [switch]$RequireAccountLogin,
  [string]$ApiBaseUrl = 'http://127.0.0.1:3001',
  [string]$DatabaseUrl,
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
$hash = [Security.Cryptography.SHA256]::Create()
try { $repoKey = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($repoRoot.ToLowerInvariant()))).Replace('-', '').ToLowerInvariant() } finally { $hash.Dispose() }

function Test-AdminReady {
  try {
    $page = Invoke-WebRequest -Uri $adminUrl -UseBasicParsing -TimeoutSec 3
    $status = Invoke-RestMethod -Uri ($adminUrl + '__admin-center/status') -TimeoutSec 10
    return $page.StatusCode -eq 200 -and $page.Content.Contains('xiaoqiu-admin-center') -and $status.ready -and $status.workspaceFingerprint -eq $repoKey.Substring(0,16) -and $status.singleOwner -eq (-not $RequireAccountLogin)
  } catch { return $false }
}

try {
  $uri = [Uri]$apiUrl
  if ($uri.Scheme -notin @('http', 'https') -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) { throw 'API 地址必须为有效的 HTTP/HTTPS 服务地址。' }
  if (-not $DatabaseUrl) { $DatabaseUrl = $env:ADMIN_DATABASE_URL }
  if (-not $DatabaseUrl) { $DatabaseUrl = $env:DATABASE_URL }
  if (-not $DatabaseUrl -and $apiUrl -eq 'http://127.0.0.1:3001') { $DatabaseUrl = 'postgresql://xiaoqiu:xiaoqiu-local-only@127.0.0.1:5432/xiaoqiu' }
  if (-not $DatabaseUrl) { throw '指定其他 API 时需同时传入 DatabaseUrl，保证管理模块与 API 使用同一数据库。' }
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 并在项目目录安装依赖。' }
  if (-not (Test-Path -LiteralPath (Join-Path $adminRoot 'node_modules\vite\bin\vite.js'))) { throw '管理中心依赖尚未安装，请由集成负责人执行 pnpm install。' }
  if ($OrganizationId -and $OrganizationId -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') { throw '组织编号必须为 UUID。' }
  $mutex = New-Object Threading.Mutex($false, "Local\Xiaoqiu.AdminCenter.$repoKey")
  try { $ownsMutex = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
  if (-not $ownsMutex) { Write-Host '管理中心正在另一个窗口启动，请等待该窗口完成。'; exit 0 }
  $reuseRunningCenter = Test-AdminReady
  $compiledModule = Join-Path $repoRoot 'apps\api\dist\admin-center\local-owner-access.service.js'
  $sources = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'apps\api\src\admin-center') -Filter '*.ts' | Where-Object { $_.Name -notlike '*.spec.ts' }
  if (-not $reuseRunningCenter -and (-not (Test-Path -LiteralPath $compiledModule) -or ($sources | Where-Object { $_.LastWriteTimeUtc -gt (Get-Item -LiteralPath $compiledModule).LastWriteTimeUtc }))) {
    Write-Host '正在准备本机管理模块……'
    & npm.cmd --prefix (Join-Path $repoRoot 'apps\api') run build
    if ($LASTEXITCODE -ne 0) { throw '管理模块编译失败，请检查上方错误。' }
  }

  # Reuse the API; prepare it with the established launcher when unavailable.
  # No Seed is run and the public H5 service is never replaced.
  try { $health = Invoke-RestMethod -Uri "$apiUrl/api/health/ready" -TimeoutSec 3 } catch { $health = $null }
  if (-not $health -or $health.status -ne 'ok' -or $health.service -ne 'api') {
    if ($apiUrl -ne 'http://127.0.0.1:3001') { throw '指定的 API 尚未就绪，请先启动该数据服务。' }
    Write-Host '正在准备晓球本地数据服务，保留现有数据……'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'scripts\start-local-demo.ps1') -NoBrowser
    if ($LASTEXITCODE -ne 0) { throw "数据服务启动失败（退出码 $LASTEXITCODE）。" }
  }

  if (-not $OrganizationId -and $apiUrl -eq 'http://127.0.0.1:3001') {
    # This is a public fixture selector, not a credential. Other organizations
    # pass -OrganizationId or enter their ID on the login page.
    $OrganizationId = '00000000-0000-4000-8000-000000000001'
  }
  if (-not $OrganizationId) { $OrganizationId = '' }

  if (-not (Test-AdminReady)) {
    $listeners = & netstat.exe -ano -p tcp
    if ($listeners -match '^\s*TCP\s+\S+:5173\s+\S+\s+LISTENING\s+\d+') { throw '5173 已有其他版本或运行方式的管理服务。请关闭对应管理服务后重试，不会自动替换服务或更换端口。' }
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    $rootEscaped = $repoRoot.Replace("'", "''")
    $apiEscaped = $apiUrl.Replace("'", "''")
    $orgEscaped = $OrganizationId.Replace("'", "''")
    $databaseEscaped = $DatabaseUrl.Replace("'", "''")
    $shortPasswords = if ($apiUrl -eq 'http://127.0.0.1:3001') { '1' } else { '0' }
    $singleOwner = if ($RequireAccountLogin) { '0' } else { '1' }
    $command = "Set-Location -LiteralPath '$rootEscaped'; `$env:VITE_API_BASE_URL='/api'; `$env:VITE_API_PROXY_TARGET='$apiEscaped'; `$env:VITE_ORGANIZATION_ID='$orgEscaped'; `$env:VITE_LOCAL_SHORT_PASSWORDS='$shortPasswords'; `$env:ADMIN_SINGLE_OWNER='$singleOwner'; `$env:ADMIN_DATABASE_URL='$databaseEscaped'; npm.cmd --prefix apps/admin-web run dev"
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
  if ($RequireAccountLogin) { Write-Host '已启用账号登录方式。' } else { Write-Host '点击“进入管理中心”即可，无需输入账号密码。' }
  Write-Host '服务在后台运行，可关闭此窗口。'
} catch {
  Write-Error ('管理中心启动未完成：' + $_.Exception.Message)
  exit 1
} finally {
  if ($ownsMutex) { $mutex.ReleaseMutex() }
  if ($mutex) { $mutex.Dispose() }
}
