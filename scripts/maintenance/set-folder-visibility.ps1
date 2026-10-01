[CmdletBinding()]
param(
  [ValidateSet('Clean', 'Restore')]
  [string]$Mode = 'Clean'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$stateDirectory = Join-Path $repoRoot 'private-data\organization\2026-10-01'
$stateFile = Join-Path $stateDirectory 'visibility-before.json'
$names = @(
  '.github', '.pnpm-store', '.worktrees', 'node_modules',
  '.dockerignore', '.editorconfig', '.env.example', '.gitignore',
  '.prettierignore', '.prettierrc.json', 'AGENTS.md', 'README.md',
  'eslint.config.mjs', 'package.json', 'pnpm-lock.yaml',
  'pnpm-workspace.yaml', 'tsconfig.base.json'
)

if ($Mode -eq 'Restore') {
  if (-not (Test-Path -LiteralPath $stateFile -PathType Leaf)) {
    throw 'No original visibility record was found.'
  }
  $records = @(Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json)
  foreach ($record in $records) {
    if ($names -notcontains $record.name) { throw 'Unexpected path in visibility record.' }
    $item = Get-Item -LiteralPath (Join-Path $repoRoot $record.name) -Force
    # Restore only Hidden; preserve all unrelated attribute changes.
    if ($record.hidden) {
      $item.Attributes = $item.Attributes -bor [IO.FileAttributes]::Hidden
    } else {
      $item.Attributes = $item.Attributes -band (-bnot [IO.FileAttributes]::Hidden)
    }
  }
  Write-Output ('Restored visibility for {0} entries.' -f $records.Count)
  return
}

$items = @($names | ForEach-Object { Get-Item -LiteralPath (Join-Path $repoRoot $_) -Force })
if (-not (Test-Path -LiteralPath $stateFile)) {
  New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
  $records = @($items | ForEach-Object {
    [pscustomobject]@{
      name = $_.Name
      hidden = [bool]($_.Attributes -band [IO.FileAttributes]::Hidden)
    }
  })
  $records | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
}
foreach ($item in $items) {
  $item.Attributes = $item.Attributes -bor [IO.FileAttributes]::Hidden
}
Write-Output ('Hidden {0} configuration/cache entries; file contents and paths are unchanged.' -f $items.Count)
