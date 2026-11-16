Add-Type -AssemblyName System.Drawing

$sourcePath = 'C:\Users\Amoroso\.gemini\antigravity\brain\1a4c4439-2481-4dea-a473-583c3892f284\.user_uploaded\media_1794325678403_04145c3c.png'
$rawBmp = [System.Drawing.Bitmap]::new($sourcePath)

# Find tight non-transparent bounding box of the logo
$minX = $rawBmp.Width
$minY = $rawBmp.Height
$maxX = 0
$maxY = 0

for ($y = 0; $y -lt $rawBmp.Height; $y++) {
    for ($x = 0; $x -lt $rawBmp.Width; $x++) {
        $c = $rawBmp.GetPixel($x, $y)
        if ($c.A -gt 12) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

$cropW = $maxX - $minX + 1
$cropH = $maxY - $minY + 1
$cropRect = New-Object System.Drawing.Rectangle($minX, $minY, $cropW, $cropH)
$src = $rawBmp.Clone($cropRect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$rawBmp.Dispose()

Write-Host "Cropped tight logo bounding box: ${cropW}x${cropH} (from X=$minX..$maxX, Y=$minY..$maxY)"

function Ensure-Dir([string]$path) {
    $dir = [System.IO.Path]::GetDirectoryName($path)
    if (-not [string]::IsNullOrEmpty($dir) -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

function Create-Square-Image([int]$size, [string]$destPath, [bool]$alignBottom = $true) {
    Ensure-Dir $destPath
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    
    # Fill 100% of the available width so the icon is as large as possible
    $w = [int][Math]::Round($size * 0.99)
    $h = [int][Math]::Round($w * ($src.Height / [double]$src.Width))
    if ($h -gt $size) {
        $h = [int][Math]::Round($size * 0.99)
        $w = [int][Math]::Round($h * ($src.Width / [double]$src.Height))
    }

    $x = [int][Math]::Round(($size - $w) / 2.0)
    if ($alignBottom) {
        # Align flush to the bottom edge so the desktop shortcut label sits right below the logo
        $y = $size - $h
    } else {
        $y = [int][Math]::Round(($size - $h) / 2.0)
    }
    
    $g.DrawImage($src, $x, $y, $w, $h)
    $g.Dispose()
    
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated: $destPath ($size x $size, logo=${w}x${h} at x=$x, y=$y)"
}

$sizes = @(16, 24, 32, 48, 64, 128, 256, 512)
foreach ($s in $sizes) {
    Create-Square-Image $s "build\icon_$s.png" $true
}

Create-Square-Image 512 "build\icon.png" $true
Create-Square-Image 512 "public\logo.png" $false
Create-Square-Image 512 "src\renderer\assets\logo.png" $false
Create-Square-Image 64 "public\favicon.png" $false

$src.Dispose()
Write-Host "All square PNG assets generated successfully!"
