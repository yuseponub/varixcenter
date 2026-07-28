param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Inspect', 'InspectControls', 'Foreground', 'Focus', 'Minimize', 'SendKeys', 'MoveEdit', 'AssertEditValue', 'SelectComboExact', 'SetInlineFields', 'Click', 'PressButton', 'InvokeButton', 'TabButton', 'TabUntilChange', 'RightClick', 'Screenshot', 'PromptUrgent')]
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

# Node writes the JSON payload to stdin as UTF-8. Windows PowerShell 5.1
# otherwise decodes redirected stdin with the OEM code page, turning Ñ/ñ into
# two unrelated characters before SendKeys sees the text.
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Accessibility
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

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
    public string ChildText { get; set; }
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

  public sealed class ControlInfo {
    public long Handle { get; set; }
    public long ParentHandle { get; set; }
    public string Text { get; set; }
    public string ClassName { get; set; }
    public int ControlId { get; set; }
    public bool Enabled { get; set; }
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
    private static extern bool ShowWindowAsync(IntPtr hWnd, int command);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr SetFocus(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr SetActiveWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr GetFocus();

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

    [DllImport("user32.dll")]
    private static extern int GetDlgCtrlID(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr GetParent(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool PostMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SendMessage(IntPtr hWnd, uint message, IntPtr wParam, StringBuilder lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SendMessage(IntPtr hWnd, uint message, IntPtr wParam, string lParam);

    [DllImport("oleacc.dll")]
    private static extern int AccessibleObjectFromWindow(
      IntPtr hWnd,
      uint objectId,
      ref Guid interfaceId,
      [MarshalAs(UnmanagedType.Interface)] out object accessible
    );

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

    private static string ChildText(IntPtr parent) {
      var result = new List<string>();
      EnumChildWindows(parent, delegate(IntPtr hWnd, IntPtr ignored) {
        if (!IsWindowVisible(hWnd)) return true;
        var value = Text(hWnd).Trim();
        if (!String.IsNullOrWhiteSpace(value)) result.Add(value);
        return true;
      }, IntPtr.Zero);
      return String.Join("\n", result.ToArray());
    }

    private static WindowInfo Describe(IntPtr hWnd) {
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
        Title = Text(hWnd),
        ClassName = Class(hWnd),
        ChildText = ChildText(hWnd),
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
            !String.IsNullOrWhiteSpace(info.ProcessName))) {
          result.Add(info);
        }
        return true;
      }, IntPtr.Zero);
      return result.ToArray();
    }

    public static ControlInfo[] Controls(long rawParent) {
      var result = new List<ControlInfo>();
      var parent = new IntPtr(rawParent);
      EnumChildWindows(parent, delegate(IntPtr hWnd, IntPtr ignored) {
        if (!IsWindowVisible(hWnd)) return true;
        RECT rect;
        GetWindowRect(hWnd, out rect);
        result.Add(new ControlInfo {
          Handle = hWnd.ToInt64(),
          ParentHandle = GetParent(hWnd).ToInt64(),
          Text = Text(hWnd),
          ClassName = Class(hWnd),
          ControlId = GetDlgCtrlID(hWnd),
          Enabled = IsWindowEnabled(hWnd),
          Left = rect.Left,
          Top = rect.Top,
          Width = Math.Max(0, rect.Right - rect.Left),
          Height = Math.Max(0, rect.Bottom - rect.Top)
        });
        return true;
      }, IntPtr.Zero);
      return result.ToArray();
    }

    public static bool PostButtonClick(long rawHandle) {
      const uint BM_CLICK = 0x00F5;
      return PostMessage(new IntPtr(rawHandle), BM_CLICK, IntPtr.Zero, IntPtr.Zero);
    }

    public static bool PostButtonCommand(long rawParent, long rawButton, int controlId) {
      const uint WM_COMMAND = 0x0111;
      // BN_CLICKED is zero, so LOWORD(wParam) only carries the control id.
      var wParam = new IntPtr(controlId & 0xFFFF);
      return PostMessage(
        new IntPtr(rawParent),
        WM_COMMAND,
        wParam,
        new IntPtr(rawButton)
      );
    }

    public static bool FocusButtonAndPressSpace(long rawDialog, long rawButton) {
      var dialog = new IntPtr(rawDialog);
      var button = new IntPtr(rawButton);
      uint processId;
      var targetThread = GetWindowThreadProcessId(button, out processId);
      var currentThread = GetCurrentThreadId();
      var attached = currentThread != targetThread &&
        AttachThreadInput(currentThread, targetThread, true);
      try {
        ShowWindowAsync(dialog, 9); // SW_RESTORE
        BringWindowToTop(dialog);
        SetForegroundWindow(dialog);
        SetActiveWindow(dialog);
        SetFocus(button);
        if (GetFocus() != button) return false;
        keybd_event(0x20, 0x39, 0, UIntPtr.Zero); // VK_SPACE down
        System.Threading.Thread.Sleep(120);
        keybd_event(0x20, 0x39, 0x0002, UIntPtr.Zero); // KEYEVENTF_KEYUP
        return true;
      }
      finally {
        if (attached) AttachThreadInput(currentThread, targetThread, false);
      }
    }

    public static bool FocusButton(long rawDialog, long rawButton) {
      var dialog = new IntPtr(rawDialog);
      var button = new IntPtr(rawButton);
      uint processId;
      var targetThread = GetWindowThreadProcessId(button, out processId);
      var currentThread = GetCurrentThreadId();
      var attached = currentThread != targetThread &&
        AttachThreadInput(currentThread, targetThread, true);
      try {
        ShowWindowAsync(dialog, 9); // SW_RESTORE
        BringWindowToTop(dialog);
        SetForegroundWindow(dialog);
        SetActiveWindow(dialog);
        SetFocus(button);
        return GetFocus() == button;
      }
      finally {
        if (attached) AttachThreadInput(currentThread, targetThread, false);
      }
    }

    public static long FocusedHandle(long rawWindow) {
      var window = new IntPtr(rawWindow);
      uint processId;
      var targetThread = GetWindowThreadProcessId(window, out processId);
      var currentThread = GetCurrentThreadId();
      var attached = false;
      if (currentThread != targetThread) {
        attached = AttachThreadInput(currentThread, targetThread, true);
        if (!attached) return 0;
      }
      try {
        return GetFocus().ToInt64();
      }
      finally {
        if (attached) AttachThreadInput(currentThread, targetThread, false);
      }
    }

    public static object AccessibleObject(long rawHandle) {
      const uint OBJID_CLIENT = 0xFFFFFFFC;
      var iid = new Guid("618736E0-3C3D-11CF-810C-00AA00389B71");
      object accessible;
      var result = AccessibleObjectFromWindow(
        new IntPtr(rawHandle),
        OBJID_CLIENT,
        ref iid,
        out accessible
      );
      if (result < 0) Marshal.ThrowExceptionForHR(result);
      return accessible;
    }

    public static WindowInfo Foreground() {
      var handle = GetForegroundWindow();
      return handle == IntPtr.Zero ? null : Describe(handle);
    }

    public static bool ForceForeground(long rawHandle) {
      var handle = new IntPtr(rawHandle);
      // Re-synthesizing ALT while the target is already foreground can leak
      // into Xbase++'s next keystroke and open a native/system menu. Preserve
      // the existing child focus when no foreground handoff is necessary.
      if (GetForegroundWindow() == handle) {
        ShowWindowAsync(handle, 9); // SW_RESTORE
        return true;
      }
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

    public static bool FocusControl(long rawDialog, long rawControl) {
      var dialog = new IntPtr(rawDialog);
      var control = new IntPtr(rawControl);
      if (!ForceForeground(rawDialog)) return false;
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

    public static string TextValue(long rawEdit) {
      var edit = new IntPtr(rawEdit);
      int length = SendMessage(edit, 0x000E, IntPtr.Zero, IntPtr.Zero).ToInt32();
      var value = new StringBuilder(Math.Max(2, length + 1));
      SendMessage(edit, 0x000D, new IntPtr(value.Capacity), value);
      return value.ToString();
    }

    public static bool ClearEdit(long rawEdit) {
      var edit = new IntPtr(rawEdit);
      // Xbase++ mirrors keyboard-style selection/clear into its internal
      // buffer; WM_SETTEXT alone only changes the native window caption.
      SendMessage(edit, 0x00B1, IntPtr.Zero, new IntPtr(-1)); // EM_SETSEL
      SendMessage(edit, 0x0303, IntPtr.Zero, IntPtr.Zero); // WM_CLEAR
      return TextValue(rawEdit).Length == 0;
    }

    public static string SelectComboExact(long rawCombo, string expected) {
      const uint CB_FINDSTRINGEXACT = 0x0158;
      const uint CB_SETCURSEL = 0x014E;
      const uint CB_GETCURSEL = 0x0147;
      const uint CB_GETLBTEXTLEN = 0x0149;
      const uint CB_GETLBTEXT = 0x0148;
      const uint WM_COMMAND = 0x0111;
      const int CBN_SELCHANGE = 1;
      var combo = new IntPtr(rawCombo);
      var index = SendMessage(combo, CB_FINDSTRINGEXACT, new IntPtr(-1), expected).ToInt32();
      if (index < 0) return null;
      if (SendMessage(combo, CB_SETCURSEL, new IntPtr(index), IntPtr.Zero).ToInt32() < 0) {
        return null;
      }
      var parent = GetParent(combo);
      var id = GetDlgCtrlID(combo);
      var command = new IntPtr((CBN_SELCHANGE << 16) | (id & 0xffff));
      SendMessage(parent, WM_COMMAND, command, combo);
      var selected = SendMessage(combo, CB_GETCURSEL, IntPtr.Zero, IntPtr.Zero).ToInt32();
      if (selected < 0) return null;
      var length = SendMessage(combo, CB_GETLBTEXTLEN, new IntPtr(selected), IntPtr.Zero).ToInt32();
      if (length < 0 || length > 500) return null;
      var value = new StringBuilder(length + 1);
      SendMessage(combo, CB_GETLBTEXT, new IntPtr(selected), value);
      return value.ToString();
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

function Test-InlineNumericValue([string]$Expected, [string]$Actual) {
  if ($Actual.Trim() -ceq $Expected.Trim()) { return $true }
  $styles = [System.Globalization.NumberStyles]::Number
  $normalizedActual = [regex]::Replace($Actual.Trim(), '\s+', '')
  if ($normalizedActual -match '[,.]$') {
    $normalizedActual += '0'
  }
  [decimal]$expectedNumber = 0
  if (-not [decimal]::TryParse(
    $Expected,
    $styles,
    [System.Globalization.CultureInfo]::InvariantCulture,
    [ref]$expectedNumber
  )) {
    return $false
  }
  foreach ($cultureName in @('es-CO', 'en-US')) {
    [decimal]$actualNumber = 0
    $culture = [System.Globalization.CultureInfo]::GetCultureInfo($cultureName)
    if (
      [decimal]::TryParse($normalizedActual, $styles, $culture, [ref]$actualNumber) -and
      $actualNumber -eq $expectedNumber
    ) {
      return $true
    }
  }
  return $false
}

function Test-ExpectedInlineStockWarning([object]$Window) {
  return (
    $Window -and
    $Window.ProcessName -ieq 'WX' -and
    $Window.ClassName -ceq '#32770' -and
    $Window.Title -match '^\s*Facturaci.n\b' -and
    $Window.ChildText -match 'PRECAUCION!' -and
    $Window.ChildText -match 'Cantidad mayor que la existencia actual'
  )
}

function Find-Window([object]$Payload) {
  if ($Payload.foreground) {
    $foreground = [Varix.Wimax.NativeGui]::Foreground()
    if (-not $foreground) { throw 'No hay ventana en primer plano' }
    $handleMatches = -not $Payload.handle -or $foreground.Handle -eq [long]$Payload.handle
    $processMatches = -not $Payload.process -or $foreground.ProcessName -ieq [string]$Payload.process
    $titleMatches = -not $Payload.titlePattern -or $foreground.Title -match [string]$Payload.titlePattern
    $classMatches = -not $Payload.classPattern -or $foreground.ClassName -match [string]$Payload.classPattern
    $textMatches = -not $Payload.textPattern -or $foreground.ChildText -match [string]$Payload.textPattern
    if (-not ($handleMatches -and $processMatches -and $titleMatches -and $classMatches -and $textMatches)) {
      throw 'La ventana en primer plano no coincide con el perfil'
    }
    return $foreground
  }
  $windows = [Varix.Wimax.NativeGui]::Windows()
  $matches = @($windows | Where-Object {
    $handleMatches = -not $Payload.handle -or $_.Handle -eq [long]$Payload.handle
    $processMatches = -not $Payload.process -or $_.ProcessName -ieq [string]$Payload.process
    $titleMatches = -not $Payload.titlePattern -or $_.Title -match [string]$Payload.titlePattern
    $classMatches = -not $Payload.classPattern -or $_.ClassName -match [string]$Payload.classPattern
    $textMatches = -not $Payload.textPattern -or $_.ChildText -match [string]$Payload.textPattern
    $handleMatches -and $processMatches -and $titleMatches -and $classMatches -and $textMatches
  })
  if ($matches.Count -ne 1) {
    throw "Se esperaba una ventana y se encontraron $($matches.Count)"
  }
  return $matches[0]
}

function Wait-MatchingEdit([object]$Window, [object]$Spec, [int]$TimeoutMs) {
  if ($null -eq $Spec -or $null -eq $Spec.relativeLeft -or $null -eq $Spec.relativeTop) {
    throw 'MoveEdit requiere relativeLeft y relativeTop'
  }
  $tolerance = if ($null -ne $Spec.tolerance) { [int]$Spec.tolerance } else { 5 }
  if ($tolerance -lt 0 -or $tolerance -gt 20) { throw 'Tolerancia MoveEdit invalida' }
  $classPattern = if ($Spec.classPattern) { [string]$Spec.classPattern } else { '^Edit$' }
  $deadline = [DateTime]::UtcNow.AddMilliseconds([Math]::Min([Math]::Max($TimeoutMs, 250), 10000))
  do {
    $matches = @(
      [Varix.Wimax.NativeGui]::Controls($Window.Handle) |
        Where-Object {
          $_.Enabled -and
          $_.ClassName -match $classPattern -and
          [Math]::Abs(($_.Left - $Window.Left) - [int]$Spec.relativeLeft) -le $tolerance -and
          [Math]::Abs(($_.Top - $Window.Top) - [int]$Spec.relativeTop) -le $tolerance
        }
    )
    if ($matches.Count -eq 1) { return $matches[0] }
    if ($matches.Count -gt 1) { throw 'MoveEdit encontro varios controles en la posicion esperada' }
    Start-Sleep -Milliseconds 100
  } while ([DateTime]::UtcNow -lt $deadline)
  throw 'MoveEdit no encontro el control esperado'
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
  'InspectControls' {
    $window = Find-Window $payload
    Write-Result ([pscustomobject]@{
      ok = $true
      window = $window
      focusedHandle = [Varix.Wimax.NativeGui]::FocusedHandle($window.Handle)
      controls = [Varix.Wimax.NativeGui]::Controls($window.Handle)
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
    Start-Sleep -Milliseconds 600
    [System.Windows.Forms.SendKeys]::SendWait([string]$payload.keys)
    $delay = if ($payload.delayMs) { [int]$payload.delayMs } else { 350 }
    Start-Sleep -Milliseconds $delay
    Write-Result ([pscustomobject]@{ ok = $true; foreground = [Varix.Wimax.NativeGui]::Foreground() })
  }
  'MoveEdit' {
    if (-not $payload.control -or -not $payload.control.from -or -not $payload.control.to) {
      throw 'MoveEdit requiere controles from y to'
    }
    if ([string]$payload.keys -cne '{TAB}') { throw 'MoveEdit solo admite una tecla TAB' }
    $window = Find-Window $payload
    $timeout = if ($payload.timeoutMs) { [int]$payload.timeoutMs } else { 5000 }
    $source = Wait-MatchingEdit $window $payload.control.from $timeout
    if (-not [Varix.Wimax.NativeGui]::ForceForeground($window.Handle)) {
      throw 'Windows no concedio el foco para MoveEdit'
    }
    Start-Sleep -Milliseconds 350
    $x = $source.Left + [Math]::Max(2, [int]($source.Width / 2))
    $y = $source.Top + [Math]::Max(2, [int]($source.Height / 2))
    [void][Varix.Wimax.NativeGui]::SetCursorPos($x, $y)
    Start-Sleep -Milliseconds 600
    [Varix.Wimax.NativeGui]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    [Varix.Wimax.NativeGui]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 350
    [System.Windows.Forms.SendKeys]::SendWait('{TAB}')
    $target = Wait-MatchingEdit $window $payload.control.to $timeout
    $delay = if ($payload.delayMs) { [int]$payload.delayMs } else { 350 }
    Start-Sleep -Milliseconds $delay
    Write-Result ([pscustomobject]@{
      ok = $true
      source = [pscustomobject]@{ left = $source.Left; top = $source.Top }
      target = [pscustomobject]@{ left = $target.Left; top = $target.Top }
      foreground = [Varix.Wimax.NativeGui]::Foreground()
    })
  }
  'AssertEditValue' {
    if (-not $payload.control) { throw 'AssertEditValue requiere control' }
    if ($null -eq $payload.value) { throw 'AssertEditValue requiere value' }
    $window = Find-Window $payload
    $timeout = if ($payload.timeoutMs) { [int]$payload.timeoutMs } else { 5000 }
    $edit = Wait-MatchingEdit $window $payload.control $timeout
    $expected = [string]$payload.value
    $observed = [Varix.Wimax.NativeGui]::TextValue([long]$edit.Handle)
    if ([string]$payload.normalize -ceq 'digits') {
      $expected = [regex]::Replace($expected, '\D', '')
      $observed = [regex]::Replace($observed, '\D', '')
    }
    elseif ($payload.normalize) {
      throw 'Normalizacion AssertEditValue no soportada'
    }
    if ($observed.Trim() -ine $expected.Trim()) {
      throw 'AssertEditValue no confirmo el valor esperado'
    }
    Write-Result ([pscustomobject]@{
      ok = $true
      observedLength = $observed.Length
      relativeLeft = $edit.Left - $window.Left
      relativeTop = $edit.Top - $window.Top
      foreground = [Varix.Wimax.NativeGui]::Foreground()
    })
  }
  'SelectComboExact' {
    if (-not $payload.control) { throw 'SelectComboExact requiere control' }
    if ([string]::IsNullOrWhiteSpace([string]$payload.value)) {
      throw 'SelectComboExact requiere value'
    }
    $window = Find-Window $payload
    $timeout = if ($payload.timeoutMs) { [int]$payload.timeoutMs } else { 5000 }
    $combo = Wait-MatchingEdit $window $payload.control $timeout
    $expected = ([string]$payload.value).Trim()
    $observed = [Varix.Wimax.NativeGui]::SelectComboExact([long]$combo.Handle, $expected)
    if ([string]::IsNullOrWhiteSpace($observed) -or $observed.Trim() -ine $expected) {
      throw 'SelectComboExact no confirmo el valor exacto'
    }
    $delay = if ($payload.delayMs) { [int]$payload.delayMs } else { 500 }
    Start-Sleep -Milliseconds $delay
    Write-Result ([pscustomobject]@{
      ok = $true
      observed = $observed
      relativeLeft = $combo.Left - $window.Left
      relativeTop = $combo.Top - $window.Top
      foreground = [Varix.Wimax.NativeGui]::Foreground()
    })
  }
  'SetInlineFields' {
    if (-not $payload.control) { throw 'Falta control' }
    if ($null -eq $payload.values) { throw 'Falta values' }
    $window = Find-Window $payload
    $control = $payload.control
    if ($control.orderBy -and [string]$control.orderBy -cne 'left') {
      throw 'Solo se admite ordenar Edit por left'
    }
    $expectedCount = [int]$control.expectedCount
    if ($expectedCount -ne 3) {
      throw 'SetInlineFields exige exactamente tres Edit'
    }
    $classPattern = if ($control.classPattern) { [string]$control.classPattern } else { '^Edit$' }
    $edits = @(
      [Varix.Wimax.NativeGui]::Controls($window.Handle) |
        Where-Object { $_.Enabled -and $_.ClassName -match $classPattern } |
        Sort-Object Left, Top, ControlId
    )
    if ($edits.Count -ne $expectedCount) {
      throw "Se esperaban $expectedCount controles Edit y se encontraron $($edits.Count)"
    }
    $values = @($payload.values)
    if ($values.Count -ne $expectedCount) {
      throw "Se esperaban $expectedCount valores y se recibieron $($values.Count)"
    }

    if (-not [Varix.Wimax.NativeGui]::ForceForeground($window.Handle)) {
      throw 'Windows no concedio el foco al editor de la linea'
    }
    Start-Sleep -Milliseconds 350
    $fieldDelay = if ($payload.delayMs) { [int]$payload.delayMs } else { 200 }
    if ($fieldDelay -lt 100 -or $fieldDelay -gt 2000) {
      throw 'delayMs de SetInlineFields fuera de rango'
    }
    $commitDelay = if ($payload.commitDelayMs) { [int]$payload.commitDelayMs } else { 1200 }
    if ($commitDelay -lt 500 -or $commitDelay -gt 5000) {
      throw 'commitDelayMs de SetInlineFields fuera de rango'
    }

    for ($index = 0; $index -lt $expectedCount; $index++) {
      $edit = $edits[$index]
      if ($edit.Width -lt 4 -or $edit.Height -lt 4) {
        throw "El Edit ordinal $($index + 1) no tiene un area valida"
      }
      $x = $edit.Left + [Math]::Max(2, [int]($edit.Width / 2))
      $y = $edit.Top + [Math]::Max(2, [int]($edit.Height / 2))
      [void][Varix.Wimax.NativeGui]::SetCursorPos($x, $y)
      Start-Sleep -Milliseconds $fieldDelay
      [Varix.Wimax.NativeGui]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
      [Varix.Wimax.NativeGui]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
      Start-Sleep -Milliseconds $fieldDelay

      # WiMAX validates stock when focus leaves Quantity. For the calibrated
      # SES service it can show a warning because its inventory is negative.
      # Accept only that exact modal, then click the intended field again.
      $afterClick = [Varix.Wimax.NativeGui]::Foreground()
      if ($afterClick.Handle -ne $window.Handle) {
        if ($index -ne 1 -or -not (Test-ExpectedInlineStockWarning $afterClick)) {
          throw "Ventana inesperada al enfocar el Edit ordinal $($index + 1)"
        }
        [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
        Start-Sleep -Milliseconds ([Math]::Max(500, $fieldDelay))
        $afterWarning = [Varix.Wimax.NativeGui]::Foreground()
        if ($afterWarning.Handle -ne $window.Handle) {
          throw 'La advertencia esperada de existencias no se cerro'
        }
        [void][Varix.Wimax.NativeGui]::SetCursorPos($x, $y)
        [Varix.Wimax.NativeGui]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
        [Varix.Wimax.NativeGui]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds $fieldDelay
        if ([Varix.Wimax.NativeGui]::Foreground().Handle -ne $window.Handle) {
          throw "El Edit ordinal $($index + 1) no recupero el foco"
        }
      }
      [System.Windows.Forms.SendKeys]::SendWait('^a')
      [System.Windows.Forms.SendKeys]::SendWait((Escape-SendKeys ([string]$values[$index])))
      Start-Sleep -Milliseconds $fieldDelay
      $observed = [Varix.Wimax.NativeGui]::TextValue([long]$edit.Handle)
      if (-not (Test-InlineNumericValue ([string]$values[$index]) $observed)) {
        $safeObserved = $observed.Replace("`r", '').Replace("`n", '').Substring(
          0,
          [Math]::Min($observed.Length, 32)
        )
        throw "El Edit ordinal $($index + 1) no confirmo el valor esperado; observado=[$safeObserved]"
      }
    }
    # The third field is Discount. The first Enter advances to the calculated
    # Total editor; the second commits the row and opens a fresh Reference row.
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Milliseconds ([Math]::Max(350, $fieldDelay))
    $totalEditorWindow = [Varix.Wimax.NativeGui]::Foreground()
    $totalEditors = @(
      [Varix.Wimax.NativeGui]::Controls($window.Handle) |
        Where-Object { $_.Enabled -and $_.ClassName -match $classPattern }
    )
    if (
      $totalEditorWindow.Handle -ne $window.Handle -or
      $totalEditors.Count -ne 1
    ) {
      throw 'WiMAX no avanzo al editor calculado de Valor Total'
    }
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Milliseconds $commitDelay
    $nextRowWindow = [Varix.Wimax.NativeGui]::Foreground()
    $nextRowEditors = if (
      $nextRowWindow -and
      $nextRowWindow.ProcessName -ieq 'WX' -and
      $nextRowWindow.ClassName -ceq 'XbpDialog' -and
      $nextRowWindow.Title -match '^\s*$' -and
      $nextRowWindow.Handle -ne $window.Handle
    ) {
      @(
        [Varix.Wimax.NativeGui]::Controls($nextRowWindow.Handle) |
          Where-Object { $_.Enabled -and $_.ClassName -match $classPattern }
      )
    }
    else {
      @()
    }
    if ($nextRowEditors.Count -ne 1) {
      throw 'WiMAX no confirmo el renglon ni abrio la siguiente Referencia'
    }
    Write-Result ([pscustomobject]@{
      ok = $true
      committed = $true
      editedControls = $expectedCount
      valueLengths = @($values | ForEach-Object { ([string]$_).Length })
      foreground = [Varix.Wimax.NativeGui]::Foreground()
    })
  }
  'Click' {
    $window = Find-Window $payload
    [void][Varix.Wimax.NativeGui]::ForceForeground($window.Handle)
    Start-Sleep -Milliseconds 350
    $x = $window.Left + [int]$payload.x
    $y = $window.Top + [int]$payload.y
    if ($x -lt $window.Left -or $x -ge ($window.Left + $window.Width) -or
        $y -lt $window.Top -or $y -ge ($window.Top + $window.Height)) {
      throw 'Las coordenadas estan fuera de la ventana objetivo'
    }
    [void][Varix.Wimax.NativeGui]::SetCursorPos($x, $y)
    # Xbase++ ignores a click if the pointer move and button event arrive in
    # the same input tick. Give its event loop time to observe the hover.
    Start-Sleep -Milliseconds 600
    [Varix.Wimax.NativeGui]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    [Varix.Wimax.NativeGui]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
    $delay = if ($payload.delayMs) { [int]$payload.delayMs } else { 350 }
    Start-Sleep -Milliseconds $delay
    Write-Result ([pscustomobject]@{ ok = $true; foreground = [Varix.Wimax.NativeGui]::Foreground() })
  }
  'PressButton' {
    $window = Find-Window $payload
    [void][Varix.Wimax.NativeGui]::ForceForeground($window.Handle)
    Start-Sleep -Milliseconds 350
    $x = $window.Left + [int]$payload.x
    $y = $window.Top + [int]$payload.y
    if ($x -lt $window.Left -or $x -ge ($window.Left + $window.Width) -or
        $y -lt $window.Top -or $y -ge ($window.Top + $window.Height)) {
      throw 'Las coordenadas estan fuera de la ventana objetivo'
    }
    [void][Varix.Wimax.NativeGui]::SetCursorPos($x, $y)
    Start-Sleep -Milliseconds 600
    [Varix.Wimax.NativeGui]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 120
    [Varix.Wimax.NativeGui]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 600
    $afterClick = [Varix.Wimax.NativeGui]::Foreground()
    $secondClickSent = $false
    if ($afterClick -and $afterClick.Handle -eq $window.Handle) {
      [Varix.Wimax.NativeGui]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
      Start-Sleep -Milliseconds 120
      [Varix.Wimax.NativeGui]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
      $secondClickSent = $true
    }
    $delay = if ($payload.delayMs) { [int]$payload.delayMs } else { 350 }
    Start-Sleep -Milliseconds $delay
    Write-Result ([pscustomobject]@{
      ok = $true
      secondClickSent = $secondClickSent
      foreground = [Varix.Wimax.NativeGui]::Foreground()
    })
  }
  'InvokeButton' {
    $window = Find-Window $payload
    $x = $window.Left + [int]$payload.x
    $y = $window.Top + [int]$payload.y
    if ($x -lt $window.Left -or $x -ge ($window.Left + $window.Width) -or
        $y -lt $window.Top -or $y -ge ($window.Top + $window.Height)) {
      throw 'Las coordenadas estan fuera de la ventana objetivo'
    }
    $buttons = @(
      [Varix.Wimax.NativeGui]::Controls($window.Handle) |
        Where-Object {
          $_.Enabled -and $_.ClassName -eq 'Button' -and
          $x -ge $_.Left -and $x -lt ($_.Left + $_.Width) -and
          $y -ge $_.Top -and $y -lt ($_.Top + $_.Height)
        }
    )
    if ($buttons.Count -ne 1) {
      throw "Se esperaba un unico Button en la coordenada calibrada y se encontraron $($buttons.Count)"
    }
    if (-not [Varix.Wimax.NativeGui]::ForceForeground($window.Handle)) {
      throw 'Windows no concedio el foco para InvokeButton'
    }
    Start-Sleep -Milliseconds 350
    $button = $buttons[0]
    $element = [System.Windows.Automation.AutomationElement]::FromHandle(
      [IntPtr]$button.Handle
    )
    if ($null -eq $element) {
      throw 'UI Automation no encontro el Button calibrado'
    }
    $activation = 'uia-invoke'
    try {
      $pattern = $element.GetCurrentPattern(
        [System.Windows.Automation.InvokePattern]::Pattern
      )
      ([System.Windows.Automation.InvokePattern]$pattern).Invoke()
    }
    catch {
      $accessible = [Varix.Wimax.NativeGui]::AccessibleObject($button.Handle)
      $accessible.accDoDefaultAction(0)
      $activation = 'msaa-default-action'
    }
    $delay = if ($payload.delayMs) { [int]$payload.delayMs } else { 350 }
    Start-Sleep -Milliseconds $delay
    Write-Result ([pscustomobject]@{
      ok = $true
      activation = $activation
      button = [pscustomobject]@{
        className = $button.ClassName
        directChild = $button.ParentHandle -eq $window.Handle
        left = $button.Left - $window.Left
        top = $button.Top - $window.Top
        width = $button.Width
        height = $button.Height
      }
      foreground = [Varix.Wimax.NativeGui]::Foreground()
    })
  }
  'TabButton' {
    $window = Find-Window $payload
    $x = $window.Left + [int]$payload.x
    $y = $window.Top + [int]$payload.y
    if ($x -lt $window.Left -or $x -ge ($window.Left + $window.Width) -or
        $y -lt $window.Top -or $y -ge ($window.Top + $window.Height)) {
      throw 'Las coordenadas estan fuera de la ventana objetivo'
    }
    $buttons = @(
      [Varix.Wimax.NativeGui]::Controls($window.Handle) |
        Where-Object {
          $_.Enabled -and $_.ClassName -eq 'Button' -and
          $x -ge $_.Left -and $x -lt ($_.Left + $_.Width) -and
          $y -ge $_.Top -and $y -lt ($_.Top + $_.Height)
        }
    )
    if ($buttons.Count -ne 1) {
      throw "Se esperaba un unico Button en la coordenada calibrada y se encontraron $($buttons.Count)"
    }
    $maxTabs = if ($null -ne $payload.maxTabs) { [int]$payload.maxTabs } else { 40 }
    if ($maxTabs -lt 0 -or $maxTabs -gt 60) {
      throw 'maxTabs de TabButton fuera de rango'
    }
    if (-not [Varix.Wimax.NativeGui]::ForceForeground($window.Handle)) {
      throw 'Windows no concedio el foco para TabButton'
    }
    Start-Sleep -Milliseconds 350
    $button = $buttons[0]
    $controls = @([Varix.Wimax.NativeGui]::Controls($window.Handle))
    $focusPath = @()
    $tabCount = 0
    $transitioned = $false
    while ($tabCount -le $maxTabs) {
      $focusedHandle = [Varix.Wimax.NativeGui]::FocusedHandle($window.Handle)
      $focusedControl = @($controls | Where-Object { $_.Handle -eq $focusedHandle }) | Select-Object -First 1
      $focusPath += [pscustomobject]@{
        tab = $tabCount
        handle = $focusedHandle
        className = if ($focusedControl) { $focusedControl.ClassName } else { $null }
        text = if ($focusedControl) { $focusedControl.Text } else { $null }
        left = if ($focusedControl) { $focusedControl.Left - $window.Left } else { $null }
        top = if ($focusedControl) { $focusedControl.Top - $window.Top } else { $null }
      }
      if ($focusedHandle -eq $button.Handle) { break }
      if ($tabCount -eq $maxTabs) {
        throw "TabButton no alcanzo el Button calibrado despues de $maxTabs TAB"
      }
      [System.Windows.Forms.SendKeys]::SendWait('{TAB}')
      Start-Sleep -Milliseconds 150
      $tabCount++
      $afterTab = [Varix.Wimax.NativeGui]::Foreground()
      if ($afterTab -and $afterTab.Handle -ne $window.Handle) {
        $transitioned = $true
        break
      }
    }
    if (-not $transitioned) {
      # Xbase++ only dispatches activate after its own TAB navigation has put
      # the XbpPushButton in the active focus chain. Space is the documented
      # keyboard activation and cannot select a different/default button.
      [System.Windows.Forms.SendKeys]::SendWait(' ')
    }
    $delay = if ($payload.delayMs) { [int]$payload.delayMs } else { 350 }
    Start-Sleep -Milliseconds $delay
    Write-Result ([pscustomobject]@{
      ok = $true
      tabCount = $tabCount
      transitioned = $transitioned
      focusPath = $focusPath
      button = [pscustomobject]@{
        className = $button.ClassName
        directChild = $button.ParentHandle -eq $window.Handle
        left = $button.Left - $window.Left
        top = $button.Top - $window.Top
        width = $button.Width
        height = $button.Height
      }
      foreground = [Varix.Wimax.NativeGui]::Foreground()
    })
  }
  'TabUntilChange' {
    $window = Find-Window $payload
    $maxTabs = if ($null -ne $payload.maxTabs) { [int]$payload.maxTabs } else { 30 }
    if ($maxTabs -lt 1 -or $maxTabs -gt 60) {
      throw 'maxTabs de TabUntilChange fuera de rango'
    }
    $tabDelay = if ($null -ne $payload.tabDelayMs) { [int]$payload.tabDelayMs } else { 150 }
    if ($tabDelay -lt 100 -or $tabDelay -gt 1000) {
      throw 'tabDelayMs de TabUntilChange fuera de rango'
    }
    if (-not [Varix.Wimax.NativeGui]::ForceForeground($window.Handle)) {
      throw 'Windows no concedio el foco para TabUntilChange'
    }
    Start-Sleep -Milliseconds 350
    $tabCount = 0
    $transitioned = $false
    while ($tabCount -lt $maxTabs) {
      [System.Windows.Forms.SendKeys]::SendWait('{TAB}')
      Start-Sleep -Milliseconds $tabDelay
      $tabCount++
      $foreground = [Varix.Wimax.NativeGui]::Foreground()
      if ($foreground -and $foreground.Handle -ne $window.Handle) {
        $transitioned = $true
        break
      }
    }
    if (-not $transitioned) {
      throw "TabUntilChange no produjo una transicion despues de $maxTabs TAB"
    }
    $delay = if ($payload.delayMs) { [int]$payload.delayMs } else { 350 }
    Start-Sleep -Milliseconds $delay
    Write-Result ([pscustomobject]@{
      ok = $true
      tabCount = $tabCount
      foreground = [Varix.Wimax.NativeGui]::Foreground()
    })
  }
  'RightClick' {
    $window = Find-Window $payload
    [void][Varix.Wimax.NativeGui]::ForceForeground($window.Handle)
    Start-Sleep -Milliseconds 350
    $x = $window.Left + [int]$payload.x
    $y = $window.Top + [int]$payload.y
    if ($x -lt $window.Left -or $x -ge ($window.Left + $window.Width) -or
        $y -lt $window.Top -or $y -ge ($window.Top + $window.Height)) {
      throw 'Las coordenadas estan fuera de la ventana objetivo'
    }
    [void][Varix.Wimax.NativeGui]::SetCursorPos($x, $y)
    Start-Sleep -Milliseconds 600
    [Varix.Wimax.NativeGui]::mouse_event(0x0008, 0, 0, 0, [UIntPtr]::Zero)
    [Varix.Wimax.NativeGui]::mouse_event(0x0010, 0, 0, 0, [UIntPtr]::Zero)
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
