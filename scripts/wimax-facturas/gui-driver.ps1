param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Inspect', 'Foreground', 'Focus', 'Minimize', 'SendKeys', 'Click', 'Screenshot')]
  [string]$Action,

  [string]$OutputPath,

  [string]$PayloadPath,

  [string]$ProcessName,

  [string]$TitlePattern,

  [string]$ClassPattern,

  [string]$Keys,

  [int]$X,

  [int]$Y,

  [int]$DelayMs,

  [string]$ScreenshotPath
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

if (-not ('Varix.Wimax.NativeGui' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace Varix.Wimax {
  public sealed class WindowInfo {
    public long Handle { get; set; }
    public string Title { get; set; }
    public string ClassName { get; set; }
    public int ProcessId { get; set; }
    public string ProcessName { get; set; }
    public int SessionId { get; set; }
    public bool Visible { get; set; }
    public bool Minimized { get; set; }
    public int Left { get; set; }
    public int Top { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
  }

  public static class NativeGui {
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT {
      public int Left;
      public int Top;
      public int Right;
      public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct LASTINPUTINFO {
      public uint Size;
      public uint Time;
    }

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool ShowWindowAsync(IntPtr hWnd, int command);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool AttachThreadInput(uint sourceThread, uint targetThread, bool attach);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    private static extern bool GetLastInputInfo(ref LASTINPUTINFO info);

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);

    private static WindowInfo Describe(IntPtr hWnd) {
      var title = new StringBuilder(1024);
      var className = new StringBuilder(256);
      GetWindowText(hWnd, title, title.Capacity);
      GetClassName(hWnd, className, className.Capacity);

      uint processId;
      GetWindowThreadProcessId(hWnd, out processId);
      string processName = null;
      int sessionId = -1;
      try {
        var process = Process.GetProcessById((int)processId);
        processName = process.ProcessName;
        sessionId = process.SessionId;
      }
      catch { }

      RECT rect;
      GetWindowRect(hWnd, out rect);
      return new WindowInfo {
        Handle = hWnd.ToInt64(),
        Title = title.ToString(),
        ClassName = className.ToString(),
        ProcessId = (int)processId,
        ProcessName = processName,
        SessionId = sessionId,
        Visible = IsWindowVisible(hWnd),
        Minimized = IsIconic(hWnd),
        Left = rect.Left,
        Top = rect.Top,
        Width = Math.Max(0, rect.Right - rect.Left),
        Height = Math.Max(0, rect.Bottom - rect.Top)
      };
    }

    public static WindowInfo[] Windows() {
      var result = new List<WindowInfo>();
      EnumWindows(delegate(IntPtr hWnd, IntPtr ignored) {
        var info = Describe(hWnd);
        if (info.Visible && (!String.IsNullOrWhiteSpace(info.Title) ||
            String.Equals(info.ProcessName, "WIMAXP~1", StringComparison.OrdinalIgnoreCase))) {
          result.Add(info);
        }
        return true;
      }, IntPtr.Zero);
      return result.ToArray();
    }

    public static WindowInfo Foreground() {
      var handle = GetForegroundWindow();
      return handle == IntPtr.Zero ? null : Describe(handle);
    }

    public static bool ForceForeground(long rawHandle) {
      var handle = new IntPtr(rawHandle);
      uint processId;
      var targetThread = GetWindowThreadProcessId(handle, out processId);
      var currentThread = GetCurrentThreadId();
      uint foregroundProcessId;
      var foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), out foregroundProcessId);
      var attachedTarget = currentThread != targetThread && AttachThreadInput(currentThread, targetThread, true);
      var attachedForeground = currentThread != foregroundThread && foregroundThread != targetThread &&
        AttachThreadInput(currentThread, foregroundThread, true);
      try {
        ShowWindowAsync(handle, 9); // SW_RESTORE
        // A synthetic ALT transition releases Windows' foreground lock for this
        // interactive desktop without sending a character to the application.
        keybd_event(0x12, 0, 0, UIntPtr.Zero); // VK_MENU down
        BringWindowToTop(handle);
        var focused = SetForegroundWindow(handle);
        keybd_event(0x12, 0, 0x0002, UIntPtr.Zero); // KEYEVENTF_KEYUP
        return focused;
      }
      finally {
        if (attachedForeground) AttachThreadInput(currentThread, foregroundThread, false);
        if (attachedTarget) AttachThreadInput(currentThread, targetThread, false);
      }
    }

    public static bool Minimize(long rawHandle) {
      return ShowWindowAsync(new IntPtr(rawHandle), 6); // SW_MINIMIZE
    }

    public static uint IdleSeconds() {
      var info = new LASTINPUTINFO();
      info.Size = (uint)Marshal.SizeOf(info);
      if (!GetLastInputInfo(ref info)) return 0;
      return unchecked((uint)Environment.TickCount - info.Time) / 1000;
    }
  }
}
'@
}

function Read-Payload {
  $raw = [Console]::In.ReadToEnd()
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return [pscustomobject]@{}
  }
  return $raw | ConvertFrom-Json
}

