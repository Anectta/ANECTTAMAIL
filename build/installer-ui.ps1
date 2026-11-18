param(
  [string]$LogoPath = "",
  [string]$PluginsDir = "",
  [string]$InstDir = "",
  [int]$NsisPid = 0,
  [long]$TotalKB = 0,
  [int]$IsUpdate = 0
)

$ErrorActionPreference = "SilentlyContinue"

if ($IsUpdate -eq 0) {
  try {
    if ($InstDir -and (Test-Path -LiteralPath (Join-Path $InstDir "Anectta MAIL.exe"))) {
      $IsUpdate = 1
    } else {
      $defaultExe = Join-Path $env:LOCALAPPDATA "Programs\anectta-mail\Anectta MAIL.exe"
      if (Test-Path -LiteralPath $defaultExe) {
        $IsUpdate = 1
      }
    }
  } catch {}
}

$windowTitleText = if ($IsUpdate -eq 1) { "Atualizando Anectta MAIL" } else { "Instalando Anectta MAIL" }
$headingText = if ($IsUpdate -eq 1) { "Atualizando o Gerenciador de Email..." } else { "Instalando o Gerenciador de Email..." }

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class Win32Helper {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

  public static bool HasProgressChild(IntPtr hWnd) {
    bool found = false;
    EnumChildWindows(hWnd, (child, lp) => {
      StringBuilder sb = new StringBuilder(128);
      GetClassName(child, sb, 128);
      if (sb.ToString() == "msctls_progress32") {
        found = true;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@

if ($NsisPid -le 0) {
  try {
    $NsisPid = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId
  } catch {}
}

function Sync-NsisWindows {
  if ($NsisPid -le 0) { return $false }
  $script:hasVisibleDialog = $false
  [Win32Helper]::EnumWindows({
    param($hWnd, $lParam)
    [uint32]$procId = 0
    [void][Win32Helper]::GetWindowThreadProcessId($hWnd, [ref]$procId)
    if ($procId -eq [uint32]$NsisPid -and [Win32Helper]::IsWindowVisible($hWnd)) {
      $sb = New-Object System.Text.StringBuilder 256
      [void][Win32Helper]::GetClassName($hWnd, $sb, 256)
      $cls = $sb.ToString()
      if ([Win32Helper]::HasProgressChild($hWnd) -or $cls -like "*SpiderBanner*") {
        [void][Win32Helper]::ShowWindow($hWnd, 0)
      } elseif ($cls -eq "#32770") {
        # MessageBox do NSIS (ex: app em execução ou atalho na área de trabalho)
        $script:hasVisibleDialog = $true
      }
    }
    return $true
  }, [IntPtr.Zero]) | Out-Null
  return $script:hasVisibleDialog
}

function Get-DirBytes([string]$Path) {
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return [long]0 }
  try {
    $sum = (Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    if ($null -eq $sum) { return [long]0 }
    return [long]$sum
  } catch {
    return [long]0
  }
}

$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="$windowTitleText"
        Width="800" Height="550"
        WindowStartupLocation="CenterScreen"
        WindowStyle="None"
        AllowsTransparency="True"
        Background="Transparent"
        ResizeMode="NoResize"
        Topmost="True"
        ShowInTaskbar="True">
  <Grid Margin="30">
    <!-- Glow externo ciano sutil -->
    <Border CornerRadius="14" Background="#15181C" BorderBrush="#2A323D" BorderThickness="1">
      <Border.Effect>
        <DropShadowEffect Color="#00C4FF" BlurRadius="34" ShadowDepth="0" Opacity="0.38"/>
      </Border.Effect>

      <Grid>
        <Grid.RowDefinitions>
          <RowDefinition Height="*"/>
          <RowDefinition Height="64"/>
        </Grid.RowDefinitions>

        <!-- Conteúdo principal -->
        <StackPanel Grid.Row="0" VerticalAlignment="Center" HorizontalAlignment="Center" Width="590" Margin="0,6,0,0">
          <!-- Logo com loop de giro no próprio eixo horizontal -->
          <Image x:Name="LogoImage" Width="116" Height="116" Margin="0,0,0,8" RenderOptions.BitmapScalingMode="HighQuality" RenderTransformOrigin="0.5,0.5">
            <Image.RenderTransform>
              <ScaleTransform x:Name="LogoScale" ScaleX="1" ScaleY="1"/>
            </Image.RenderTransform>
            <Image.Effect>
              <DropShadowEffect x:Name="LogoGlow" Color="#00A8FF" BlurRadius="22" ShadowDepth="2" Opacity="0.35"/>
            </Image.Effect>
            <Image.Triggers>
              <EventTrigger RoutedEvent="Loaded">
                <BeginStoryboard>
                  <Storyboard RepeatBehavior="Forever">
                    <DoubleAnimationUsingKeyFrames Storyboard.TargetName="LogoScale" Storyboard.TargetProperty="ScaleX" Duration="0:0:2.4">
                      <EasingDoubleKeyFrame KeyTime="0:0:0.0" Value="1"/>
                      <EasingDoubleKeyFrame KeyTime="0:0:0.6" Value="0">
                        <EasingDoubleKeyFrame.EasingFunction>
                          <SineEase EasingMode="EaseIn"/>
                        </EasingDoubleKeyFrame.EasingFunction>
                      </EasingDoubleKeyFrame>
                      <EasingDoubleKeyFrame KeyTime="0:0:1.2" Value="-1">
                        <EasingDoubleKeyFrame.EasingFunction>
                          <SineEase EasingMode="EaseOut"/>
                        </EasingDoubleKeyFrame.EasingFunction>
                      </EasingDoubleKeyFrame>
                      <EasingDoubleKeyFrame KeyTime="0:0:1.8" Value="0">
                        <EasingDoubleKeyFrame.EasingFunction>
                          <SineEase EasingMode="EaseIn"/>
                        </EasingDoubleKeyFrame.EasingFunction>
                      </EasingDoubleKeyFrame>
                      <EasingDoubleKeyFrame KeyTime="0:0:2.4" Value="1">
                        <EasingDoubleKeyFrame.EasingFunction>
                          <SineEase EasingMode="EaseOut"/>
                        </EasingDoubleKeyFrame.EasingFunction>
                      </EasingDoubleKeyFrame>
                    </DoubleAnimationUsingKeyFrames>
                  </Storyboard>
                </BeginStoryboard>
              </EventTrigger>
            </Image.Triggers>
          </Image>

          <!-- Marca -->
          <TextBlock Text="&#923;NECTT&#923; M@il"
                     FontFamily="Segoe UI Light, Segoe UI"
                     FontSize="52"
                     FontWeight="Light"
                     Foreground="#E5E7EB"
                     HorizontalAlignment="Center"
                     TextAlignment="Center"
                     Margin="0,0,0,10"/>

          <!-- Título -->
          <TextBlock x:Name="TitleText"
                     Text="$headingText"
                     FontFamily="Segoe UI"
                     FontSize="25"
                     FontWeight="Bold"
                     Foreground="#FFFFFF"
                     HorizontalAlignment="Center"
                     TextAlignment="Center"
                     Margin="0,0,0,6"/>

          <!-- Subtítulo -->
          <TextBlock Text="Simples, f&#225;cil, conectado... do seu jeito!"
                     FontFamily="Segoe UI"
                     FontSize="19.5"
                     Foreground="#9CA3AF"
                     HorizontalAlignment="Center"
                     TextAlignment="Center"
                     Margin="0,0,0,28"/>

          <!-- Barra de progresso + porcentagem -->
          <Grid Width="570" HorizontalAlignment="Center">
            <Grid.ColumnDefinitions>
              <ColumnDefinition Width="*"/>
              <ColumnDefinition Width="58"/>
            </Grid.ColumnDefinitions>

            <Border Grid.Column="0" x:Name="ProgressTrack" Height="18" CornerRadius="9" Background="#2C313A" ClipToBounds="True">
              <Grid HorizontalAlignment="Left">
                <Border x:Name="ProgressFill" Width="28" Height="18" CornerRadius="9" HorizontalAlignment="Left">
                  <Border.Background>
                    <LinearGradientBrush StartPoint="0,0.5" EndPoint="1,0.5">
                      <GradientStop Color="#0052FF" Offset="0"/>
                      <GradientStop Color="#00A8FF" Offset="0.55"/>
                      <GradientStop Color="#00F2FE" Offset="1"/>
                    </LinearGradientBrush>
                  </Border.Background>
                  <Border.Effect>
                    <DropShadowEffect Color="#00E5FF" BlurRadius="14" ShadowDepth="0" Opacity="0.8"/>
                  </Border.Effect>
                </Border>
                <!-- Brilho na ponta da barra -->
                <Ellipse x:Name="ProgressGlowDot" Width="12" Height="12" HorizontalAlignment="Right" VerticalAlignment="Center" Margin="0,0,3,0" Fill="#E0FFFF" Opacity="0.85"/>
              </Grid>
            </Border>

            <TextBlock Grid.Column="1" x:Name="PercentText"
                       Text="0%"
                       FontFamily="Segoe UI"
                       FontSize="15"
                       FontWeight="SemiBold"
                       Foreground="#D1D5DB"
                       VerticalAlignment="Center"
                       HorizontalAlignment="Right"/>
          </Grid>
        </StackPanel>

        <!-- Rodapé -->
        <Border Grid.Row="1" Background="#1C2026" BorderBrush="#262B33" BorderThickness="0,1,0,0" CornerRadius="0,0,14,14" Padding="24,0">
          <Button x:Name="CancelButton"
                  Content="Cancelar"
                  Width="104"
                  Height="34"
                  HorizontalAlignment="Right"
                  VerticalAlignment="Center"
                  FontFamily="Segoe UI"
                  FontSize="13.5"
                  FontWeight="Medium"
                  Foreground="#D1D5DB"
                  Cursor="Hand">
            <Button.Template>
              <ControlTemplate TargetType="Button">
                <Border x:Name="BtnBorder" Background="#282D35" BorderBrush="#39404A" BorderThickness="1" CornerRadius="6">
                  <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                </Border>
                <ControlTemplate.Triggers>
                  <Trigger Property="IsMouseOver" Value="True">
                    <Setter TargetName="BtnBorder" Property="Background" Value="#343B46"/>
                    <Setter TargetName="BtnBorder" Property="BorderBrush" Value="#4B5563"/>
                  </Trigger>
                  <Trigger Property="IsPressed" Value="True">
                    <Setter TargetName="BtnBorder" Property="Background" Value="#1F242B"/>
                  </Trigger>
                </ControlTemplate.Triggers>
              </ControlTemplate>
            </Button.Template>
          </Button>
        </Border>
      </Grid>
    </Border>
  </Grid>
</Window>
"@

$reader = New-Object System.Xml.XmlNodeReader ([xml]$xaml)
$window = [Windows.Markup.XamlReader]::Load($reader)

$logoImage = $window.FindName("LogoImage")
$progressTrack = $window.FindName("ProgressTrack")
$progressFill = $window.FindName("ProgressFill")
$percentText = $window.FindName("PercentText")
$cancelButton = $window.FindName("CancelButton")

if ($LogoPath -and (Test-Path -LiteralPath $LogoPath)) {
  $bmp = New-Object System.Windows.Media.Imaging.BitmapImage
  $bmp.BeginInit()
  $bmp.UriSource = New-Object System.Uri($LogoPath)
  $bmp.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
  $bmp.EndInit()
  $logoImage.Source = $bmp
}

$window.Add_MouseLeftButtonDown({
  try { $window.DragMove() } catch {}
})

$cancelButton.Add_Click({
  if ($NsisPid -gt 0) {
    try { Stop-Process -Id $NsisPid -Force -ErrorAction SilentlyContinue } catch {}
  }
  $window.Close()
})

$doneFlag = if ($PluginsDir) { Join-Path $PluginsDir "done.flag" } else { "" }
$uiClosedFlag = if ($PluginsDir) { Join-Path $PluginsDir "ui-closed.flag" } else { "" }
$extractDir = if ($PluginsDir) { Join-Path $PluginsDir "7z-out" } else { "" }

[double]$estimatedTotalBytes = 210 * 1024 * 1024
if ($TotalKB -gt 0) {
  $estimatedTotalBytes = [double]($TotalKB * 1024)
} elseif ($PluginsDir) {
  $pkg = Get-ChildItem -LiteralPath $PluginsDir -Filter "app-*.7z" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($pkg -and $pkg.Length -gt 0) {
    $estimatedTotalBytes = [Math]::Max($pkg.Length * 2.8, 120 * 1024 * 1024)
  }
}

$script:currentPct = 2.0
$script:finishing = $false
$script:finishTicks = 0

$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(100)
$timer.Add_Tick({
  if ($NsisPid -gt 0) {
    $p = Get-Process -Id $NsisPid -ErrorAction SilentlyContinue
    if (-not $p) {
      $timer.Stop()
      $window.Close()
      return
    }
  }

  $hasDialog = Sync-NsisWindows
  if ($hasDialog) {
    if ($window.Topmost) { $window.Topmost = $false }
  }

  if ($doneFlag -and (Test-Path -LiteralPath $doneFlag)) {
    $script:finishing = $true
  }

  $trackWidth = $progressTrack.ActualWidth
  if ($trackWidth -le 0) { $trackWidth = 512 }

  if ($script:finishing) {
    if ($script:currentPct -lt 100.0) {
      $script:currentPct = [Math]::Min(100.0, $script:currentPct + 3.2)
    } else {
      $script:finishTicks++
    }
    $pctInt = [int][Math]::Round($script:currentPct)
    $progressFill.Width = [Math]::Max(20.0, $trackWidth * ($script:currentPct / 100.0))
    $percentText.Text = "$pctInt%"
    if ($script:finishTicks -ge 6) {
      $timer.Stop()
      if ($uiClosedFlag) {
        try { Set-Content -LiteralPath $uiClosedFlag -Value "closed" -ErrorAction SilentlyContinue } catch {}
      }
      $window.Close()
    }
    return
  }

  # Se há um MessageBox aberto (ex: app rodando), pausa o avanço
  if ($hasDialog) { return }

  $bytesExtract = Get-DirBytes $extractDir
  $bytesInst = Get-DirBytes $InstDir
  $measuredBytes = [Math]::Max($bytesExtract, $bytesInst)

  if ($measuredBytes -gt $estimatedTotalBytes * 0.94) {
    $estimatedTotalBytes = $measuredBytes * 1.08
  }

  if ($measuredBytes -gt 0) {
    $targetPct = [Math]::Min(96.0, [Math]::Max(8.0, ($measuredBytes / $estimatedTotalBytes) * 100.0))
    if ($targetPct -gt $script:currentPct) {
      # Avanço suave e controlado (~1.0% por tick = ~9-10s mínimos para sensação de instalação completa)
      $step = [Math]::Min(1.1, ($targetPct - $script:currentPct) * 0.14)
      if ($step -lt 0.25) { $step = 0.25 }
      $script:currentPct = [Math]::Min($targetPct, $script:currentPct + $step)
    }
  } else {
    if ($script:currentPct -lt 16.0) {
      $script:currentPct += 0.35
    }
  }

  $pctInt = [Math]::Min(96, [Math]::Max(1, [int][Math]::Round($script:currentPct)))
  $progressFill.Width = [Math]::Max(20.0, ($trackWidth * ($script:currentPct / 100.0)))
  $percentText.Text = "$pctInt%"
})

$window.Add_ContentRendered({
  [void](Sync-NsisWindows)
  $timer.Start()
})

[void]$window.ShowDialog()
