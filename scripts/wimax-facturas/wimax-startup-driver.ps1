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
      mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
      mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
      return true;
    }

    public static bool Restore(long rawWindow) {
      return ShowWindowAsync(new IntPtr(rawWindow), 9);
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
      return GetWindowTextLength(new IntPtr(rawEdit));
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

function Select-Company([object]$State, [object]$Profile) {
  $controls = @([Varix.Wimax.StartupGui]::Controls([long]$State.dialogHandle))
  $lists = @($controls | Where-Object { $_.ClassName -ceq 'ListBox' -and $_.Enabled })
  $accept = @($controls | Where-Object {
    $_.ClassName -ceq 'Button' -and $_.Enabled -and
    $_.Text.Trim() -ceq [string]$Profile.dialogs.acceptButton
  })
  if ($lists.Count -ne 1 -or $accept.Count -ne 1) {
    throw 'La seleccion de empresa no tiene la estructura calibrada'
  }
  $items = @([Varix.Wimax.StartupGui]::ListItems($lists[0].Handle))
  $matches = @()
  for ($index = 0; $index -lt $items.Count; $index++) {
    if ($items[$index] -ceq [string]$Profile.company.exactName) { $matches += $index }
  }
  if ($matches.Count -ne 1) {
    throw 'La empresa WiMAX exacta no aparece una sola vez'
  }
  [Varix.Wimax.StartupGui]::SelectListItem($lists[0].Handle, $matches[0])
  if ([Varix.Wimax.StartupGui]::SelectedListIndex($lists[0].Handle) -ne $matches[0]) {
    throw 'WiMAX no confirmo la empresa seleccionada'
  }
  [Varix.Wimax.StartupGui]::ClickButton($State.dialogHandle, $accept[0].Handle)
}

function Submit-CompanyPassword([object]$State, [object]$Profile) {
  $secret = [string]$env:WIMAX_COMPANY_PASSWORD
  if ([string]::IsNullOrWhiteSpace($secret) -or $secret.Length -gt 256) {
    throw 'Falta la clave local de empresa WiMAX'
  }
  try {
    $controls = @([Varix.Wimax.StartupGui]::Controls([long]$State.dialogHandle))
    $edits = @($controls | Where-Object { $_.ClassName -ceq 'Edit' -and $_.Enabled })
    $accept = @($controls | Where-Object {
      $_.ClassName -ceq 'Button' -and $_.Enabled -and
      $_.Text.Trim() -ceq [string]$Profile.dialogs.acceptButton
    })
    if ($edits.Count -ne 1 -or $accept.Count -ne 1) {
      throw 'El acceso WiMAX no tiene la estructura calibrada'
    }
    [Varix.Wimax.StartupGui]::SetText($edits[0].Handle, $secret)
    if ([Varix.Wimax.StartupGui]::TextLength($edits[0].Handle) -ne $secret.Length) {
      throw 'WiMAX no recibio la clave completa'
    }
    [Varix.Wimax.StartupGui]::ClickButton($State.dialogHandle, $accept[0].Handle)
  }
  finally {
    $secret = $null
    $env:WIMAX_COMPANY_PASSWORD = $null
  }
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
  [Varix.Wimax.StartupGui]::ClickButton($State.dialogHandle, $decline[0].Handle)
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
$reorganizationsDeclined = 0
$unknownChecks = 0
$lastReorganization = $null
$lastActionAt = Get-Date

while ((Get-Date) -lt $deadline) {
  $state = Get-StartupState $profile
  switch ($state.state) {
    'ready' {
      Write-Result ([pscustomobject]@{
        ok = $true
        ready = $true
        launched = $launched
        companySelected = $companySelected
        passwordSubmitted = $passwordSubmitted
        reorganizationsDeclined = $reorganizationsDeclined
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
