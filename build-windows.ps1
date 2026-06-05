[CmdletBinding()]
param(
    [string]$Version = "local",
    [ValidateSet("amd64", "arm64", "386")]
    [string]$Arch = "amd64",
    [string]$Output = ".\dist\agent-usage.exe",
    [switch]$SkipTests,
    [string]$GoProxy = "https://goproxy.cn,direct"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RepoRoot

$OutputPath = if ([System.IO.Path]::IsPathRooted($Output)) {
    $Output
} else {
    Join-Path $RepoRoot $Output
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)

$OutputDir = Split-Path -Parent $OutputPath
$GoCache = Join-Path $RepoRoot ".gocache"
$GoModCache = Join-Path $RepoRoot ".gomodcache"

New-Item -ItemType Directory -Force $OutputDir, $GoCache, $GoModCache | Out-Null

$env:CGO_ENABLED = "0"
$env:GOPROXY = $GoProxy
$env:GOCACHE = $GoCache
$env:GOMODCACHE = $GoModCache

try {
    $Commit = (git rev-parse --short HEAD 2>$null).Trim()
} catch {
    $Commit = ""
}

if ([string]::IsNullOrWhiteSpace($Commit)) {
    $Commit = "none"
}

$BuildDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$LdFlags = "-s -w -X main.version=$Version -X main.commit=$Commit -X main.date=$BuildDate"

Write-Host "Using GOPROXY=$env:GOPROXY"
Write-Host "Target: windows/$Arch"
Write-Host "Output: $OutputPath"

go version
go mod download

if (-not $SkipTests) {
    Remove-Item Env:GOOS -ErrorAction SilentlyContinue
    Remove-Item Env:GOARCH -ErrorAction SilentlyContinue
    go test ./...
}

$env:GOOS = "windows"
$env:GOARCH = $Arch
go build -trimpath -ldflags $LdFlags -o $OutputPath .

Write-Host "Built: $OutputPath"
$HostIsWindows = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)
$HostArch = switch ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture) {
    "X64" { "amd64" }
    "Arm64" { "arm64" }
    "X86" { "386" }
    default { "" }
}

if ($HostIsWindows -and $HostArch -eq $Arch) {
    & $OutputPath version
} else {
    $HostTarget = if ($HostArch) { "$HostArch" } else { "unknown-arch" }
    Write-Host "Skipping version check: built target windows/$Arch cannot be executed on this host ($([System.Runtime.InteropServices.RuntimeInformation]::OSDescription)/$HostTarget)."
}
