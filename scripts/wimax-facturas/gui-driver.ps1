param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Inspect', 'Foreground', 'Focus', 'Minimize', 'SendKeys', 'Click', 'Screenshot', 'PromptUrgent')]
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

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint desiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SwitchDesktop(IntPtr desktop);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool CloseDesktop(IntPtr desktop);

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

    public static bool InteractiveDesktopAvailable() {
      const uint DESKTOP_SWITCHDESKTOP = 0x0100;
      var desktop = OpenInputDesktop(0, false, DESKTOP_SWITCHDESKTOP);
      if (desktop == IntPtr.Zero) return false;
      try {
        return SwitchDesktop(desktop);
      }
      finally {
        CloseDesktop(desktop);
      }
    }
  }
}
'@
}

function Show-UrgentPrompt([object]$Payload) {
  $timeoutSeconds = if ($Payload.timeoutSeconds) { [int]$Payload.timeoutSeconds } else { 45 }
  $timeoutSeconds = [Math]::Min([Math]::Max($timeoutSeconds, 15), 120)

  $form = [System.Windows.Forms.Form]::new()
  $form.Text = 'VarixCenter - factura urgente'
  $form.ClientSize = [System.Drawing.Size]::new(560, 260)
  $form.StartPosition = 'CenterScreen'
  $form.FormBorderStyle = 'FixedDialog'
  $form.MaximizeBox = $false
  $form.MinimizeBox = $false
  $form.TopMost = $true
  $form.ShowInTaskbar = $true
  $form.Tag = 'timeout'

  $title = [System.Windows.Forms.Label]::new()
  $title.Text = 'Hay una factura urgente pendiente'
  $title.Font = [System.Drawing.Font]::new('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)
  $title.Location = [System.Drawing.Point]::new(24, 20)
  $title.Size = [System.Drawing.Size]::new(510, 34)

  $message = [System.Windows.Forms.Label]::new()
  $message.Text = "WiMAX necesita usar el teclado y la pantalla durante unos minutos.`r`nGuarde su trabajo y deje WiMAX abierto en la pantalla principal."
  $message.Font = [System.Drawing.Font]::new('Segoe UI', 10)
  $message.Location = [System.Drawing.Point]::new(24, 64)
  $message.Size = [System.Drawing.Size]::new(510, 58)

  $countdown = [System.Windows.Forms.Label]::new()
  $countdown.Text = "La ventana se cerrara en $timeoutSeconds segundos sin iniciar nada."
  $countdown.ForeColor = [System.Drawing.Color]::DimGray
  $countdown.Location = [System.Drawing.Point]::new(24, 126)
  $countdown.Size = [System.Drawing.Size]::new(510, 24)
  $countdown.Tag = $timeoutSeconds

  $nowButton = [System.Windows.Forms.Button]::new()
  $nowButton.Text = 'Facturar ahora'
  $nowButton.Location = [System.Drawing.Point]::new(24, 178)
  $nowButton.Size = [System.Drawing.Size]::new(150, 42)
  $nowButton.Add_Click({ $form.Tag = 'ahora'; $form.Close() })

  $remindButton = [System.Windows.Forms.Button]::new()
  $remindButton.Text = 'Recordar en 5 min'
  $remindButton.Location = [System.Drawing.Point]::new(190, 178)
  $remindButton.Size = [System.Drawing.Size]::new(160, 42)
  $remindButton.Add_Click({ $form.Tag = 'recordar'; $form.Close() })

  $closeButton = [System.Windows.Forms.Button]::new()
  $closeButton.Text = 'Dejar para el cierre'
  $closeButton.Location = [System.Drawing.Point]::new(366, 178)
  $closeButton.Size = [System.Drawing.Size]::new(168, 42)
  $closeButton.Add_Click({ $form.Tag = 'cierre'; $form.Close() })

  $timer = [System.Windows.Forms.Timer]::new()
  $timer.Interval = 1000
  $timer.Add_Tick({
    $countdown.Tag = [int]$countdown.Tag - 1
    $remaining = [int]$countdown.Tag
    $countdown.Text = "La ventana se cerrara en $remaining segundos sin iniciar nada."
    if ($remaining -le 0) {
      $form.Tag = 'timeout'
      $form.Close()
    }
  })

  $form.Controls.AddRange(@($title, $message, $countdown, $nowButton, $remindButton, $closeButton))
  $form.AcceptButton = $nowButton
  $form.Add_Shown({ $form.Activate(); $timer.Start() })
  try {
    [void]$form.ShowDialog()
    return [string]$form.Tag
  }
  finally {
    $timer.Stop()
    $timer.Dispose()
    $form.Dispose()
  }
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
      interactiveDesktop = [Varix.Wimax.NativeGui]::InteractiveDesktopAvailable()
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
  'PromptUrgent' {
    if (-not [Varix.Wimax.NativeGui]::InteractiveDesktopAvailable()) {
      Write-Result ([pscustomobject]@{ ok = $true; decision = 'locked' })
      break
    }
    $decision = Show-UrgentPrompt $payload
    Write-Result ([pscustomobject]@{ ok = $true; decision = $decision })
  }
}
