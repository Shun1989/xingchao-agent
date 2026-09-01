[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [Parameter(Mandatory = $true)]
  [ValidateSet('midground', 'light')]
  [string]$Role
)

$ErrorActionPreference = 'Stop'
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source
$ffprobe = (Get-Command ffprobe -ErrorAction Stop).Source
$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = [System.IO.Path]::GetDirectoryName($resolvedOutput)

if ([System.IO.Path]::GetExtension($resolvedOutput) -ne '.webp') {
  throw 'OutputPath must use the .webp extension.'
}
if (-not [System.IO.Directory]::Exists($outputDirectory)) {
  throw "Output directory does not exist: $outputDirectory"
}

$inputProbe = & $ffprobe -v error -select_streams 'v:0' -show_entries 'stream=width,height' -of json -- $resolvedInput
if ($LASTEXITCODE -ne 0) { throw "ffprobe failed for input: $resolvedInput" }
$inputStream = ($inputProbe | ConvertFrom-Json).streams[0]
if ($null -eq $inputStream -or $inputStream.width -lt 1 -or $inputStream.height -lt 1) {
  throw 'Input must contain one readable video/image stream.'
}

$filter = 'scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080:exact=1,setsar=1'
$common = @(
  '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
  '-i', $resolvedInput, '-map', '0:v:0', '-frames:v', '1',
  '-vf', $filter, '-map_metadata', '-1', '-an', '-sn', '-dn',
  '-c:v', 'libwebp', '-threads', '1', '-compression_level', '6'
)
$encoding = if ($Role -eq 'light') {
  @('-lossless', '1', '-pix_fmt', 'yuva420p')
} else {
  @('-lossless', '0', '-quality', '92', '-pix_fmt', 'yuv420p')
}

& $ffmpeg @common @encoding -- $resolvedOutput
if ($LASTEXITCODE -ne 0) { throw "ffmpeg conversion failed: $resolvedOutput" }

$outputProbe = & $ffprobe -v error -select_streams 'v:0' -show_entries 'stream=width,height,pix_fmt' -of json -- $resolvedOutput
if ($LASTEXITCODE -ne 0) { throw "ffprobe failed for output: $resolvedOutput" }
$outputStream = ($outputProbe | ConvertFrom-Json).streams[0]
if ($outputStream.width -ne 1920 -or $outputStream.height -ne 1080) {
  throw "Unexpected output dimensions: $($outputStream.width)x$($outputStream.height)"
}
if ($Role -eq 'light' -and $outputStream.pix_fmt -notmatch 'a') {
  throw "Light output lost alpha: $($outputStream.pix_fmt)"
}

$stream = [System.IO.File]::OpenRead($resolvedOutput)
try {
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hash = ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
  } finally {
    $algorithm.Dispose()
  }
} finally {
  $stream.Dispose()
}
[pscustomobject]@{
  input = $resolvedInput
  output = $resolvedOutput
  role = $Role
  inputWidth = [int]$inputStream.width
  inputHeight = [int]$inputStream.height
  width = [int]$outputStream.width
  height = [int]$outputStream.height
  pixelFormat = [string]$outputStream.pix_fmt
  sha256 = $hash
} | ConvertTo-Json -Compress
