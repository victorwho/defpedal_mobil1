param(
  [string]$SourcePath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$StagingPath = 'C:\dpm',
  [string]$DeviceSerial = '',
  [int]$MetroPort = 8081,
  [ValidateSet('development', 'preview', 'production')]
  [string]$AppVariant = 'development',
  [ValidateSet('debug', 'release')]
  [string]$AndroidVariant = 'debug',
  [int]$MetroReadyTimeoutSeconds = 120,
  [int]$BundleReadyTimeoutSeconds = 180,
  [switch]$SkipInstall,
  [switch]$SkipPrebuild,
  [switch]$SkipMetroStart,
  [switch]$SkipAndroidRun,
  [switch]$OpenDiagnostics
)

$ErrorActionPreference = 'Stop'

function Invoke-Robocopy {
  param(
    [string]$From,
    [string]$To
  )

  $excludedDirectories = @(
    '.git',
    '.expo',
    'dist',
    'output',
    'tmp',
    'node_modules',
    'apps\mobile\android\.gradle',
    'apps\mobile\android\.kotlin',
    'apps\mobile\android\.cxx',
    'apps\mobile\android\app\build',
    'apps\mobile\android\app\.cxx',
    'apps\mobile\android\build'
  )

  $arguments = @(
    $From,
    $To,
    '/MIR',
    '/R:2',
    '/W:1',
    '/NFL',
    '/NDL',
    '/NJH',
    '/NJS',
    '/NP',
    '/XD'
  ) + $excludedDirectories

  & robocopy @arguments | Out-Null

  if ($LASTEXITCODE -ge 8) {
    throw "Robocopy failed with exit code $LASTEXITCODE."
  }
}

function Remove-StagingBuildArtifacts {
  param(
    [string]$RootPath
  )

  $artifacts = @(
    'apps\mobile\.expo',
    'apps\mobile\android\.gradle',
    'apps\mobile\android\.kotlin',
    'apps\mobile\android\.cxx',
    'apps\mobile\android\build',
    'apps\mobile\android\app\.cxx',
    'apps\mobile\android\app\build'
  )

  foreach ($artifact in $artifacts) {
    $artifactPath = Join-Path $RootPath $artifact
    if (Test-Path $artifactPath) {
      Remove-Item -Path $artifactPath -Recurse -Force
    }
  }
}

function Stop-StagingGradleDaemon {
  param(
    [string]$RootPath
  )

  $gradleWrapperPath = Join-Path $RootPath 'apps\mobile\android\gradlew.bat'
  $gradleProjectPath = Join-Path $RootPath 'apps\mobile\android'

  if (-not (Test-Path $gradleWrapperPath)) {
    return
  }

  try {
    Push-Location $gradleProjectPath
    try {
      & $gradleWrapperPath --stop | Out-Null
    } finally {
      Pop-Location
    }
  } catch {
    Write-Warning "Unable to stop staged Gradle daemons cleanly: $($_.Exception.Message)"
  }
}

function Stop-ProcessListeningOnPort {
  param(
    [int]$Port
  )

  try {
    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
  } catch {
    return
  }

  $processIds = $listeners | Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($processId in $processIds) {
    if ($processId -and $processId -ne $PID) {
      try {
        Stop-Process -Id $processId -Force -ErrorAction Stop
        Write-Host "Stopped existing process on port $Port (PID $processId)." -ForegroundColor DarkYellow
      } catch {
        Write-Warning "Unable to stop process $processId on port ${Port}: $($_.Exception.Message)"
      }
    }
  }
}

function Get-LogTail {
  param(
    [string[]]$Paths,
    [int]$LineCount = 20
  )

  $sections = @()

  foreach ($path in $Paths) {
    if (-not $path -or -not (Test-Path $path)) {
      continue
    }

    $content = Get-Content -Path $path -Tail $LineCount -ErrorAction SilentlyContinue

    if ($content) {
      $sections += "[$path]"
      $sections += $content
    }
  }

  return ($sections -join [Environment]::NewLine).Trim()
}

