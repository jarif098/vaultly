Add-Type -AssemblyName System.Drawing

$srcPath = "F:\useless_codes\pass_saver_pc\assets\icons\app-logo.png"
$src = [System.Drawing.Bitmap]::FromFile($srcPath)

# Variation 1: Full circle centered at (512, 490), radius = 480
$size = 1024
$out1 = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g1 = [System.Drawing.Graphics]::FromImage($out1)
$g1.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g1.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g1.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g1.Clear([System.Drawing.Color]::Transparent)

$path1 = New-Object System.Drawing.Drawing2D.GraphicsPath
# Circle bounds
$cx = 512
$cy = 490
$radius = 470
$path1.AddEllipse($cx - $radius, $cy - $radius, $radius * 2, $radius * 2)

$g1.SetClip($path1)
# Draw original image shifted so (512, 490) is at center
$g1.DrawImage($src, [float]0, [float](490 - 484), [float]$size, [float]$size)
$g1.ResetClip()

# Save variation 1
$out1.Save("F:\useless_codes\pass_saver_pc\assets\icons\test-circle-1.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g1.Dispose()
$out1.Dispose()

# Variation 2: Tighter circular crop centered on character (radius = 360, scaled to 1024)
$out2 = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g2 = [System.Drawing.Graphics]::FromImage($out2)
$g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g2.Clear([System.Drawing.Color]::Transparent)

$path2 = New-Object System.Drawing.Drawing2D.GraphicsPath
$path2.AddEllipse(20, 20, 984, 984)
$g2.SetClip($path2)

# Fill circle background with #FBFBFB
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 251, 251, 251))
$g2.FillPath($bgBrush, $path2)
$bgBrush.Dispose()

# Crop region from src: center (514, 484), size ~ 660x660
$srcCrop = New-Object System.Drawing.Rectangle(184, 154, 660, 660)
$destRect = New-Object System.Drawing.Rectangle(40, 40, 944, 944)
$g2.DrawImage($src, $destRect, $srcCrop, [System.Drawing.GraphicsUnit]::Pixel)
$g2.ResetClip()

$out2.Save("F:\useless_codes\pass_saver_pc\assets\icons\test-circle-2.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g2.Dispose()
$out2.Dispose()

$src.Dispose()
Write-Output "Generated test-circle-1.png and test-circle-2.png"