function Write-Result([object]$Value) {
  $json = $Value | ConvertTo-Json -Depth 8 -Compress
  if ($OutputPath) {
    $directory = Split-Path -Parent $OutputPath
    if ($directory -and -not (Test-Path -LiteralPath $directory)) {
      New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($OutputPath, $json, [System.Text.UTF8Encoding]::new($false))
  }
  [Console]::Out.WriteLine($json)
}

function Find-Window([object]$Payload) {
  if ($Payload.foreground) {
    $foreground = [Varix.Wimax.NativeGui]::Foreground()
    if (-not $foreground) { throw 'No hay ventana en primer plano' }
    $processMatches = -not $Payload.process -or $foreground.ProcessName -ieq [string]$Payload.process
    $titleMatches = -not $Payload.titlePattern -or $foreground.Title -match [string]$Payload.titlePattern
    $classMatches = -not $Payload.classPattern -or $foreground.ClassName -match [string]$Payload.classPattern
    if (-not ($processMatches -and $titleMatches -and $classMatches)) {
      throw 'La ventana en primer plano no coincide con el perfil'
    }
    return $foreground
  }
  $windows = [Varix.Wimax.NativeGui]::Windows()
  $matches = @($windows | Where-Object {
    $processMatches = -not $Payload.process -or $_.ProcessName -ieq [string]$Payload.process
    $titleMatches = -not $Payload.titlePattern -or $_.Title -match [string]$Payload.titlePattern
    $classMatches = -not $Payload.classPattern -or $_.ClassName -match [string]$Payload.classPattern
    $processMatches -and $titleMatches -and $classMatches
  })
  if ($matches.Count -ne 1) {
    throw "Se esperaba una ventana y se encontraron $($matches.Count)"
  }
  return $matches[0]
}

$payload = if ($PayloadPath) {
  Get-Content -LiteralPath $PayloadPath -Raw | ConvertFrom-Json
}
elseif ($ProcessName -or $TitlePattern -or $ClassPattern -or $Keys -or $ScreenshotPath) {
  [pscustomobject]@{
    process = $ProcessName
    titlePattern = $TitlePattern
    classPattern = $ClassPattern
    keys = $Keys
    x = $X
    y = $Y
    delayMs = $DelayMs
    path = $ScreenshotPath
  }
}
elseif ([Console]::IsInputRedirected) {
  Read-Payload
}
else {
  [pscustomobject]@{}
}

switch ($Action) {
  'Inspect' {
    Write-Result ([pscustomobject]@{
      ok = $true
      windows = [Varix.Wimax.NativeGui]::Windows()
      foreground = [Varix.Wimax.NativeGui]::Foreground()
      idleSeconds = [Varix.Wimax.NativeGui]::IdleSeconds()
      sessionId = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
      screen = [pscustomobject]@{
        width = [System.Windows.Forms.SystemInformation]::VirtualScreen.Width
        height = [System.Windows.Forms.SystemInformation]::VirtualScreen.Height
      }
    })
  }
  'Foreground' {
    Write-Result ([pscustomobject]@{ ok = $true; foreground = [Varix.Wimax.NativeGui]::Foreground() })
  }
  'Focus' {
    $window = Find-Window $payload
    $focused = [Varix.Wimax.NativeGui]::ForceForeground($window.Handle)
    Start-Sleep -Milliseconds 250
    $foreground = [Varix.Wimax.NativeGui]::Foreground()
    if (-not $focused -or $foreground.Handle -ne $window.Handle) {
      throw 'Windows no concedio el foco a la ventana objetivo'
    }
    Write-Result ([pscustomobject]@{ ok = $true; foreground = $foreground })
  }
  'Minimize' {
    $window = Find-Window $payload
    if (-not [Varix.Wimax.NativeGui]::Minimize($window.Handle)) {
      throw "No fue posible minimizar $($window.Title)"
    }
    Start-Sleep -Milliseconds 250
    Write-Result ([pscustomobject]@{ ok = $true; handle = $window.Handle })
  }
  'SendKeys' {
    if (-not $payload.keys) { throw 'Falta keys' }
    $window = Find-Window $payload
    [void][Varix.Wimax.NativeGui]::ForceForeground($window.Handle)
    Start-Sleep -Milliseconds 150
    [System.Windows.Forms.SendKeys]::SendWait([string]$payload.keys)
    $delay = if ($payload.delayMs) { [int]$payload.delayMs } else { 350 }
    Start-Sleep -Milliseconds $delay
    Write-Result ([pscustomobject]@{ ok = $true; foreground = [Varix.Wimax.NativeGui]::Foreground() })
  }
  'Click' {
    $window = Find-Window $payload
    [void][Varix.Wimax.NativeGui]::ForceForeground($window.Handle)
    Start-Sleep -Milliseconds 150
    $x = $window.Left + [int]$payload.x
    $y = $window.Top + [int]$payload.y
    if ($x -lt $window.Left -or $x -ge ($window.Left + $window.Width) -or
        $y -lt $window.Top -or $y -ge ($window.Top + $window.Height)) {
      throw 'Las coordenadas estan fuera de la ventana objetivo'
    }
    [void][Varix.Wimax.NativeGui]::SetCursorPos($x, $y)
    [Varix.Wimax.NativeGui]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    [Varix.Wimax.NativeGui]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
    $delay = if ($payload.delayMs) { [int]$payload.delayMs } else { 350 }
    Start-Sleep -Milliseconds $delay
    Write-Result ([pscustomobject]@{ ok = $true; foreground = [Varix.Wimax.NativeGui]::Foreground() })
  }
  'Screenshot' {
    if (-not $payload.path) { throw 'Falta path' }
    $screen = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bitmap = [System.Drawing.Bitmap]::new($screen.Width, $screen.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.CopyFromScreen($screen.X, $screen.Y, 0, 0, $bitmap.Size)
      $directory = Split-Path -Parent ([string]$payload.path)
      if ($directory -and -not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
      }
      $bitmap.Save([string]$payload.path, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
      $graphics.Dispose()
      $bitmap.Dispose()
    }
    Write-Result ([pscustomobject]@{ ok = $true; path = [string]$payload.path })
  }
}