function Convert-HttpContentToText {
  param(
    [Parameter(ValueFromPipeline = $true)]
    $Content
  )

  if ($null -eq $Content) {
    return ''
  }

  if ($Content -is [byte[]]) {
    return [System.Text.Encoding]::UTF8.GetString($Content)
  }

  return [string]$Content
}

function Get-AppVariantConfig {
  param(
    [string]$Variant
  )

  switch ($Variant.Trim().ToLowerInvariant()) {
    'preview' {
      return [PSCustomObject]@{
        Variant = 'preview'
        AppEnv = 'staging'
        PackageName = 'com.defensivepedal.mobile.preview'
        Scheme = 'defensivepedal-preview'
      }
    }
    'production' {
      return [PSCustomObject]@{
        Variant = 'production'
        AppEnv = 'production'
        PackageName = 'com.defensivepedal.mobile'
        Scheme = 'defensivepedal'
      }
    }
    default {
      return [PSCustomObject]@{
        Variant = 'development'
        AppEnv = 'development'
        PackageName = 'com.defensivepedal.mobile.dev'
        Scheme = 'defensivepedal-dev'
      }
    }
  }
}

function Get-EnvFileValues {
  param(
    [string]$FilePath
  )

  $values = @{}

  if (-not (Test-Path $FilePath)) {
    return $values
  }

  foreach ($line in Get-Content -Path $FilePath) {
    $trimmed = $line.Trim()

    if (-not $trimmed -or $trimmed.StartsWith('#')) {
      continue
    }

    if ($trimmed.StartsWith('export ')) {
      $trimmed = $trimmed.Substring(7).Trim()
    }

    $separatorIndex = $trimmed.IndexOf('=')

    if ($separatorIndex -lt 1) {
      continue
    }

    $key = $trimmed.Substring(0, $separatorIndex).Trim()
    $value = $trimmed.Substring($separatorIndex + 1).Trim().Trim("'`"")

    if ($key) {
      $values[$key] = $value
    }
  }

  return $values
}

function Get-StagedEnvValues {
  param(
    [string]$RootPath,
    [string]$Variant
  )

  $merged = @{}
  $variantSuffix = ".$Variant"
  $candidatePaths = @(
    (Join-Path $RootPath '.env'),
    (Join-Path $RootPath ".env$variantSuffix"),
    (Join-Path $RootPath 'apps\mobile\.env'),
    (Join-Path $RootPath "apps\mobile\.env$variantSuffix")
  )

  foreach ($path in $candidatePaths) {
    foreach ($entry in (Get-EnvFileValues -FilePath $path).GetEnumerator()) {
      $merged[$entry.Key] = $entry.Value
    }
  }

  return $merged
}

function Wait-ForMetroStatus {
  param(
    [int]$Port,
    [System.Diagnostics.Process]$Process,
    [int]$TimeoutSeconds = 120,
    [string[]]$LogPaths = @()
  )

  $statusUrl = "http://localhost:$Port/status"
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = ''

  while ((Get-Date) -lt $deadline) {
    if ($Process.HasExited) {
      $logTail = Get-LogTail -Paths $LogPaths
      throw "Metro exited early with code $($Process.ExitCode).`n$logTail"
    }

    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $statusUrl -TimeoutSec 5
      $content = Convert-HttpContentToText $response.Content

      if ($content -match 'packager-status:running') {
        return
      }

      $lastError = "Unexpected Metro status response: $content"
    } catch {
      $lastError = $_.Exception.Message
    }

    Start-Sleep -Seconds 2
  }

  $logTail = Get-LogTail -Paths $LogPaths
  throw "Timed out waiting for Metro on port $Port. Last error: $lastError`n$logTail"
}

