Add-Type -AssemblyName System.Drawing

$srcPath = "F:\useless_codes\pass_saver_pc\assets\icons\app-logo.png"
$src = [System.Drawing.Bitmap]::FromFile($srcPath)

function Generate-RoundLogo($targetSize, $outPath) {
    $bmp = New-Object System.Drawing.Bitmap($targetSize, $targetSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # Inset by 2% for smooth anti-aliased outer edge
    $inset = [float]($targetSize * 0.015)
    $diam = [float]($targetSize - 2 * $inset)

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse($inset, $inset, $diam, $diam)

    # Fill circular background with #FBFBFB
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 251, 251, 251))
    $g.FillPath($bgBrush, $path)
    $bgBrush.Dispose()

    # Set clip to circle
    $g.SetClip($path)

    # Crop rectangle from original 1024x1024: center at (520, 484), size 660x660
    $cropSize = 660
    $cropX = 520 - ($cropSize / 2) # 190
    $cropY = 484 - ($cropSize / 2) # 154
    $srcRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropSize, $cropSize)

    $destRect = New-Object System.Drawing.RectangleF($inset, $inset, $diam, $diam)
    $g.DrawImage($src, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

    $g.ResetClip()

    # Draw anti-aliased smooth edge ring to eliminate any fringe
    $edgePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 251, 251, 251), [float]($targetSize * 0.01))
    $g.DrawEllipse($edgePen, $inset, $inset, $diam, $diam)
    $edgePen.Dispose()

    $path.Dispose()
    $g.Dispose()

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Generated $outPath ($targetSize x $targetSize)"
}

# 1024x1024 Master Round Logo
Generate-RoundLogo 1024 "F:\useless_codes\pass_saver_pc\assets\icons\app-logo-round.png"

# 256x256 App Icon PNG
Generate-RoundLogo 256 "F:\useless_codes\pass_saver_pc\assets\icons\app-icon.png"

$src.Dispose()
