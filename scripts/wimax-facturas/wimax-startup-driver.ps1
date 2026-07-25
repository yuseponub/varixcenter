param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Inspect', 'Ensure')]
  [string]$Action,

  [string]$PayloadPath,

  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

if (-not ('Varix.Wimax.StartupGui' -as [type])) {
  Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text;

namespace Varix.Wimax {
  public sealed class StartupWindow {
    public long Handle { get; set; }
    public string Title { get; set; }
    public string ClassName { get; set; }
    public int ProcessId { get; set; }
    public int SessionId { get; set; }
    public bool Minimized { get; set; }
    public int Left { get; set; }
    public int Top { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
  }

  public sealed class StartupControl {
    public long Handle { get; set; }
    public string Text { get; set; }
    public string ClassName { get; set; }
    public int ControlId { get; set; }
    public bool Enabled { get; set; }
    public int Left { get; set; }
  }

  public sealed class BlueSignature {
    public int Count { get; set; }
    public int MinX { get; set; }
    public int MaxX { get; set; }
    public int MinY { get; set; }
    public int MaxY { get; set; }
  }

  public static class StartupGui {
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
    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    private static extern bool IsWindowEnabled(IntPtr hWnd);
    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    private static extern IntPtr SetFocus(IntPtr hWnd);
    [DllImport("user32.dll")]
    private static extern IntPtr GetFocus();
    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")]
    private static extern bool ShowWindowAsync(IntPtr hWnd, int command);
    [DllImport("user32.dll")]
    private static extern bool AttachThreadInput(uint sourceThread, uint targetThread, bool attach);
    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")]
    private static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);
    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")]
    private static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
    [DllImport("user32.dll")]
    private static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint desiredAccess);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SwitchDesktop(IntPtr desktop);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll")]
    private static extern int GetDlgCtrlID(IntPtr hWnd);
    [DllImport("user32.dll")]
    private static extern IntPtr GetParent(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SendMessage(IntPtr hWnd, uint message, IntPtr wParam, string lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SendMessage(IntPtr hWnd, uint message, IntPtr wParam, StringBuilder lParam);
    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    private static extern int GetWindowTextLength(IntPtr hWnd);

    private static string Text(IntPtr hWnd) {
      var value = new StringBuilder(2048);
      GetWindowText(hWnd, value, value.Capacity);
      return value.ToString();
    }

    private static string Class(IntPtr hWnd) {
      var value = new StringBuilder(512);
      GetClassName(hWnd, value, value.Capacity);
      return value.ToString();
    }

    private static StartupWindow Describe(IntPtr hWnd) {
      uint processId;
      GetWindowThreadProcessId(hWnd, out processId);
      int sessionId = -1;
      try { sessionId = Process.GetProcessById((int)processId).SessionId; }
      catch { }
      RECT rect;
      GetWindowRect(hWnd, out rect);
      return new StartupWindow {
        Handle = hWnd.ToInt64(),
        Title = Text(hWnd),
        ClassName = Class(hWnd),
        ProcessId = (int)processId,
        SessionId = sessionId,
        Minimized = IsIconic(hWnd),
        Left = rect.Left,
        Top = rect.Top,
        Width = Math.Max(0, rect.Right - rect.Left),
        Height = Math.Max(0, rect.Bottom - rect.Top)
      };
    }

    public static StartupWindow[] WindowsForProcess(int processId) {
      var result = new List<StartupWindow>();
      EnumWindows(delegate(IntPtr hWnd, IntPtr ignored) {
        uint owner;
        GetWindowThreadProcessId(hWnd, out owner);
        if (owner == (uint)processId && IsWindowVisible(hWnd) &&
            !String.IsNullOrWhiteSpace(Text(hWnd))) {
          result.Add(Describe(hWnd));
        }
        return true;
      }, IntPtr.Zero);
      return result.ToArray();
    }

    public static StartupControl[] Controls(long rawParent) {
      var result = new List<StartupControl>();
      var parent = new IntPtr(rawParent);
      EnumChildWindows(parent, delegate(IntPtr hWnd, IntPtr ignored) {
        if (!IsWindowVisible(hWnd)) return true;
        RECT rect;
        GetWindowRect(hWnd, out rect);
        result.Add(new StartupControl {
          Handle = hWnd.ToInt64(),
          Text = Text(hWnd),
          ClassName = Class(hWnd),
          ControlId = GetDlgCtrlID(hWnd),
          Enabled = IsWindowEnabled(hWnd),
          Left = rect.Left
        });
        return true;
      }, IntPtr.Zero);
      return result.ToArray();
    }

    private static bool ForceForeground(IntPtr handle) {
      uint processId;
      var targetThread = GetWindowThreadProcessId(handle, out processId);
      var currentThread = GetCurrentThreadId();
      uint foregroundProcessId;
      var foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), out foregroundProcessId);
      var attachedTarget = currentThread != targetThread && AttachThreadInput(currentThread, targetThread, true);
      var attachedForeground = currentThread != foregroundThread && foregroundThread != targetThread &&
        AttachThreadInput(currentThread, foregroundThread, true);
      try {
        ShowWindowAsync(handle, 9);
        keybd_event(0x12, 0, 0, UIntPtr.Zero);
        BringWindowToTop(handle);
        var focused = SetForegroundWindow(handle);
        keybd_event(0x12, 0, 0x0002, UIntPtr.Zero);
        return focused;
      }
      finally {
        if (attachedForeground) AttachThreadInput(currentThread, foregroundThread, false);
        if (attachedTarget) AttachThreadInput(currentThread, targetThread, false);
      }
    }

    public static bool ClickAt(long rawWindow, int relativeX, int relativeY) {
      var handle = new IntPtr(rawWindow);
      RECT rect;
      if (!GetWindowRect(handle, out rect)) return false;
      if (!ForceForeground(handle)) return false;
      if (!SetCursorPos(rect.Left + relativeX, rect.Top + relativeY)) return false;
      // Xbase++ needs to observe the pointer move before the button event.
      System.Threading.Thread.Sleep(150);
      mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
      mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
      // The Xbase++ company hyperlink is wired to its double-click event.
      System.Threading.Thread.Sleep(100);
      mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
      mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
      return true;
    }

    public static bool ClickControl(long rawDialog, long rawControl) {
      var dialog = new IntPtr(rawDialog);
      var control = new IntPtr(rawControl);
      RECT rect;
      if (!GetWindowRect(control, out rect)) return false;
      if (!ForceForeground(dialog)) return false;
      if (!SetCursorPos(rect.Left + (rect.Right - rect.Left) / 2,
                        rect.Top + (rect.Bottom - rect.Top) / 2)) return false;
      System.Threading.Thread.Sleep(150);
      mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
      mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
      return true;
    }

    public static bool Restore(long rawWindow) {
      return ShowWindowAsync(new IntPtr(rawWindow), 9);
    }

    public static bool Focus(long rawWindow) {
      return ForceForeground(new IntPtr(rawWindow));
    }

    public static bool FocusControl(long rawDialog, long rawControl) {
      var dialog = new IntPtr(rawDialog);
      var control = new IntPtr(rawControl);
      if (!ForceForeground(dialog)) return false;
      uint processId;
      var targetThread = GetWindowThreadProcessId(control, out processId);
      var currentThread = GetCurrentThreadId();
      var attached = currentThread != targetThread &&
        AttachThreadInput(currentThread, targetThread, true);
      try {
        SetFocus(control);
        return GetFocus() == control;
      }
      finally {
        if (attached) AttachThreadInput(currentThread, targetThread, false);
      }
    }

    public static string[] ListItems(long rawList) {
      var list = new IntPtr(rawList);
      int count = SendMessage(list, 0x018B, IntPtr.Zero, IntPtr.Zero).ToInt32();
      var result = new List<string>();
      for (int index = 0; index < count; index++) {
        int length = SendMessage(list, 0x018A, new IntPtr(index), IntPtr.Zero).ToInt32();
        var value = new StringBuilder(Math.Max(2, length + 1));
        SendMessage(list, 0x0189, new IntPtr(index), value);
        result.Add(value.ToString());
      }
      return result.ToArray();
    }

    public static void SelectListItem(long rawList, int index) {
      var list = new IntPtr(rawList);
      SendMessage(list, 0x0186, new IntPtr(index), IntPtr.Zero);
      int controlId = GetDlgCtrlID(list);
      long command = ((long)1 << 16) | ((long)controlId & 0xffff);
      SendMessage(GetParent(list), 0x0111, new IntPtr(command), list);
    }

    public static int SelectedListIndex(long rawList) {
      return SendMessage(new IntPtr(rawList), 0x0188, IntPtr.Zero, IntPtr.Zero).ToInt32();
    }

    public static void ClickButton(long rawDialog, long rawButton) {
      ForceForeground(new IntPtr(rawDialog));
      SendMessage(new IntPtr(rawButton), 0x00F5, IntPtr.Zero, IntPtr.Zero);
    }

    public static void SetText(long rawEdit, string value) {
      SendMessage(new IntPtr(rawEdit), 0x000C, IntPtr.Zero, value);
    }

    public static int TextLength(long rawEdit) {
      // GetWindowTextLength cannot inspect an Edit owned by another process.
      // WM_GETTEXTLENGTH is the supported cross-process control message.
      return SendMessage(new IntPtr(rawEdit), 0x000E, IntPtr.Zero, IntPtr.Zero).ToInt32();
    }

    public static string TextValue(long rawEdit) {
      var edit = new IntPtr(rawEdit);
      int length = SendMessage(edit, 0x000E, IntPtr.Zero, IntPtr.Zero).ToInt32();
      var value = new StringBuilder(Math.Max(2, length + 1));
      SendMessage(edit, 0x000D, new IntPtr(value.Capacity), value);
      return value.ToString();
    }

    public static bool ClearEdit(long rawEdit) {
      var edit = new IntPtr(rawEdit);
      // EM_SETSEL + WM_CLEAR exercises the Edit control's change path, unlike
      // WM_SETTEXT, which Xbase++ does not mirror into its internal buffer.
      SendMessage(edit, 0x00B1, IntPtr.Zero, new IntPtr(-1));
      SendMessage(edit, 0x0303, IntPtr.Zero, IntPtr.Zero);
      return TextLength(rawEdit) == 0;
    }

    public static BlueSignature AnalyzeBlue(
      int left,
      int top,
      int width,
      int height,
      int minimumBlue,
      int maximumRed,
      double blueOverRed,
      double blueOverGreen
    ) {
      var result = new BlueSignature {
        Count = 0,
        MinX = Int32.MaxValue,
        MaxX = -1,
        MinY = Int32.MaxValue,
        MaxY = -1
      };
      using (var bitmap = new Bitmap(width, height)) {
        using (var graphics = Graphics.FromImage(bitmap)) {
          graphics.CopyFromScreen(left, top, 0, 0, bitmap.Size);
        }
        for (int y = 0; y < height; y++) {
          for (int x = 0; x < width; x++) {
            var color = bitmap.GetPixel(x, y);
            if (color.B >= minimumBlue && color.R <= maximumRed &&
                color.B > color.R * blueOverRed && color.B > color.G * blueOverGreen) {
              result.Count++;
              result.MinX = Math.Min(result.MinX, x);
              result.MaxX = Math.Max(result.MaxX, x);
              result.MinY = Math.Min(result.MinY, y);
              result.MaxY = Math.Max(result.MaxY, y);
            }
          }
        }
      }
      if (result.Count == 0) {
        result.MinX = result.MinY = result.MaxX = result.MaxY = -1;
      }
      return result;
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
      try { return SwitchDesktop(desktop); }
      finally { CloseDesktop(desktop); }
    }
  }
}
'@
}

