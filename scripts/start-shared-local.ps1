[CmdletBinding()]
param([switch]$NoBrowser, [switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$configPath = Join-Path $repoRoot 'private-data/shared-runtime/config.json'
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$logRoot = Join-Path $repoRoot 'private-data/shared-runtime'
function Start-OwnedServer([string]$Name, [string]$Command) {
  $shell = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
  if (-not $shell) { $shell = (Get-Command powershell.exe).Source }
  $script = "Set-Location -LiteralPath '" + $repoRoot.Replace("'", "''") + "'; " + $Command
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
  Start-Process -FilePath $shell -ArgumentList '-NoProfile','-EncodedCommand',$encoded -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot "$Name.log") -RedirectStandardError (Join-Path $logRoot "$Name.error.log") | Out-Null
}
$apiUrl = 'http://127.0.0.1:3301'
try { $ready = Invoke-RestMethod "$apiUrl/api/health/ready" -TimeoutSec 3 } catch { $ready = $null }
if (-not $ready) {
  if (Get-NetTCPConnection -State Listen -LocalPort 3301 -ErrorAction SilentlyContinue) { throw '3301已被其他服务占用。' }
  $env:DATABASE_URL = 'postgresql://xiaoqiu:xiaoqiu-local-only@127.0.0.1:5432/' + $config.databaseName
  $env:NODE_ENV = 'production'
  $env:APP_VERSION = $config.sourceCommit
  $env:API_HOST = '127.0.0.1'
  $env:API_PORT = '3301'
  $env:DEFAULT_ORGANIZATION_ID = $config.organizationId
  $env:DEFAULT_TOURNAMENT_ID = $config.tournamentId
  $env:DEMO_FIXTURE_ORGANIZATION_ID = $config.organizationId
  $env:CORS_ORIGINS = $config.corsOrigins -join ','
  $env:POST_MEDIA_DIRECTORY = Join-Path $config.mediaDirectory 'posts'
  $env:MEDIA_ASSETS_DIRECTORY = $config.managedMediaDirectory
  $env:MEDIA_REVIEW_ALLOW_ORGANIZATION_ADMIN = 'true'
  $env:LOCAL_DEMO_SHORT_PASSWORDS = '0'
  $env:DEMO_ROLE_SWITCH_ENABLED = 'true'
  $env:DEMO_ROLE_SWITCH_OWNER_ID = $config.roleSwitchOwnerId
  foreach ($kind in @('api','worker')) {
    $entry = Join-Path $config.runtimeRoot "apps/$kind/dist/main.js"
    $child = Start-Process -FilePath $config.nodeExecutable -ArgumentList ('"' + $entry + '"') -WorkingDirectory (Join-Path $config.runtimeRoot "apps/$kind") -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot "$kind.log") -RedirectStandardError (Join-Path $logRoot "$kind.error.log") -PassThru
    $config | Add-Member -MemberType NoteProperty -Name "$($kind)ProcessId" -Value $child.Id -Force
  }
  $config | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $configPath -Encoding UTF8
  foreach ($attempt in 1..30) { try { $ready=Invoke-RestMethod "$apiUrl/api/health/ready" -TimeoutSec 2; break } catch { Start-Sleep -Seconds 1 } }
}
if (-not $ready -or $ready.version -ne $config.sourceCommit) { throw '统一后端尚未启动至配置版本。' }
if ($PrepareOnly) { Write-Host 'Shared API is ready; existing data preserved.'; exit 0 }
$alias = Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue
if (-not $alias) { Start-OwnedServer 'api-alias' 'node scripts/serve-shared-api-alias.mjs http://127.0.0.1:3301' }
else {
  $aliasReady = Invoke-RestMethod 'http://127.0.0.1:3001/api/health/ready' -TimeoutSec 3
  if ($aliasReady.version -ne $ready.version) { throw '3001仍在运行另一后端版本，请由集成者收尾旧服务。' }
}
$env:VITE_API_BASE_URL = 'http://127.0.0.1:3001'
$env:VITE_ORGANIZATION_ID = $config.organizationId
$env:VITE_LOCAL_SHORT_PASSWORDS = '0'
$env:VITE_H5_SESSION_BRIDGE = '1'
npm.cmd --prefix apps/admin-web run build -- --base /admin/
if ($LASTEXITCODE -ne 0) { throw '管理中心构建失败。' }
if (-not (Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue)) {
  Start-OwnedServer 'h5' ("`$env:TARO_APP_API_BASE_URL='http://127.0.0.1:3001'; `$env:TARO_APP_ORGANIZATION_ID='" + $config.organizationId + "'; `$env:TARO_APP_LOCAL_SHORT_PASSWORDS='0'; npm.cmd --prefix apps/mini-program run dev:h5")
}
foreach ($attempt in 1..90) {
  try { $page=Invoke-WebRequest 'http://127.0.0.1:3000/' -UseBasicParsing -TimeoutSec 2; if($page.StatusCode -eq 200){break} } catch { }
  Start-Sleep -Seconds 1
}
if (-not $page -or $page.StatusCode -ne 200) { throw '3000尚未就绪，请检查共享运行日志。' }
Write-Host 'Xiaoqiu shared local website: http://127.0.0.1:3000/'
Write-Host 'API: 3001 is an alias of the single shared API 3301; accounts and data are identical.'
if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:3000/' }
