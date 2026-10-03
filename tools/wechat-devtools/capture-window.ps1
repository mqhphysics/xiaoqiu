param([string]$Title = '', [string]$Output = 'private-data/runtime/wechat-window.png')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WeChatWindowCapture {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr handle, IntPtr deviceContext, uint flags);
}
'@
$ideIds = @(Get-Process | Where-Object ProcessName -eq '微信开发者工具' | ForEach-Object Id)
$windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
  [System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
$window = $windows | Where-Object {
  $_.Current.ProcessId -in $ideIds -and ($Title -eq '' -or $_.Current.Name -eq $Title)
} | Select-Object -First 1
if (-not $window) { throw 'WeChat IDE window not found' }
$handle = [IntPtr]$window.Current.NativeWindowHandle
$rect = New-Object WeChatWindowCapture+RECT
[WeChatWindowCapture]::GetWindowRect($handle, [ref]$rect) | Out-Null
$bitmap = New-Object System.Drawing.Bitmap ($rect.Right-$rect.Left),($rect.Bottom-$rect.Top)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $deviceContext = $graphics.GetHdc()
  try {
    $captured = [WeChatWindowCapture]::PrintWindow($handle, $deviceContext, 2)
  } finally { $graphics.ReleaseHdc($deviceContext) }
  if (-not $captured) { throw 'The target window could not be captured. Do not capture another foreground window.' }
  $outputPath = [IO.Path]::GetFullPath((Join-Path (Get-Location).Path $Output))
  New-Item -ItemType Directory -Path (Split-Path -Parent $outputPath) -Force | Out-Null
  $bitmap.Save($outputPath,[System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output $outputPath
} finally { $graphics.Dispose(); $bitmap.Dispose() }
