# One-click build: wheel -> conda-pack -> Tauri binary -> NSIS .exe
# Requires: conda, node/npm, Rust/cargo, NSIS (makensis) on PATH.

$ErrorActionPreference = "Stop"
$RepoRoot = (Get-Item $PSScriptRoot).Parent.Parent.FullName
Set-Location $RepoRoot
Write-Host "[build_win] REPO_ROOT=$RepoRoot"
$PackDir = $PSScriptRoot
$Dist = if ($env:DIST) { $env:DIST } else { "dist" }
$Archive = Join-Path $Dist "sealclaw-env.zip"
$Unpacked = Join-Path $Dist "win-unpacked"
$NsiPath = Join-Path $PackDir "sealclaw_desktop.nsi"

# Packages affected by conda-unpack bug on Windows (conda-pack Issue #154)
# conda-unpack corrupts Python string escaping when replacing path prefixes.
# Example: "\\\\?\\" (correct) -> "\\" (SyntaxError)
# Solution: Reinstall these packages after conda-unpack to restore correct files.
# See: issue.md, scripts/pack/WINDOWS_FIX.md
$CondaUnpackAffectedPackages = @(
  "huggingface_hub"  # Uses Windows extended-length path prefix (\\?\)
)

New-Item -ItemType Directory -Force -Path $Dist | Out-Null

Write-Host "== Building wheel (includes console frontend) =="
# Skip wheel_build if dist already has a wheel for current version
$VersionFile = Join-Path $RepoRoot "src\sealclaw\__version__.py"
$CurrentVersion = ""
if (Test-Path $VersionFile) {
  $m = (Get-Content $VersionFile -Raw) -match '__version__\s*=\s*"([^"]+)"'
  if ($m) { $CurrentVersion = $Matches[1] }
}
$RunWheelBuild = $true
if ($CurrentVersion) {
  $wheelGlob = Join-Path $Dist "sealclaw-$CurrentVersion-*.whl"
  $existingWheels = Get-ChildItem -Path $wheelGlob -ErrorAction SilentlyContinue
  if ($existingWheels.Count -gt 0) {
    Write-Host "dist/ already has wheel for version $CurrentVersion, skipping."
    $RunWheelBuild = $false
  } else {
    # Clean up old wheels to avoid confusion
    $oldWheels = Get-ChildItem -Path (Join-Path $Dist "sealclaw-*.whl") -ErrorAction SilentlyContinue
    if ($oldWheels.Count -gt 0) {
      Write-Host "Removing old wheel files: $($oldWheels | ForEach-Object { $_.Name })"
      $oldWheels | Remove-Item -Force
    }
  }
}
if ($RunWheelBuild) {
  $WheelBuildScript = Join-Path $RepoRoot "scripts\wheel_build.ps1"
  if (-not (Test-Path $WheelBuildScript)) {
    throw "wheel_build.ps1 not found: $WheelBuildScript"
  }
  & $WheelBuildScript
  if ($LASTEXITCODE -ne 0) { throw "wheel_build.ps1 failed with exit code $LASTEXITCODE" }
}

Write-Host "== Building conda-packed env =="
& python $PackDir\build_common.py --output $Archive --format zip --cache-wheels --extras "ollama"
if ($LASTEXITCODE -ne 0) {
  throw "build_common.py failed with exit code $LASTEXITCODE"
}
if (-not (Test-Path $Archive)) {
  throw "Archive not created: $Archive"
}

Write-Host "== Syncing desktop version metadata =="
$DesktopVersion = (& python (Join-Path $RepoRoot "scripts\sync_desktop_version.py") --sync --field desktop).Trim()
if (-not $DesktopVersion) {
  throw "Failed to resolve desktop version from sync_desktop_version.py"
}

Write-Host "== Unpacking env =="
if (Test-Path $Unpacked) { Remove-Item -Recurse -Force $Unpacked }
Expand-Archive -Path $Archive -DestinationPath $Unpacked -Force
$unpackedRoot = Get-ChildItem -Path $Unpacked -ErrorAction SilentlyContinue | Measure-Object
Write-Host "[build_win] Unpacked entries in $Unpacked : $($unpackedRoot.Count)"

# Resolve env root: conda-pack usually puts python.exe at archive root; allow one nested dir.
$EnvRoot = $Unpacked
if (-not (Test-Path (Join-Path $EnvRoot "python.exe"))) {
  $found = Get-ChildItem -Path $Unpacked -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName "python.exe") } |
    Select-Object -First 1
  if ($found) { $EnvRoot = $found.FullName; Write-Host "[build_win] Env root: $EnvRoot" }
}
if (-not (Test-Path (Join-Path $EnvRoot "python.exe"))) {
  throw "python.exe not found in unpacked env (checked $Unpacked and one level down)."
}
if (-not [System.IO.Path]::IsPathRooted($EnvRoot)) {
  $EnvRoot = Join-Path $RepoRoot $EnvRoot
}
Write-Host "[build_win] python.exe found at env root: $EnvRoot"

