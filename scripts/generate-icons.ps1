Add-Type -AssemblyName System.Drawing

function Resize-Image($src, $dest, $width, $height) {
    $srcImg = [System.Drawing.Image]::FromFile($src)
    $newImg = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($newImg)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($srcImg, 0, 0, $width, $height)
    $srcImg.Dispose()
    $g.Dispose()
    $newImg.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $newImg.Dispose()
}

$root = $PSScriptRoot + "\.."

# 1. Generate exact Play Store 512x512 icon
Resize-Image "$root\playstore\assets\app_icon_512.png" "$root\playstore\assets\app_icon_playstore_512.png" 512 512
Write-Output "Generated Play Store 512x512 icon"

# 2. Generate exact Play Store 1024x500 feature graphic
Resize-Image "$root\playstore\assets\feature_graphic.png" "$root\playstore\assets\feature_graphic_playstore_1024x500.png" 1024 500
Write-Output "Generated Play Store 1024x500 feature graphic"

# 3. Generate Android mipmap icons
$sizes = @{
    "$root\android\app\src\main\res\mipmap-mdpi" = 48
    "$root\android\app\src\main\res\mipmap-hdpi" = 72
    "$root\android\app\src\main\res\mipmap-xhdpi" = 96
    "$root\android\app\src\main\res\mipmap-xxhdpi" = 144
    "$root\android\app\src\main\res\mipmap-xxxhdpi" = 192
}

foreach ($dir in $sizes.Keys) {
    $size = $sizes[$dir]
    Resize-Image "$root\playstore\assets\app_icon_512.png" "$dir\ic_launcher.png" $size $size
    Resize-Image "$root\playstore\assets\app_icon_512.png" "$dir\ic_launcher_round.png" $size $size
    Resize-Image "$root\playstore\assets\app_icon_512.png" "$dir\ic_launcher_foreground.png" $size $size
    Write-Output "Generated icons for $dir at ${size}x${size}"
}
