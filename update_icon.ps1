$sourceImage = "C:\Users\rodzl\.gemini\antigravity\brain\74d46086-d412-4390-9218-8cb4d099dbca\modu_icon_simple_book_1782198986797.png"
$resDir = "D:\SideProjects\PairBudget\android\app\src\main\res"

Add-Type -AssemblyName System.Drawing

function Resize-Image {
    param($src, $dest, $size)
    $img = [System.Drawing.Image]::FromFile($src)
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $size, $size)
    $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    $img.Dispose()
}

Resize-Image $sourceImage "$resDir\mipmap-mdpi\ic_launcher.png" 48
Resize-Image $sourceImage "$resDir\mipmap-mdpi\ic_launcher_round.png" 48
Resize-Image $sourceImage "$resDir\mipmap-hdpi\ic_launcher.png" 72
Resize-Image $sourceImage "$resDir\mipmap-hdpi\ic_launcher_round.png" 72
Resize-Image $sourceImage "$resDir\mipmap-xhdpi\ic_launcher.png" 96
Resize-Image $sourceImage "$resDir\mipmap-xhdpi\ic_launcher_round.png" 96
Resize-Image $sourceImage "$resDir\mipmap-xxhdpi\ic_launcher.png" 144
Resize-Image $sourceImage "$resDir\mipmap-xxhdpi\ic_launcher_round.png" 144
Resize-Image $sourceImage "$resDir\mipmap-xxxhdpi\ic_launcher.png" 192
Resize-Image $sourceImage "$resDir\mipmap-xxxhdpi\ic_launcher_round.png" 192

Write-Output "아이콘 생성 및 복사 완료!"