# Rewrite prefix in packed env so paths point to current location (required after move).
$CondaUnpack = Join-Path $EnvRoot "Scripts\conda-unpack.exe"
if (Test-Path $CondaUnpack) {
  Write-Host "[build_win] Running conda-unpack..."
  & $CondaUnpack
  if ($LASTEXITCODE -ne 0) { throw "conda-unpack failed with exit code $LASTEXITCODE" }
  
  # Fix conda-unpack bug: it corrupts Python string escaping on Windows
  # See: issue.md and https://github.com/conda/conda-pack/issues/154
  # Solution: Reinstall affected packages using cached wheels
  Write-Host "[build_win] Fixing conda-unpack corruption by reinstalling affected packages..."
  $WheelsCache = Join-Path $RepoRoot ".cache\conda_unpack_wheels"
  if (Test-Path $WheelsCache) {
    $pythonExe = Join-Path $EnvRoot "python.exe"
    
    foreach ($pkg in $CondaUnpackAffectedPackages) {
      Write-Host "  Reinstalling $pkg..."
      & $pythonExe -m pip install --force-reinstall --no-deps `
        --find-links $WheelsCache --no-index $pkg
      if ($LASTEXITCODE -ne 0) {
        Write-Host "  WARN: Failed to reinstall $pkg (exit code: $LASTEXITCODE)" -ForegroundColor Yellow
      }
    }
    
    # Verify the fix worked
    Write-Host "[build_win] Verifying fix..."
    & $pythonExe -c "from huggingface_hub import file_download; print('✓ huggingface_hub import OK')"
    if ($LASTEXITCODE -ne 0) {
      throw "CRITICAL: huggingface_hub still has import errors after reinstall. See issue.md"
    }
    Write-Host "[build_win] ✓ conda-unpack corruption fixed successfully."
  } else {
    Write-Host "[build_win] WARN: wheels_cache not found at $WheelsCache" -ForegroundColor Yellow
    Write-Host "[build_win] WARN: Cannot fix conda-unpack corruption. App may fail to start." -ForegroundColor Yellow
  }
} else {
  Write-Host "[build_win] WARN: conda-unpack.exe not found at $CondaUnpack, skipping."
}

Write-Host "== Pre-compiling Python bytecode for faster startup =="
$pythonExe = Join-Path $EnvRoot "python.exe"
if (Test-Path $pythonExe) {
  Write-Host "[build_win] Compiling all .py files to .pyc..."
  $compileStart = Get-Date
  
  # Compile all Python files to bytecode
  # -q: quiet mode (only show errors)
  # -j 0: use all CPU cores for parallel compilation
  & $pythonExe -m compileall -q -j 0 $EnvRoot
  
  if ($LASTEXITCODE -eq 0) {
    $compileEnd = Get-Date
    $compileTime = ($compileEnd - $compileStart).TotalSeconds
    Write-Host "[build_win] ✓ Bytecode compilation completed in $($compileTime.ToString('F1')) seconds"
    
    # Count compiled files for reporting
    $pycCount = (Get-ChildItem -Path $EnvRoot -Recurse -Filter "*.pyc" -ErrorAction SilentlyContinue | Measure-Object).Count
    Write-Host "[build_win] Generated $pycCount .pyc files (these will be included in installer)"
  } else {
    Write-Host "[build_win] WARN: Bytecode compilation had some errors (exit code: $LASTEXITCODE)" -ForegroundColor Yellow
    Write-Host "[build_win] This is usually not critical - app will compile on first run" -ForegroundColor Yellow
  }
} else {
  Write-Host "[build_win] WARN: python.exe not found at $pythonExe, skipping bytecode compilation" -ForegroundColor Yellow
}

# 编译 Tauri 二进制（custom-protocol 会将前端编译进二进制）
$DesktopClientDir = Join-Path (Split-Path $RepoRoot -Parent) "desktop-client"
Write-Host "== Building Tauri binary =="
Push-Location $DesktopClientDir
Push-Location (Join-Path $DesktopClientDir "src-tauri")
& cargo build --release
if ($LASTEXITCODE -ne 0) { throw "cargo build failed" }
Pop-Location
Pop-Location

# 将 Tauri 二进制复制到 env root（替代 VBS/BAT 启动器）
$TauriBin = Join-Path $DesktopClientDir "src-tauri\target\release\sealclaw-desktop.exe"
if (-not (Test-Path $TauriBin)) {
  throw "Tauri binary not found at $TauriBin"
}
$TauriDest = Join-Path $EnvRoot "SealClaw Desktop.exe"
Copy-Item $TauriBin -Destination $TauriDest -Force
Write-Host "[build_win] Copied Tauri binary to $TauriDest"

# 将 conda-pack 环境移到 exe 同级的 env/ 子目录
# Tauri runtime.rs 会检测 <exe_dir>/env/python.exe
$EnvSubDir = Join-Path $EnvRoot "env"
if (-not (Test-Path $EnvSubDir)) {
  # 创建 env 子目录并移动 Python 环境内容
  # 注意：python.exe 当前在 $EnvRoot 根目录，需要重组结构
  # 实际上 NSIS 安装后 $INSTDIR 就是 env root，Tauri exe 和 python.exe 在同一目录
  # 所以 runtime.rs 中 Windows 路径应该直接是 <exe_dir>/python.exe
  Write-Host "[build_win] Python env and Tauri binary are in the same directory: $EnvRoot"
}

# Copy icon.ico to env root so NSIS can find it
$IconSrc = Join-Path $PackDir "assets\icon.ico"
if (Test-Path $IconSrc) {
  Copy-Item $IconSrc -Destination $EnvRoot -Force
  Write-Host "[build_win] Copied icon.ico to env root"
} else {
  Write-Host "[build_win] WARN: icon.ico not found at $IconSrc"
}

# Remove test and benchmark assets that are not needed at runtime and can exceed
# Windows/NSIS path handling limits during recursive packaging.
$PrunePaths = @(
  "Lib\site-packages\litellm\proxy\guardrails\guardrail_hooks\litellm_content_filter\guardrail_benchmarks",
  "Lib\site-packages\win32\test",
  "Lib\site-packages\docker\tests",
  "Lib\site-packages\pip\_vendor\distlib\tests"
)

Write-Host "== Pruning non-runtime files before NSIS packaging =="
foreach ($relativePath in $PrunePaths) {
  $fullPath = Join-Path $EnvRoot $relativePath
  if (Test-Path $fullPath) {
    Remove-Item -Recurse -Force $fullPath
    Write-Host "[build_win] Removed $fullPath"
  }
}

Write-Host "== Building NSIS installer =="

# Debug: Print EnvRoot directory contents
Write-Host "=== EnvRoot=$EnvRoot ==="
Write-Host "=== EnvRoot top files ==="
Get-ChildItem -LiteralPath $EnvRoot -Force | Select-Object -First 50 | ForEach-Object { Write-Host $_.FullName }

# Use the semver-compatible desktop version synced into Tauri/Cargo metadata.
$Version = $DesktopVersion
Write-Host "[build_win] Version determined: $Version"
Write-Host "[build_win] SEALCLAW_VERSION=$Version OUTPUT_EXE will be under $Dist"
$OutInstaller = Join-Path (Join-Path $RepoRoot $Dist) "SealClaw-Setup-$Version.exe"
# Pass absolute paths to NSIS (keep backslashes).
$UnpackedFull = (Resolve-Path $EnvRoot).Path
$OutputExeNsi = [System.IO.Path]::GetFullPath($OutInstaller)
$nsiArgs = @(
  "/DSEALCLAW_VERSION=$Version",
  "/DOUTPUT_EXE=$OutputExeNsi",
  "/DUNPACKED=$UnpackedFull",
  $NsiPath
)

# Debug: Check if makensis is available
Write-Host "=== Checking makensis availability ==="
try {
  $makensisPath = (Get-Command makensis -ErrorAction Stop).Source
  Write-Host "[build_win] makensis found at: $makensisPath"
} catch {
  throw "makensis not found in PATH. Please install NSIS and ensure makensis.exe is in PATH."
}

Write-Host "[build_win] Running: makensis $($nsiArgs -join ' ')"
Write-Host "=== NSIS will compile from: $NsiPath ==="
Write-Host "=== NSIS unpacked source: $UnpackedFull ==="
Write-Host "=== NSIS output installer: $OutputExeNsi ==="
$nsisOutput = & makensis @nsiArgs 2>&1 | Out-String
Write-Host "=== NSIS Output Begin ==="
Write-Host $nsisOutput
Write-Host "=== NSIS Output End ==="
$makensisExit = $LASTEXITCODE
Write-Host "[build_win] makensis exit code: $makensisExit"
if ($makensisExit -ne 0) {
  Write-Host "ERROR: makensis compilation failed!"
  Write-Host "Check the NSIS output above for specific errors."
  throw "makensis failed with exit code $makensisExit"
}
if (-not (Test-Path $OutInstaller)) {
  throw "NSIS did not create installer: $OutInstaller"
}
Write-Host "== Built $OutInstaller =="