function Read-Payload {
  $raw = if ($PayloadPath) {
    Get-Content -LiteralPath $PayloadPath -Raw
  }
  else {
    [Console]::In.ReadToEnd()
  }
  if ([string]::IsNullOrWhiteSpace($raw)) {
    throw 'Falta configuracion de arranque'
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

function Escape-SendKeys([string]$Value) {
  return [regex]::Replace(
    $Value,
    '[+^%~(){}\[\]]',
    [System.Text.RegularExpressions.MatchEvaluator]{
      param($match)
      return '{' + $match.Value + '}'
    }
  )
}

function Expected-Session([object]$Profile) {
  if ([string]$Profile.sessionId -ceq 'current') {
    return [System.Diagnostics.Process]::GetCurrentProcess().SessionId
  }
  return [int]$Profile.sessionId
}

function In-Range([int]$Value, [object]$Range) {
  return $Value -ge [int]$Range.min -and $Value -le [int]$Range.max
}

function Signature-Matches([object]$Signature, [object]$Expected) {
  return `
    (In-Range $Signature.Count $Expected.count) -and `
    (In-Range $Signature.MinX $Expected.minX) -and `
    (In-Range $Signature.MaxX $Expected.maxX) -and `
    (In-Range $Signature.MinY $Expected.minY) -and `
    (In-Range $Signature.MaxY $Expected.maxY)
}

function Main-Window([object[]]$Windows, [object]$Profile) {
  return @($Windows | Where-Object {
    [regex]::IsMatch($_.Title, [string]$Profile.window.titlePattern, 'IgnoreCase') -and
    [regex]::IsMatch($_.ClassName, [string]$Profile.window.classPattern, 'IgnoreCase')
  })
}

function Get-StartupState([object]$Profile) {
  $currentSession = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
  $expectedSession = Expected-Session $Profile
  $screen = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $base = [ordered]@{
    ok = $true
    state = 'blocked'
    reason = $null
    sessionId = $currentSession
    idleSeconds = [int][Varix.Wimax.StartupGui]::IdleSeconds()
    interactiveDesktop = [Varix.Wimax.StartupGui]::InteractiveDesktopAvailable()
    screen = [ordered]@{ width = $screen.Width; height = $screen.Height }
    processId = $null
    windowCount = 0
  }

  if (-not $base.interactiveDesktop) {
    $base.reason = 'sesion_bloqueada'
    return [pscustomobject]$base
  }
  if ($currentSession -ne $expectedSession) {
    $base.reason = 'sesion_interactiva_incorrecta'
    return [pscustomobject]$base
  }
  if ($screen.Width -ne [int]$Profile.display.width -or $screen.Height -ne [int]$Profile.display.height) {
    $base.reason = 'resolucion_no_calibrada'
    return [pscustomobject]$base
  }

  $processes = @(Get-Process -Name ([string]$Profile.window.process) -ErrorAction SilentlyContinue)
  if ($processes.Count -eq 0) {
    $launcher = @(Get-Process -Name 'WIMAX' -ErrorAction SilentlyContinue)
    $base.state = if ($launcher.Count -gt 0) { 'launching' } else { 'absent' }
    $base.reason = $null
    return [pscustomobject]$base
  }
  if ($processes.Count -ne 1) {
    $base.reason = 'multiples_procesos_wimax'
    return [pscustomobject]$base
  }

  $process = $processes[0]
  $base.processId = $process.Id
  if ($process.SessionId -ne $expectedSession) {
    $base.reason = 'wimax_en_otra_sesion'
    return [pscustomobject]$base
  }
  $windows = @([Varix.Wimax.StartupGui]::WindowsForProcess($process.Id))
  $base.windowCount = $windows.Count
  if ($windows.Count -eq 0) {
    $base.state = 'loading'
    $base.reason = $null
    return [pscustomobject]$base
  }

  $main = @(Main-Window $windows $Profile)
  if ($main.Count -ne 1) {
    $base.reason = 'ventana_principal_inesperada'
    return [pscustomobject]$base
  }
  if ($main[0].Minimized) {
    $base.state = 'minimized'
    $base.reason = $null
    $base.mainHandle = $main[0].Handle
    return [pscustomobject]$base
  }
  if (
    $main[0].Width -ne [int]$Profile.window.width -or
    $main[0].Height -ne [int]$Profile.window.height
  ) {
    $base.reason = 'ventana_principal_no_calibrada'
    return [pscustomobject]$base
  }

  $selector = @($windows | Where-Object { $_.Title -ceq [string]$Profile.dialogs.companySelectorTitle })
  $login = @($windows | Where-Object {
    [regex]::IsMatch($_.Title, [string]$Profile.dialogs.loginTitlePattern, 'IgnoreCase')
  })
  $prefix = @($windows | Where-Object {
    [regex]::IsMatch($_.Title, [string]$Profile.dialogs.prefixSelectorTitlePattern, 'IgnoreCase')
  })
  $dailyReport = @($windows | Where-Object {
    [regex]::IsMatch($_.Title, [string]$Profile.dialogs.dailyReportTitlePattern, 'IgnoreCase')
  })
  $audit = @($windows | Where-Object {
    [regex]::IsMatch($_.Title, [string]$Profile.dialogs.auditTitlePattern, 'IgnoreCase')
  })
  $reorganization = @($windows | Where-Object {
    $_.Title -ceq [string]$Profile.dialogs.reorganizationTitle
  })

  if ($windows.Count -eq 2 -and $selector.Count -eq 1) {
    $base.state = 'company_selector'
    $base.reason = $null
    $base.dialogHandle = $selector[0].Handle
    return [pscustomobject]$base
  }
  if ($windows.Count -eq 2 -and $login.Count -eq 1) {
    $base.state = 'company_password'
    $base.reason = $null
    $base.dialogHandle = $login[0].Handle
    return [pscustomobject]$base
  }
  if ($windows.Count -eq 2 -and $prefix.Count -eq 1) {
    $base.state = 'prefix_selector'
    $base.reason = $null
    $base.dialogHandle = $prefix[0].Handle
    return [pscustomobject]$base
  }
  if ($windows.Count -eq 2 -and $dailyReport.Count -eq 1) {
    $base.state = 'daily_report'
    $base.reason = $null
    $base.dialogHandle = $dailyReport[0].Handle
    $base.dialogWidth = $dailyReport[0].Width
    $base.dialogHeight = $dailyReport[0].Height
    return [pscustomobject]$base
  }
  if ($windows.Count -eq 2 -and $audit.Count -eq 1) {
    $base.state = 'audit'
    $base.reason = $null
    $base.dialogHandle = $audit[0].Handle
    $base.dialogWidth = $audit[0].Width
    $base.dialogHeight = $audit[0].Height
    return [pscustomobject]$base
  }
  if ($windows.Count -eq 2 -and $reorganization.Count -eq 1) {
    $base.state = 'reorganization'
    $base.reason = $null
    $base.dialogHandle = $reorganization[0].Handle
    $base.dialogWidth = $reorganization[0].Width
    $base.dialogHeight = $reorganization[0].Height
    return [pscustomobject]$base
  }
  if ($windows.Count -ne 1) {
    $base.reason = 'dialogo_wimax_inesperado'
    return [pscustomobject]$base
  }

  $region = $Profile.readyIndicator.region
  $blue = $Profile.readyIndicator.blue
  $signature = [Varix.Wimax.StartupGui]::AnalyzeBlue(
    $main[0].Left + [int]$region.x,
    $main[0].Top + [int]$region.y,
    [int]$region.width,
    [int]$region.height,
    [int]$blue.minimum,
    [int]$blue.maximumRed,
    [double]$blue.overRed,
    [double]$blue.overGreen
  )
  $base.signature = [ordered]@{
    count = $signature.Count
    minX = $signature.MinX
    maxX = $signature.MaxX
    minY = $signature.MinY
    maxY = $signature.MaxY
  }
  if (Signature-Matches $signature $Profile.readyIndicator.expected) {
    $base.state = 'ready'
  }
  else {
    $base.state = 'company_unselected'
  }
  $base.reason = $null
  $base.mainHandle = $main[0].Handle
  return [pscustomobject]$base
}

function Assert-Executable([object]$Profile) {
  $executable = [string]$Profile.executable.path
  $workingDirectory = [string]$Profile.executable.workingDirectory
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw 'No existe el ejecutable WiMAX calibrado'
  }
  if (-not (Test-Path -LiteralPath $workingDirectory -PathType Container)) {
    throw 'No existe el directorio WiMAX calibrado'
  }
  $item = Get-Item -LiteralPath $executable
  if ($item.Length -ne [long]$Profile.executable.length) {
    throw 'El ejecutable WiMAX cambio de tamano; requiere recalibracion'
  }
  $hash = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash
  if ($hash -ine [string]$Profile.executable.sha256) {
    throw 'El ejecutable WiMAX cambio de huella; requiere recalibracion'
  }
  $expected = Join-Path $workingDirectory 'WIMAX.EXE'
  if (-not [string]::Equals($item.FullName, $expected, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'La ruta del ejecutable WiMAX no coincide con el directorio calibrado'
  }
}

function Stop-StaleHeadlessWorker([object]$State, [object]$Profile) {
  $expectedPath = Join-Path ([string]$Profile.executable.workingDirectory) 'WX.EXE'
  $processes = @(Get-Process -Name ([string]$Profile.window.process) -ErrorAction SilentlyContinue)
  $launcher = @(Get-Process -Name 'WIMAX' -ErrorAction SilentlyContinue)
  if ($processes.Count -ne 1 -or $processes[0].Id -ne [int]$State.processId) {
    throw 'El proceso WiMAX sin ventana cambio durante la recuperacion'
  }
  if ($processes[0].SessionId -ne (Expected-Session $Profile)) {
    throw 'El proceso WiMAX sin ventana esta en otra sesion'
  }
  if ($launcher.Count -ne 0) {
    throw 'El lanzador WiMAX sigue activo; no se retirara el proceso'
  }
  $windows = @([Varix.Wimax.StartupGui]::WindowsForProcess($processes[0].Id))
  if ($windows.Count -ne 0 -or [long]$processes[0].MainWindowHandle -ne 0) {
    throw 'WiMAX recupero una ventana durante la validacion'
  }
  $worker = Get-CimInstance Win32_Process -Filter "ProcessId=$($processes[0].Id)"
  if (
    -not $worker -or
    $worker.Name -cne 'WX.EXE' -or
    -not [string]::Equals(
      [string]$worker.ExecutablePath,
      $expectedPath,
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw 'El proceso sin ventana no coincide con el WX.EXE calibrado'
  }
  Stop-Process -Id $processes[0].Id -Force
  Wait-Process -Id $processes[0].Id -Timeout 10 -ErrorAction SilentlyContinue
}

function Select-Company([object]$State, [object]$Profile) {
  # Xbase++ publishes the top-level dialog before all owner-drawn controls.
  Start-Sleep -Milliseconds 800
  $controls = @([Varix.Wimax.StartupGui]::Controls([long]$State.dialogHandle))
  $lists = @($controls | Where-Object { $_.ClassName -ceq 'ListBox' -and $_.Enabled })
  $buttons = @($controls | Where-Object { $_.ClassName -ceq 'Button' -and $_.Enabled })
  $accept = @($controls | Where-Object {
    $_.ClassName -ceq 'Button' -and $_.Enabled -and
    $_.Text.Trim() -ceq [string]$Profile.dialogs.acceptButton
  })
  $blankButtons = @($buttons | Where-Object { [string]::IsNullOrWhiteSpace($_.Text) })
  if ($accept.Count -eq 0 -and $blankButtons.Count -eq 2) {
    # These owner-drawn Xbase++ buttons expose no Win32 caption. In this exact
    # two-button dialog, Aceptar is the leftmost control and Cancelar the right.
    $accept = @($blankButtons | Sort-Object Left | Select-Object -First 1)
  }
  if ($lists.Count -ne 1 -or $accept.Count -ne 1) {
    throw 'La seleccion de empresa no tiene la estructura calibrada'
  }
  $items = @([Varix.Wimax.StartupGui]::ListItems($lists[0].Handle))
  $matches = @()
  for ($index = 0; $index -lt $items.Count; $index++) {
    if ($items[$index].Trim() -ceq ([string]$Profile.company.exactName).Trim()) {
      $matches += $index
    }
  }
  if ($matches.Count -ne 1) {
    throw 'La empresa WiMAX exacta no aparece una sola vez'
  }
  [Varix.Wimax.StartupGui]::SelectListItem($lists[0].Handle, $matches[0])
  if ([Varix.Wimax.StartupGui]::SelectedListIndex($lists[0].Handle) -ne $matches[0]) {
    throw 'WiMAX no confirmo la empresa seleccionada'
  }
  # Xbase++ queues the list selection callback. Clicking in the same input
  # cycle leaves the button visible but the dialog does not advance.
  Start-Sleep -Milliseconds 350
  if (-not [Varix.Wimax.StartupGui]::ClickControl(
    [long]$State.dialogHandle,
    [long]$accept[0].Handle
  )) {
    throw 'Windows no pudo pulsar Aceptar en la seleccion de empresa'
  }
}

function Submit-CompanyPassword([object]$State, [object]$Profile) {
  $secret = [string]$env:WIMAX_COMPANY_PASSWORD
  if ([string]::IsNullOrWhiteSpace($secret) -or $secret.Length -gt 256) {
    throw 'Falta la clave local de empresa WiMAX'
  }
  try {
    # The dialog and its native controls appear well before Xbase++ finishes
    # wiring the password/Accept callbacks during a cold launch.
    Start-Sleep -Milliseconds 2500
    $controls = @([Varix.Wimax.StartupGui]::Controls([long]$State.dialogHandle))
    $edits = @($controls | Where-Object { $_.ClassName -ceq 'Edit' -and $_.Enabled })
    $buttons = @($controls | Where-Object { $_.ClassName -ceq 'Button' -and $_.Enabled })
    $accept = @($controls | Where-Object {
      $_.ClassName -ceq 'Button' -and $_.Enabled -and
      $_.Text.Trim() -ceq [string]$Profile.dialogs.acceptButton
    })
    $blankButtons = @($buttons | Where-Object { [string]::IsNullOrWhiteSpace($_.Text) })
    if ($accept.Count -eq 0 -and $blankButtons.Count -eq 2) {
      $accept = @($blankButtons | Sort-Object Left | Select-Object -First 1)
    }
    if ($edits.Count -ne 1 -or $accept.Count -ne 1) {
      throw 'El acceso WiMAX no tiene la estructura calibrada'
    }
    if (-not [Varix.Wimax.StartupGui]::ClickControl(
      [long]$State.dialogHandle,
      [long]$edits[0].Handle
    )) {
      throw 'Windows no concedio el foco al acceso WiMAX'
    }
    if (-not [Varix.Wimax.StartupGui]::FocusControl(
      [long]$State.dialogHandle,
      [long]$edits[0].Handle
    )) {
      throw 'Windows no concedio el foco de teclado al acceso WiMAX'
    }
    Start-Sleep -Milliseconds 150
    [void][Varix.Wimax.StartupGui]::ClearEdit([long]$edits[0].Handle)
    [System.Windows.Forms.SendKeys]::SendWait('{END}')
    for ($index = 0; $index -lt 32; $index++) {
      [System.Windows.Forms.SendKeys]::SendWait('{BACKSPACE}')
    }
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait((Escape-SendKeys $secret))
    Start-Sleep -Milliseconds 300
    # This Xbase++ password control exposes a fixed mask length, not the real
    # input length. Commit with a physical click: BM_CLICK repaints this
    # owner-drawn button but does not consistently run its Xbase++ callback.
    if (-not [Varix.Wimax.StartupGui]::ClickControl(
      [long]$State.dialogHandle,
      [long]$accept[0].Handle
    )) {
      throw 'Windows no pudo pulsar Aceptar en el acceso WiMAX'
    }
    Start-Sleep -Milliseconds 1500
    $afterSubmit = Get-StartupState $Profile
    if (
      $afterSubmit.state -ceq 'company_password' -and
      [long]$afterSubmit.dialogHandle -eq [long]$State.dialogHandle
    ) {
      # On the first cold-start paint, WiMAX can consume the mouse event before
      # the Xbase++ callback is attached. A second physical click is safe only
      # while the exact same access dialog remains active.
      if (-not [Varix.Wimax.StartupGui]::ClickControl(
        [long]$State.dialogHandle,
        [long]$accept[0].Handle
      )) {
        throw 'Windows no pudo reintentar Aceptar en el acceso WiMAX'
      }
    }
  }
  finally {
    $secret = $null
    $env:WIMAX_COMPANY_PASSWORD = $null
  }
}

function Select-Prefix([object]$State, [object]$Profile) {
  Start-Sleep -Milliseconds 800
  $controls = @([Varix.Wimax.StartupGui]::Controls([long]$State.dialogHandle))
  $lists = @($controls | Where-Object { $_.ClassName -ceq 'ListBox' -and $_.Enabled })
  $cellGroups = @($controls | Where-Object { $_.ClassName -ceq 'XbpCellGroup' -and $_.Enabled })
  $prompts = @($controls | Where-Object {
    $_.ClassName -ceq 'XbpStatic' -and
    [regex]::IsMatch($_.Text, [string]$Profile.prefix.promptTextPattern, 'IgnoreCase')
  })
  $buttons = @($controls | Where-Object { $_.ClassName -ceq 'Button' -and $_.Enabled })
  $accept = @($buttons | Where-Object {
    $_.Text.Trim() -ceq [string]$Profile.dialogs.acceptButton
  })
  $blankButtons = @($buttons | Where-Object { [string]::IsNullOrWhiteSpace($_.Text) })
  if ($accept.Count -eq 0 -and $blankButtons.Count -eq 2) {
    $accept = @($blankButtons | Sort-Object Left | Select-Object -First 1)
  }
  if ($accept.Count -ne 1) {
    throw 'La seleccion de prefijo no tiene la estructura calibrada'
  }

  if ($lists.Count -eq 1 -and $cellGroups.Count -eq 0) {
    $items = @([Varix.Wimax.StartupGui]::ListItems($lists[0].Handle))
    $matches = @()
    for ($index = 0; $index -lt $items.Count; $index++) {
      if ($items[$index].Trim() -ceq ([string]$Profile.prefix.exactName).Trim()) {
        $matches += $index
      }
    }
    if ($matches.Count -ne 1) {
      throw 'El prefijo FE exacto no aparece una sola vez'
    }
    [Varix.Wimax.StartupGui]::SelectListItem($lists[0].Handle, $matches[0])
    if ([Varix.Wimax.StartupGui]::SelectedListIndex($lists[0].Handle) -ne $matches[0]) {
      throw 'WiMAX no confirmo el prefijo FE seleccionado'
    }
    Start-Sleep -Milliseconds 350
    if (-not [Varix.Wimax.StartupGui]::ClickControl(
      [long]$State.dialogHandle,
      [long]$accept[0].Handle
    )) {
      throw 'Windows no pudo pulsar Aceptar en la seleccion de prefijo'
    }
    return
  }

  if ($lists.Count -ne 0 -or $cellGroups.Count -ne 2 -or $prompts.Count -ne 1) {
    throw 'La grilla de prefijo no coincide con la calibracion'
  }
  if (-not [Varix.Wimax.StartupGui]::Focus([long]$State.dialogHandle)) {
    throw 'Windows no concedio el foco para seleccionar el prefijo FE'
  }
  Start-Sleep -Milliseconds 200
  [System.Windows.Forms.SendKeys]::SendWait([string]$Profile.prefix.keyboardCode)
  Start-Sleep -Milliseconds 250
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
}

function Decline-Reorganization([object]$State, [object]$Profile) {
  if (
    [int]$State.dialogWidth -lt 300 -or [int]$State.dialogWidth -gt 380 -or
    [int]$State.dialogHeight -lt 135 -or [int]$State.dialogHeight -gt 165
  ) {
    throw 'El aviso Grupo Wimax no tiene el tamano de reorganizacion calibrado'
  }
  $controls = @([Varix.Wimax.StartupGui]::Controls([long]$State.dialogHandle))
  $buttons = @($controls | Where-Object { $_.ClassName -ceq 'Button' -and $_.Enabled })
  $decline = @($buttons | Where-Object {
    $_.Text.Trim() -ceq [string]$Profile.dialogs.declineButton
  })
  $recommended = @($buttons | Where-Object {
    $_.Text.Trim() -ceq [string]$Profile.dialogs.recommendedButton
  })
  if ($buttons.Count -ne 2 -or $decline.Count -ne 1 -or $recommended.Count -ne 1) {
    throw 'El aviso Grupo Wimax no coincide con una reorganizacion conocida'
  }
  if (-not [Varix.Wimax.StartupGui]::ClickControl(
    [long]$State.dialogHandle,
    [long]$decline[0].Handle
  )) {
    throw 'Windows no pudo pulsar No en la reorganizacion'
  }
}

function Dismiss-DailyReport([object]$State, [object]$Profile) {
  # Igual que Auditoria General, este XbpDialog aparece antes de terminar de
  # enlazar el boton Aceptar durante un arranque en frio.
  Start-Sleep -Milliseconds 2500
  if (
    [int]$State.dialogWidth -lt 400 -or [int]$State.dialogWidth -gt 440 -or
    [int]$State.dialogHeight -lt 440 -or [int]$State.dialogHeight -gt 480
  ) {
    throw 'El reporte diario no tiene el tamano calibrado'
  }
  $controls = @([Varix.Wimax.StartupGui]::Controls([long]$State.dialogHandle))
  $buttons = @($controls | Where-Object { $_.ClassName -ceq 'Button' -and $_.Enabled })
  if ($buttons.Count -ne 1 -or -not [string]::IsNullOrWhiteSpace($buttons[0].Text)) {
    throw 'El reporte diario no tiene la estructura calibrada'
  }
  if (-not [Varix.Wimax.StartupGui]::ClickControl(
    [long]$State.dialogHandle,
    [long]$buttons[0].Handle
  )) {
    throw 'Windows no pudo cerrar el reporte diario'
  }
  Start-Sleep -Milliseconds 1500
  $afterDismiss = Get-StartupState $Profile
  if (
    $afterDismiss.state -ceq 'daily_report' -and
    [long]$afterDismiss.dialogHandle -eq [long]$State.dialogHandle
  ) {
    if (-not [Varix.Wimax.StartupGui]::ClickControl(
      [long]$State.dialogHandle,
      [long]$buttons[0].Handle
    )) {
      throw 'Windows no pudo reintentar el cierre del reporte diario'
    }
  }
}

function Dismiss-Audit([object]$State, [object]$Profile) {
  # Xbase++ pinta los controles antes de terminar de enlazar sus callbacks.
  # En un arranque en frio el boton puede verse y aun ignorar el primer click.
  Start-Sleep -Milliseconds 2500
  if (
    [int]$State.dialogWidth -lt 780 -or [int]$State.dialogWidth -gt 820 -or
    [int]$State.dialogHeight -lt 520 -or [int]$State.dialogHeight -gt 560
  ) {
    throw 'Auditoria General no tiene el tamano calibrado'
  }
  $controls = @([Varix.Wimax.StartupGui]::Controls([long]$State.dialogHandle))
  $buttons = @($controls | Where-Object { $_.ClassName -ceq 'Button' -and $_.Enabled })
  $blankButtons = @($buttons | Where-Object { [string]::IsNullOrWhiteSpace($_.Text) })
  $checkboxes = @($buttons | Where-Object { $_.Text.Trim() -ceq 'No volver a mostrar este mensaje' })
  if ($blankButtons.Count -ne 2 -or $checkboxes.Count -ne 1) {
    throw 'Auditoria General no tiene la estructura calibrada'
  }
  $accept = @($blankButtons | Sort-Object Left -Descending | Select-Object -First 1)
  if (-not [Varix.Wimax.StartupGui]::ClickControl(
    [long]$State.dialogHandle,
    [long]$accept[0].Handle
  )) {
    throw 'Windows no pudo cerrar Auditoria General'
  }
  Start-Sleep -Milliseconds 1500
  $afterDismiss = Get-StartupState $Profile
  if (
    $afterDismiss.state -ceq 'audit' -and
    [long]$afterDismiss.dialogHandle -eq [long]$State.dialogHandle
  ) {
    if (-not [Varix.Wimax.StartupGui]::ClickControl(
      [long]$State.dialogHandle,
      [long]$accept[0].Handle
    )) {
      throw 'Windows no pudo reintentar el cierre de Auditoria General'
    }
  }
}

$payload = Read-Payload
$profile = $payload.profile
if (-not $profile) { throw 'Falta el perfil de arranque WiMAX' }

if ($Action -ceq 'Inspect') {
  Write-Result (Get-StartupState $profile)
  exit 0
}

$minimumIdleSeconds = [Math]::Max(0, [int]$payload.minimumIdleSeconds)
$timeoutSeconds = [Math]::Min([Math]::Max([int]$payload.timeoutSeconds, 30), 300)
$initial = Get-StartupState $profile
if (-not $initial.interactiveDesktop) { throw 'La sesion interactiva esta bloqueada' }
if ($initial.reason -eq 'sesion_interactiva_incorrecta') { throw 'La tarea no corre en la sesion calibrada' }
if ($initial.reason -eq 'resolucion_no_calibrada') { throw 'La resolucion no coincide con el perfil' }
if ([int]$initial.idleSeconds -lt $minimumIdleSeconds) {
  throw 'El escritorio esta en uso'
}
Assert-Executable $profile

$deadline = (Get-Date).AddSeconds($timeoutSeconds)
$launched = $false
$companyRequests = 0
$companySelected = $false
$passwordSubmitted = $false
$prefixSelected = $false
$reorganizationsDeclined = 0
$dailyReportsDismissed = 0
$auditsDismissed = 0
$staleWorkersStopped = 0
$headlessProcessId = $null
$headlessSince = $null
$unknownChecks = 0
$lastReorganization = $null
$lastActionAt = Get-Date
$readySince = $null

while ((Get-Date) -lt $deadline) {
  $state = Get-StartupState $profile
  if ($state.state -cne 'ready') { $readySince = $null }
  switch ($state.state) {
    'ready' {
      if (-not $readySince) {
        $readySince = Get-Date
        break
      }
      if (((Get-Date) - $readySince).TotalSeconds -lt 3) { break }
      Write-Result ([pscustomobject]@{
        ok = $true
        ready = $true
        launched = $launched
        companySelected = $companySelected
        passwordSubmitted = $passwordSubmitted
        prefixSelected = $prefixSelected
        reorganizationsDeclined = $reorganizationsDeclined
        dailyReportsDismissed = $dailyReportsDismissed
        auditsDismissed = $auditsDismissed
        staleWorkersStopped = $staleWorkersStopped
        processId = $state.processId
        sessionId = $state.sessionId
      })
      exit 0
    }
    'absent' {
      if ($launched) { throw 'WiMAX termino durante el arranque' }
      $process = Start-Process `
        -FilePath ([string]$profile.executable.path) `
        -WorkingDirectory ([string]$profile.executable.workingDirectory) `
        -PassThru
      $launched = $true
      $lastActionAt = Get-Date
      $unknownChecks = 0
    }
    'launching' {
      $unknownChecks = 0
    }
    'loading' {
      if ($headlessProcessId -ne $state.processId) {
        $headlessProcessId = $state.processId
        $headlessSince = Get-Date
      }
      elseif (((Get-Date) - $headlessSince).TotalSeconds -ge 15) {
        if ($staleWorkersStopped -ge 1) {
          throw 'WiMAX volvio a quedar sin ventana despues de recuperarlo'
        }
        Stop-StaleHeadlessWorker $state $profile
        $staleWorkersStopped++
        $headlessProcessId = $null
        $headlessSince = $null
      }
      $unknownChecks = 0
    }
    'minimized' {
      if (-not [Varix.Wimax.StartupGui]::Restore([long]$state.mainHandle)) {
        throw 'Windows no pudo restaurar WiMAX'
      }
      $lastActionAt = Get-Date
      $unknownChecks = 0
    }
    'company_unselected' {
      if ($passwordSubmitted -or $companySelected) {
        # Main is transiently blank while WiMAX opens files. Never click here
        # after credentials were submitted.
      }
      elseif ($companyRequests -eq 0 -or ((Get-Date) - $lastActionAt).TotalSeconds -ge 4) {
        if ($companyRequests -ge 2) {
          throw 'WiMAX no abrio la seleccion de empresa'
        }
        if (-not [Varix.Wimax.StartupGui]::ClickAt(
          [long]$state.mainHandle,
          [int]$profile.companyLink.x,
          [int]$profile.companyLink.y
        )) {
          throw 'Windows no concedio el foco para seleccionar la empresa'
        }
        $companyRequests++
        $lastActionAt = Get-Date
      }
      $unknownChecks = 0
    }
    'company_selector' {
      if ($companySelected -and ((Get-Date) - $lastActionAt).TotalSeconds -ge 5) {
        throw 'La seleccion de empresa WiMAX no avanzo'
      }
      if (-not $companySelected) {
        Select-Company $state $profile
        $companySelected = $true
        $lastActionAt = Get-Date
      }
      $unknownChecks = 0
    }
    'company_password' {
      if ($passwordSubmitted -and ((Get-Date) - $lastActionAt).TotalSeconds -ge 5) {
        throw 'WiMAX rechazo la clave o no cerro el acceso'
      }
      if (-not $passwordSubmitted) {
        Submit-CompanyPassword $state $profile
        $passwordSubmitted = $true
        $lastActionAt = Get-Date
      }
      $unknownChecks = 0
    }
    'prefix_selector' {
      if ($prefixSelected -and ((Get-Date) - $lastActionAt).TotalSeconds -ge 5) {
        throw 'La seleccion de prefijo FE no avanzo'
      }
      if (-not $prefixSelected) {
        Select-Prefix $state $profile
        $prefixSelected = $true
        $lastActionAt = Get-Date
      }
      $unknownChecks = 0
    }
    'daily_report' {
      if ($dailyReportsDismissed -ge 1) {
        if (((Get-Date) - $lastActionAt).TotalSeconds -ge 5) {
          throw 'El reporte diario reaparecio despues de cerrarlo'
        }
      }
      else {
        Dismiss-DailyReport $state $profile
        $dailyReportsDismissed++
        $lastActionAt = Get-Date
      }
      $unknownChecks = 0
    }
    'audit' {
      if ($auditsDismissed -ge 1) {
        if (((Get-Date) - $lastActionAt).TotalSeconds -ge 5) {
          throw 'Auditoria General reaparecio despues de cerrarla'
        }
      }
      else {
        Dismiss-Audit $state $profile
        $auditsDismissed++
        $lastActionAt = Get-Date
      }
      $unknownChecks = 0
    }
    'reorganization' {
      $key = "$($state.dialogHandle):$($state.dialogWidth):$($state.dialogHeight)"
      if ($key -ceq $lastReorganization) {
        if (((Get-Date) - $lastActionAt).TotalSeconds -ge 5) {
          throw 'El aviso de reorganizacion no cerro al pulsar No'
        }
      }
      else {
        if ($reorganizationsDeclined -ge [int]$profile.maxReorganizationPrompts) {
          throw 'Aparecieron mas avisos de reorganizacion que los calibrados'
        }
        Decline-Reorganization $state $profile
        $reorganizationsDeclined++
        $lastReorganization = $key
        $lastActionAt = Get-Date
      }
      $unknownChecks = 0
    }
    default {
      $unknownChecks++
      if ($unknownChecks -ge 5) {
        $reason = if ($state.reason) { [string]$state.reason } else { 'estado_desconocido' }
        throw "WiMAX mostro un estado no autorizado: $reason"
      }
    }
  }
  Start-Sleep -Milliseconds 300
}

throw 'WiMAX no llego a la pantalla principal antes del limite'
