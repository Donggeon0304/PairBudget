Add-Type -AssemblyName System.Drawing

$basePath = "D:\SideProjects\PairBudget\android\app\src\main\res"
$greenColor = [System.Drawing.Color]::FromArgb(255, 76, 175, 80)  # #4CAF50

$folders = @("mipmap-mdpi", "mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi")

foreach ($folder in $folders) {
    $iconPath = Join-Path $basePath "$folder\ic_launcher.png"
    if (-not (Test-Path $iconPath)) { continue }

    $srcIcon = [System.Drawing.Bitmap]::new($iconPath)
    $w = $srcIcon.Width
    $h = $srcIcon.Height

    # 초록 배경으로 채운 새 이미지 생성
    $newBitmap = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($newBitmap)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.Clear($greenColor)  # 전체를 초록으로 채움
    $g.DrawImage($srcIcon, 0, 0, $w, $h)  # 기존 아이콘을 위에 그림
    $g.Dispose()
    $srcIcon.Dispose()

    # ic_launcher.png 덮어쓰기
    $newBitmap.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)

    # ic_launcher_round.png도 동일하게
    $roundPath = Join-Path $basePath "$folder\ic_launcher_round.png"
    $newBitmap.Save($roundPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $newBitmap.Dispose()

    Write-Host "Fixed: $folder ($w x $h) - transparent -> green"
}

# Foreground도 동일하게 (초록 캔버스 + 아이콘)
$fgSizes = @{
    "mipmap-mdpi" = @{ fg = 108; src = "mipmap-mdpi" }
    "mipmap-hdpi" = @{ fg = 162; src = "mipmap-hdpi" }
    "mipmap-xhdpi" = @{ fg = 216; src = "mipmap-xhdpi" }
    "mipmap-xxhdpi" = @{ fg = 324; src = "mipmap-xxhdpi" }
    "mipmap-xxxhdpi" = @{ fg = 432; src = "mipmap-xxxhdpi" }
}

foreach ($folder in $fgSizes.Keys) {
    $fgSize = $fgSizes[$folder].fg
    $srcFolder = $fgSizes[$folder].src
    $srcIconPath = Join-Path $basePath "$srcFolder\ic_launcher.png"
    $destFile = Join-Path $basePath "$folder\ic_launcher_foreground.png"

    $srcIcon = [System.Drawing.Image]::FromFile($srcIconPath)
    $srcW = $srcIcon.Width
    $srcH = $srcIcon.Height

    $bitmap = New-Object System.Drawing.Bitmap($fgSize, $fgSize)
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear($greenColor)

    # 아이콘을 중앙에 약간 크게 배치 (safe zone 72% 내)
    $iconDrawSize = [math]::Floor($fgSize * 0.65)
    $offset = [math]::Floor(($fgSize - $iconDrawSize) / 2)
    $g.DrawImage($srcIcon, $offset, $offset, $iconDrawSize, $iconDrawSize)

    $g.Dispose()
    $srcIcon.Dispose()
    $bitmap.Save($destFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    Write-Host "Foreground: $folder ($fgSize x $fgSize)"
}

Write-Host "All icons fixed!"
