[CmdletBinding()]
param([string]$Sender)
$ErrorActionPreference = 'Stop'
$taskRepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskMailFolder = Join-Path $taskRepoRoot 'private-data\mail'
$taskMailFile = Join-Path $taskMailFolder '.env.smtp'
if (-not $Sender -and (Test-Path -LiteralPath $taskMailFile)) {
  $taskSenderLine = Get-Content -LiteralPath $taskMailFile | Where-Object { $_ -match '^MAIL_USER=' } | Select-Object -First 1
  if ($taskSenderLine) { $Sender = $taskSenderLine.Substring(10).Trim() }
}
if (-not $Sender) { $Sender = Read-Host 'Sender QQ mailbox address' }
if ($Sender -notmatch '^\d{5,12}@qq\.com$') { throw 'Enter a QQ mailbox address such as 12345678@qq.com.' }
$taskSecureCode = Read-Host 'QQ SMTP authorization code (16 characters; hidden input, not your QQ password)' -AsSecureString
$taskCodePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecureCode)
try {
  $taskCode = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskCodePointer).Trim()
  if ($taskCode -notmatch '^[A-Za-z0-9]{16}$') { throw 'QQ authorization code must contain 16 letters/digits.' }
  $taskKeyBytes = New-Object byte[] 32
  $taskRandom = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $taskRandom.GetBytes($taskKeyBytes) } finally { $taskRandom.Dispose() }
  $taskSecret = [Convert]::ToBase64String($taskKeyBytes)
  if (Test-Path -LiteralPath $taskMailFile) {
    $taskOldSecret = Get-Content -LiteralPath $taskMailFile | Where-Object { $_ -match '^EMAIL_CODE_SECRET=' } | Select-Object -First 1
    if ($taskOldSecret -and $taskOldSecret.Length -gt 50) { $taskSecret = $taskOldSecret.Substring(18) }
  }
  New-Item -ItemType Directory -Path $taskMailFolder -Force | Out-Null
  $taskConfiguration = @(
    'EMAIL_AUTH_ENABLED=true', 'MAIL_HOST=smtp.qq.com', 'MAIL_PORT=465', 'MAIL_SECURE=true',
    "MAIL_USER=$Sender", "MAIL_PASSWORD=$taskCode", ('MAIL_FROM_NAME=' + [char]0x6653 + [char]0x7403), "EMAIL_CODE_SECRET=$taskSecret"
  )
  [IO.File]::WriteAllLines($taskMailFile, $taskConfiguration, (New-Object Text.UTF8Encoding($false)))
  Write-Host 'SMTP configuration saved to private-data/mail/.env.smtp. Authorization code was not printed.'
  Write-Host 'Restart the integrated API after migration; run the SMTP check before testing delivery.'
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskCodePointer)
  $taskCode = $null
  $taskConfiguration = $null
}
