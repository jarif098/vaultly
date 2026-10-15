Add-Type -AssemblyName System.Drawing

$srcPath = "F:\useless_codes\pass_saver_pc\assets\icons\app-logo.png"
$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)

$minX = $bmp.Width
$maxX = 0

for ($y = 270; $y -lt 630; $y += 4) {
    for ($x = 0; $x -lt $bmp.Width; $x += 4) {
        $p = $bmp.GetPixel($x, $y)
        if ($p.R -lt 240 -or $p.G -lt 240 -or $p.B -lt 240) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
        }
    }
}

Write-Output "Character Body X range: [$minX, $maxX], width=$($maxX - $minX)"
$bmp.Dispose()
