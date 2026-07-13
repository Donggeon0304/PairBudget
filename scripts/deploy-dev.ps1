# PairBudget Dev Deploy Script
# GEMINI.md Section 7, 18 준수
# 사용법: run_command로 실행 (백그라운드 태스크로 전환됨 - logcat이 세션 유지)

$ADB = "D:\Android\Sdk\platform-tools\adb.exe"
$PKG = "com.pairbudget.dev"
$ACTIVITY = "com.pairbudget.dev/com.pairbudget.MainActivity"
$LISTENER = "com.pairbudget.dev/com.pairbudget.NotificationService"

# === Step 1: Kill node processes ===
Write-Host "[Step 1] Kill node processes..." -ForegroundColor Yellow
taskkill /F /IM node.exe 2>$null
Start-Sleep -Seconds 1

# === Step 2: ADB init + reverse ===
Write-Host "[Step 2] ADB start-server + reverse..." -ForegroundColor Yellow
& $ADB start-server
& $ADB reverse tcp:8081 tcp:8081
& $ADB reverse --list

# === Step 3: Start Metro (background) ===
Write-Host "[Step 3] Starting Metro in background..." -ForegroundColor Yellow
# NOTE: -WindowStyle Hidden은 AhnLab V3에서 악성코드로 차단됨. Minimized 사용.
$metroProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","cd /d D:\SideProjects\PairBudget && npx react-native start --port 8081" -PassThru -WindowStyle Minimized
Write-Host "  Metro PID: $($metroProcess.Id)" -ForegroundColor DarkGray

# === Step 4: Wait for Metro ready ===
Write-Host "[Step 4] Waiting for Metro..." -ForegroundColor Yellow
$maxWait = 30
$waited = 0
$metroReady = $false
while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 2
    $waited += 2
    $check = $null
    try { $check = Invoke-WebRequest -Uri "http://localhost:8081/status" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop } catch { $check = $null }
    if ($check -and $check.StatusCode -eq 200) {
        $metroReady = $true
        break
    }
    Write-Host "  Waiting... ($waited s)" -ForegroundColor DarkGray
}
if ($metroReady) {
    Write-Host "  Metro ready!" -ForegroundColor Green
} else {
    Write-Host "  Metro timeout (continuing anyway)" -ForegroundColor DarkYellow
}

# === Step 5: Notification listener + app restart ===
Write-Host "[Step 5] Disallow listener..." -ForegroundColor Yellow
& $ADB shell cmd notification disallow_listener $LISTENER
Start-Sleep -Seconds 1

Write-Host "[Step 6] Force stop app..." -ForegroundColor Yellow
& $ADB shell am force-stop $PKG
Start-Sleep -Seconds 2

Write-Host "[Step 7] Allow listener..." -ForegroundColor Yellow
& $ADB shell cmd notification allow_listener $LISTENER

Write-Host "[Step 8] Re-set reverse (safety)..." -ForegroundColor Yellow
& $ADB reverse tcp:8081 tcp:8081

Write-Host "[Step 9] Start app..." -ForegroundColor Yellow
& $ADB shell am start -n $ACTIVITY

Write-Host "[Step 10] Reverse check..." -ForegroundColor Yellow
& $ADB reverse --list

Write-Host ""
Write-Host "=== Deploy complete! ===" -ForegroundColor Green
Write-Host "Keeping ADB session alive with logcat..." -ForegroundColor DarkGray
Write-Host ""

# logcat keeps this process alive -> ADB daemon alive -> reverse alive
& $ADB logcat -s ReactNativeJS