function Assert-MetroBundleResolves {
  param(
    [int]$Port,
    [System.Diagnostics.Process]$Process,
    [int]$TimeoutSeconds = 180,
    [string[]]$LogPaths = @()
  )

  $bundleUrl = "http://localhost:$Port/index.bundle?platform=android&dev=true&minify=false&modulesOnly=true&runModule=false"
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = ''

  while ((Get-Date) -lt $deadline) {
    if ($Process.HasExited) {
      $logTail = Get-LogTail -Paths $LogPaths
      throw "Metro exited before the Android bundle smoke check completed. Exit code: $($Process.ExitCode).`n$logTail"
    }

    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $bundleUrl -TimeoutSec 30
      $content = Convert-HttpContentToText $response.Content

      if ($content -match 'UnableToResolveError') {
        $lastError = 'Metro returned UnableToResolveError while building the Android bundle.'
      } elseif ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300 -and $content.Trim().Length -gt 0) {
        return
      } else {
        $lastError = "Unexpected bundle response status: $($response.StatusCode)"
      }
    } catch {
      $lastError = $_.Exception.Message
    }

    Start-Sleep -Seconds 2
  }

  $logTail = Get-LogTail -Paths $LogPaths
  throw "Metro did not produce a valid Android bundle on port $Port. Last error: $lastError`n$logTail"
}

function Start-MetroServer {
  param(
    [string]$ProjectPath,
    [int]$Port,
    [int]$ReadyTimeoutSeconds,
    [int]$BundleTimeoutSeconds,
    [string]$LogDirectory
  )

  if (-not (Test-Path $LogDirectory)) {
    New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
  }

  $stdoutPath = Join-Path $LogDirectory 'metro.log'
  $stderrPath = Join-Path $LogDirectory 'metro-error.log'
  $pidPath = Join-Path $LogDirectory 'metro.pid'

  if (Test-Path $stdoutPath) {
    Remove-Item $stdoutPath -Force
  }

  if (Test-Path $stderrPath) {
    Remove-Item $stderrPath -Force
  }

  $npxCmd = 'C:\Program Files\nodejs\npx.cmd'
  $arguments = @('expo', 'start', '--dev-client', '--port', "$Port", '--clear', '--lan')

  $process = Start-Process -FilePath $npxCmd -ArgumentList $arguments -WorkingDirectory $ProjectPath -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru -WindowStyle Hidden
  Set-Content -Path $pidPath -Value "$($process.Id)" -NoNewline

  Wait-ForMetroStatus -Port $Port -Process $process -TimeoutSeconds $ReadyTimeoutSeconds -LogPaths @($stdoutPath, $stderrPath)
  Assert-MetroBundleResolves -Port $Port -Process $process -TimeoutSeconds $BundleTimeoutSeconds -LogPaths @($stdoutPath, $stderrPath)

  return [PSCustomObject]@{
    Process = $process
    StdoutPath = $stdoutPath
    StderrPath = $stderrPath
    PidPath = $pidPath
  }
}

function Ensure-AdbReverse {
  param(
    [int]$Port,
    [string]$Serial = ''
  )

  $adbPath = Get-Command adb -ErrorAction SilentlyContinue

  if (-not $adbPath) {
    Write-Warning "adb was not found on PATH, so tcp:$Port reverse could not be configured automatically."
    return
  }

  $adbArguments = @()

  if (-not [string]::IsNullOrWhiteSpace($Serial)) {
    $adbArguments += @('-s', $Serial.Trim())
  }

  & $adbPath.Source @adbArguments wait-for-device | Out-Null
  & $adbPath.Source @adbArguments reverse "tcp:$Port" "tcp:$Port" | Out-Null

  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Unable to configure adb reverse for tcp:$Port."
  }
}

function Resolve-ValidationMobileApiUrl {
  param(
    [string]$ConfiguredUrl = '',
    [int]$DefaultPort = 8080
  )

  if ([string]::IsNullOrWhiteSpace($configuredUrl)) {
    return "http://127.0.0.1:$DefaultPort"
  }

  try {
    $uri = [System.Uri]$configuredUrl.Trim()
  } catch {
    return $configuredUrl.Trim()
  }

  if ($uri.Scheme -ne 'http') {
    return $configuredUrl.Trim()
  }

  if ($uri.Host -in @('10.0.2.2', 'localhost')) {
    return "http://127.0.0.1:$($uri.Port)"
  }

  return $configuredUrl.Trim()
}

