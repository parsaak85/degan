param(
    [string]$AndroidSdk = $env:ANDROID_HOME,
    [string]$GradleCache = $env:GRADLE_USER_HOME,
    [string]$BuildTemp = (Join-Path $env:TEMP 'degan-build'),
    [string]$JavaHome = $env:JAVA_HOME
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (!$AndroidSdk -or !$JavaHome) { throw 'Set ANDROID_HOME and JAVA_HOME before building.' }
if (!$GradleCache) { $GradleCache = Join-Path $env:USERPROFILE '.gradle' }
New-Item -ItemType Directory -Force -Path $GradleCache, $BuildTemp | Out-Null
foreach ($required in @(
    "$AndroidSdk\build-tools\36.0.0\apksigner.bat",
    "$AndroidSdk\platforms\android-36\android.jar",
    "$JavaHome\bin\java.exe",
    $GradleCache,
    $BuildTemp
)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing build tool: $required" }
}

$env:ANDROID_HOME = $AndroidSdk
$env:ANDROID_SDK_ROOT = $AndroidSdk
$env:GRADLE_USER_HOME = $GradleCache
$env:JAVA_HOME = $JavaHome
$env:TEMP = $BuildTemp
$env:TMP = $BuildTemp
$env:NODE_ENV = 'production'

Push-Location (Join-Path $projectRoot 'android')
try {
    & .\gradlew.bat assembleRelease --offline --no-daemon --console=plain --max-workers=2 `
        '-Pkotlin.compiler.execution.strategy=in-process' '-PreactNativeArchitectures=arm64-v8a' `
        --init-script (Join-Path $PSScriptRoot 'android-build.init.gradle')
    if ($LASTEXITCODE -ne 0) { throw "Gradle build failed ($LASTEXITCODE)" }
    $apk = Join-Path $projectRoot 'android\app\build\outputs\apk\release\app-release.apk'
    & "$AndroidSdk\build-tools\36.0.0\apksigner.bat" verify $apk
    if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
    Copy-Item -LiteralPath $apk -Destination (Join-Path $projectRoot 'Degan.apk') -Force
    Get-Item -LiteralPath (Join-Path $projectRoot 'Degan.apk') | Select-Object FullName, Length, LastWriteTime
} finally {
    Pop-Location
}
