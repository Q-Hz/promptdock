Add-Type -AssemblyName System.Drawing
$src = "D:\公司\提示词.png"
$dir = "D:\公司\PromptDock\PromptDock - 副本\promptdock-app\src-tauri\icons"
New-Item -ItemType Directory -Force $dir | Out-Null
$img = [System.Drawing.Image]::FromFile($src)

$bmp = New-Object System.Drawing.Bitmap(256,256)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$side = [Math]::Max($img.Width, $img.Height)
$scale = 256.0 / $side
$w = [int]($img.Width * $scale)
$h = [int]($img.Height * $scale)
$x = [int]((256 - $w) / 2)
$y = [int]((256 - $h) / 2)
$g.DrawImage($img, $x, $y, $w, $h)
$g.Dispose()

$bmp.Save("$dir\icon.png",[System.Drawing.Imaging.ImageFormat]::Png)
foreach($s in 32,128){
  $b = New-Object System.Drawing.Bitmap($bmp,$s,$s)
  $b.Save("$dir\${s}x${s}.png",[System.Drawing.Imaging.ImageFormat]::Png)
  $b.Dispose()
}
$icon32 = New-Object System.Drawing.Bitmap($bmp,32,32)
$ico = [System.Drawing.Icon]::FromHandle($icon32.GetHicon())
$fs = [System.IO.File]::Create("$dir\icon.ico")
$ico.Save($fs)
$fs.Close()
$img.Dispose()
Write-Output "icons replaced OK"