function Open-AndroidDiagnostics {
  param(
    [string]$PackageName,
    [string]$Scheme,
    [string]$Serial = ''
  )

  $adbPath = Get-Command adb -ErrorAction SilentlyContinue

  if (-not $adbPath) {
    Write-Warning 'adb was not found on PATH, so Diagnostics could not be opened automatically.'
    return
  }

  $adbArguments = @()

  if (-not [string]::IsNullOrWhiteSpace($Serial)) {
    $adbArguments += @('-s', $Serial.Trim())
  }

  & $adbPath.Source @adbArguments shell am start -W -a android.intent.action.VIEW -d "$Scheme`://diagnostics" $PackageName | Out-Null
}

$resolvedSourcePath = (Resolve-Path $SourcePath).Path
$variantConfig = Get-AppVariantConfig -Variant $AppVariant
$validationBundleId = "android-native-$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'))"
$effectiveStagingPath = $StagingPath

if (Test-Path $effectiveStagingPath) {
  try {
    Stop-StagingGradleDaemon -RootPath $effectiveStagingPath
    Remove-StagingBuildArtifacts -RootPath $effectiveStagingPath
  } catch {
    $fallbackStagingPath = "$StagingPath-r$([DateTime]::UtcNow.ToString('HHmmss'))"
    Write-Warning "Unable to recycle $effectiveStagingPath cleanly. Falling back to $fallbackStagingPath."
    $effectiveStagingPath = $fallbackStagingPath
  }
}

if (-not (Test-Path $effectiveStagingPath)) {
  New-Item -ItemType Directory -Path $effectiveStagingPath -Force | Out-Null
}

Write-Host "Staging native Android validation workspace to $effectiveStagingPath" -ForegroundColor Cyan
Invoke-Robocopy -From $resolvedSourcePath -To $effectiveStagingPath
Stop-StagingGradleDaemon -RootPath $effectiveStagingPath
Remove-StagingBuildArtifacts -RootPath $effectiveStagingPath

Push-Location $effectiveStagingPath

