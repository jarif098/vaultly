Add-Type -AssemblyName System.Drawing

$srcPath = "assets\icons\app-logo-round.png"
if (-not (Test-Path $srcPath)) {
    $srcPath = "assets\icons\app-icon.png"
}

$destIcoPath = "assets\icons\app-icon.ico"
$destPngPath = "assets\icons\app-icon.png"

$srcBmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path $srcPath).Path)

# Standard Windows icon sizes
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngStreams = @()

foreach ($size in $sizes) {
    $resized = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($resized)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $g.DrawImage($srcBmp, 0, 0, $size, $size)
    $g.Dispose()

    if ($size -eq 256) {
        $resized.Save((Resolve-Path .).Path + "\" + $destPngPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }

    $ms = New-Object System.IO.MemoryStream
    $resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $resized.Dispose()
    $pngStreams += ,@($size, $ms.ToArray())
    $ms.Dispose()
}

$srcBmp.Dispose()

# Build Multi-Resolution ICO File
# Header: 6 bytes (Reserved 2, Type 2 (1=ico), Count 2)
# Directory entries: 16 bytes each
# Followed by PNG payload for each size
$icoMs = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($icoMs)

$bw.Write([uint16]0) # Reserved
$bw.Write([uint16]1) # Type: ICO
$bw.Write([uint16]$pngStreams.Count) # Image count

$offset = 6 + ($pngStreams.Count * 16)

for ($i = 0; $i -lt $pngStreams.Count; $i++) {
    $size = $pngStreams[$i][0]
    $bytes = $pngStreams[$i][1]

    $w = if ($size -ge 256) { [byte]0 } else { [byte]$size }
    $h = if ($size -ge 256) { [byte]0 } else { [byte]$size }

    $bw.Write($w) # Width
    $bw.Write($h) # Height
    $bw.Write([byte]0) # Color count
    $bw.Write([byte]0) # Reserved
    $bw.Write([uint16]1) # Planes
    $bw.Write([uint16]32) # Bit count
    $bw.Write([uint32]$bytes.Length) # Image bytes length
    $bw.Write([uint32]$offset) # Image data offset

    $offset += $bytes.Length
}

for ($i = 0; $i -lt $pngStreams.Count; $i++) {
    $bytes = $pngStreams[$i][1]
    $bw.Write($bytes)
}

$bw.Flush()
[System.IO.File]::WriteAllBytes((Resolve-Path .).Path + "\" + $destIcoPath, $icoMs.ToArray())
$bw.Dispose()
$icoMs.Dispose()

Write-Output "Successfully generated multi-resolution ICO with $($sizes.Count) sizes at $destIcoPath"
