param(
  [Parameter(Mandatory)][int]$Handle,
  [Parameter(Mandatory)][double]$XRatio,
  [Parameter(Mandatory)][double]$YRatio
)
$ErrorActionPreference = 'Stop'
if ($XRatio -lt 0 -or $XRatio -gt 1 -or $YRatio -lt 0 -or $YRatio -gt 1) {
  throw 'Click ratios must stay inside the verified target window.'
}
Add-Type -AssemblyName UIAutomationClient
$window = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$Handle)
$owner = Get-Process -Id $window.Current.ProcessId
if ($owner.ProcessName -ne '微信开发者工具') { throw 'Target is not the WeChat developer tool.' }
Add-Type @'
using System; using System.Runtime.InteropServices;
public class WeChatWindowClick {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle,out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr handle,IntPtr order,int x,int y,int width,int height,uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
}
'@
[WeChatWindowClick]::SetProcessDPIAware() | Out-Null
[WeChatWindowClick]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
$rect = New-Object WeChatWindowClick+RECT
if (-not [WeChatWindowClick]::GetWindowRect([IntPtr]$Handle,[ref]$rect)) { throw 'Target window is unavailable.' }
try {
  if (-not [WeChatWindowClick]::SetWindowPos([IntPtr]$Handle,[IntPtr](-1),0,0,0,0,0x43)) { throw 'Cannot bring the verified window forward.' }
  [WeChatWindowClick]::SetForegroundWindow([IntPtr]$Handle) | Out-Null
  Start-Sleep -Milliseconds 250
  [WeChatWindowClick]::SetCursorPos(
    [int]($rect.Left + ($rect.Right-$rect.Left)*$XRatio),
    [int]($rect.Top + ($rect.Bottom-$rect.Top)*$YRatio)) | Out-Null
  [WeChatWindowClick]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
  [WeChatWindowClick]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
} finally {
  [WeChatWindowClick]::SetWindowPos([IntPtr]$Handle,[IntPtr](-2),0,0,0,0,0x3) | Out-Null
}
Write-Output 'Clicked inside the verified WeChat window; check its resulting state.'