try {
  Stop-ProcessListeningOnPort -Port $MetroPort

  if (-not [string]::IsNullOrWhiteSpace($DeviceSerial)) {
    $env:ANDROID_SERIAL = $DeviceSerial.Trim()
  }

  $stagedEnvValues = Get-StagedEnvValues -RootPath $effectiveStagingPath -Variant $variantConfig.Variant
  $env:EXPO_PUBLIC_VALIDATION_BUNDLE_ID = $validationBundleId
  $env:EXPO_PUBLIC_VALIDATION_SOURCE_ROOT = $effectiveStagingPath
  $env:EXPO_PUBLIC_VALIDATION_METRO_PORT = "$MetroPort"
  $env:EXPO_PUBLIC_VALIDATION_MODE = 'android-native-validate'
  $env:EXPO_NO_METRO_WORKSPACE_ROOT = '1'
  $env:APP_VARIANT = $variantConfig.Variant
  $env:EXPO_PUBLIC_APP_ENV = $variantConfig.AppEnv
  $configuredMobileApiUrl =
    if (-not [string]::IsNullOrWhiteSpace($env:EXPO_PUBLIC_MOBILE_API_URL)) {
      $env:EXPO_PUBLIC_MOBILE_API_URL
    } elseif ($stagedEnvValues.ContainsKey('EXPO_PUBLIC_MOBILE_API_URL')) {
      $stagedEnvValues['EXPO_PUBLIC_MOBILE_API_URL']
    } else {
      ''
    }
  $validationMobileApiUrl = Resolve-ValidationMobileApiUrl -ConfiguredUrl $configuredMobileApiUrl
  $env:EXPO_PUBLIC_MOBILE_API_URL = $validationMobileApiUrl

  Write-Host "Validation bundle marker: $validationBundleId" -ForegroundColor Cyan
  Write-Host "Validation Metro port: $MetroPort" -ForegroundColor Cyan
  Write-Host "App variant: $($variantConfig.Variant)" -ForegroundColor Cyan
  Write-Host "App package: $($variantConfig.PackageName)" -ForegroundColor Cyan
  Write-Host "App scheme: $($variantConfig.Scheme)" -ForegroundColor Cyan
  Write-Host "Android variant: $AndroidVariant" -ForegroundColor Cyan
  Write-Host ("Android target: {0}" -f ($(if ([string]::IsNullOrWhiteSpace($DeviceSerial)) { 'default adb target' } else { $DeviceSerial.Trim() }))) -ForegroundColor Cyan
  Write-Host "Validation mobile API URL: $validationMobileApiUrl" -ForegroundColor Cyan
  Write-Host 'Expo Metro workspace-root promotion disabled for staged native validation.' -ForegroundColor Cyan

  $mobileProjectPath = Join-Path $effectiveStagingPath 'apps\mobile'
  $validationLogDirectory = Join-Path $effectiveStagingPath 'tmp\validation'
  $metroServer = $null
  $shouldStartMetro = -not $SkipMetroStart -and $AndroidVariant -eq 'debug'

  if (-not $SkipInstall) {
    Write-Host 'Installing workspace dependencies in the short-path staging copy...' -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) {
      throw "npm install failed with exit code $LASTEXITCODE."
    }
  }

  if (-not $SkipPrebuild) {
    Write-Host 'Regenerating the Android native project inside the short-path staging copy...' -ForegroundColor Cyan
    Push-Location $mobileProjectPath
    try {
      $previousCi = $env:CI
      $env:CI = '1'
      npx expo prebuild --clean --platform android
      if ($LASTEXITCODE -ne 0) {
        throw "expo prebuild failed with exit code $LASTEXITCODE."
      }
    } finally {
      $env:CI = $previousCi
      Pop-Location
    }
  }

  if ($shouldStartMetro) {
    Write-Host 'Starting Metro explicitly from the staged mobile workspace...' -ForegroundColor Cyan
    $metroServer = Start-MetroServer -ProjectPath $mobileProjectPath -Port $MetroPort -ReadyTimeoutSeconds $MetroReadyTimeoutSeconds -BundleTimeoutSeconds $BundleReadyTimeoutSeconds -LogDirectory $validationLogDirectory
    Write-Host "Metro is ready on port $MetroPort (PID $($metroServer.Process.Id))." -ForegroundColor Green
    Write-Host "Metro logs: $($metroServer.StdoutPath)" -ForegroundColor DarkGray
  }

  try {
    $validationMobileApiUri = [System.Uri]$validationMobileApiUrl

    if ($validationMobileApiUri.Host -in @('127.0.0.1', 'localhost')) {
      Ensure-AdbReverse -Port $validationMobileApiUri.Port -Serial $DeviceSerial
    }
  } catch {
    Write-Warning "Unable to configure adb reverse for validation mobile API URL '$validationMobileApiUrl': $($_.Exception.Message)"
  }

  if ($shouldStartMetro) {
    Ensure-AdbReverse -Port $MetroPort -Serial $DeviceSerial
  }

  if (-not $SkipAndroidRun) {
    Write-Host 'Launching the native Android app from the short-path staging copy...' -ForegroundColor Cyan
    Push-Location $mobileProjectPath
    try {
      $androidRunArguments = @('expo', 'run:android', '--variant', $AndroidVariant)

      if ($AndroidVariant -eq 'debug') {
        $androidRunArguments += @('--port', "$MetroPort")
      }

      if ($shouldStartMetro -or $AndroidVariant -ne 'debug') {
        $androidRunArguments += '--no-bundler'
      }

      & npx @androidRunArguments
      if ($LASTEXITCODE -ne 0) {
        throw "Native Android launch failed with exit code $LASTEXITCODE."
      }
    } finally {
      Pop-Location
    }

    if ($OpenDiagnostics) {
      Open-AndroidDiagnostics -PackageName $variantConfig.PackageName -Scheme $variantConfig.Scheme -Serial $DeviceSerial
    }

    if ($LASTEXITCODE -ne 0) {
      throw "Native Android launch failed with exit code $LASTEXITCODE."
    }
  }
} finally {
  Pop-Location
}
