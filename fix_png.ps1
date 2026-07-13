Add-Type -AssemblyName System.Drawing
$path = "D:\SideProjects\PairBudget\src\assets\images\logo.png"
$img = [System.Drawing.Image]::FromFile($path)
$bitmap = New-Object System.Drawing.Bitmap($img.Width, $img.Height)
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.DrawImage($img, 0, 0, $img.Width, $img.Height)
$img.Dispose()
$g.Dispose()
$bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
Write-Host "PNG Fixed!"
