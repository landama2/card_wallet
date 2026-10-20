# Draws public/icon-192.png and public/icon-512.png (the app icon). Run from web/:
#   powershell -ExecutionPolicy Bypass -File scripts/make-icon.ps1 -OutDir public
param([string]$OutDir)
Add-Type -AssemblyName System.Drawing

function RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Draw([int]$size, [string]$path) {
  $s = $size / 512.0   # design on a 512 grid
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#1f4fd1'))

  # Back card: lighter blue, tilted. Everything stays inside the maskable safe circle (r = 205).
  $g.TranslateTransform(256 * $s, 236 * $s)
  $g.RotateTransform(-12)
  $back = RoundRect (-128 * $s) (-80 * $s) (256 * $s) (160 * $s) (22 * $s)
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#8fa9f0'))), $back)
  $g.ResetTransform()

  # Front card: white with an accent header strip and barcode bars.
  $fx = 128 * $s; $fy = 206 * $s; $fw = 256 * $s; $fh = 160 * $s
  $shadow = RoundRect $fx ($fy + 8 * $s) $fw $fh (22 * $s)
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(60, 10, 30, 90))), $shadow)
  $front = RoundRect $fx $fy $fw $fh (22 * $s)
  $g.FillPath([System.Drawing.Brushes]::White, $front)
  $g.SetClip($front)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#1f4fd1'))), $fx, $fy, $fw, (34 * $s))
  $g.ResetClip()
  $ink = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#14161a'))
  $x = 156.0
  foreach ($w in 6, 3, 9, 3, 6, 12, 3, 6, 3, 9, 6, 3, 12, 3, 6, 9, 3, 6) {
    $g.FillRectangle($ink, ($x * $s), (262 * $s), ($w * $s), (78 * $s))
    $x += $w + 5
  }

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Draw 192 (Join-Path $OutDir 'icon-192.png')
Draw 512 (Join-Path $OutDir 'icon-512.png')
"done"
