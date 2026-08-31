param(
  [Parameter(Mandatory = $true)]
  [long]$ReleaseId,

  [Parameter(Mandatory = $true)]
  [string]$Repository,

  [Parameter(Mandatory = $true)]
  [string]$Tag,

  [Parameter(Mandatory = $true)]
  [ValidateSet("draft", "published")]
  [string]$ExpectedState,

  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory,

  [string]$ExpectedAssetDirectory = ""
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

# Resolve by immutable numeric id so a same-tag draft or stale name cannot be
# substituted between upload, verification, and publication.
if ($ReleaseId -le 0) { throw "Invalid release id: $ReleaseId" }
if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw "Invalid repository: $Repository" }
if ($Tag -notmatch '^v\d+\.\d+\.\d+(?:-rc\.\d+)?$') { throw "Invalid release tag: $Tag" }
if ([string]::IsNullOrWhiteSpace($env:GH_TOKEN)) { throw "GH_TOKEN is required" }

$release = gh api "repos/$Repository/releases/$ReleaseId" | ConvertFrom-Json
if ($release.tag_name -ne $Tag) {
  throw "Release $ReleaseId belongs to $($release.tag_name), expected $Tag."
}
if ($ExpectedState -eq "draft" -and -not $release.draft) {
  throw "Release $ReleaseId is already published; expected a draft."
}
if ($ExpectedState -eq "published" -and $release.draft) {
  throw "Release $ReleaseId is still a draft; expected a published release."
}
$expectsPrerelease = $Tag -match '-rc\.[0-9]+$'
if ([bool]$release.prerelease -ne $expectsPrerelease) {
  throw "Release $ReleaseId prerelease state does not match tag $Tag."
}

$version = $Tag -replace '^v', '' -replace '-rc\.[0-9]+$', ''
$expectedAssetNames = @(
  "Lyrics.Card.Generator.Setup.$version.exe",
  "lyrics-card-generator-$version.spdx.json",
  "SHA256SUMS"
) | Sort-Object

# Refuse to mix newly downloaded evidence with files from a previous run.
if (Test-Path -LiteralPath $OutputDirectory) {
  $existing = @(Get-ChildItem -LiteralPath $OutputDirectory -Force)
  if ($existing.Count -gt 0) { throw "Verification output directory is not empty: $OutputDirectory" }
} else {
  New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
}

$headers = @{
  Authorization = "Bearer $env:GH_TOKEN"
  Accept = "application/octet-stream"
  "X-GitHub-Api-Version" = "2022-11-28"
}

@($release.assets) | ForEach-Object {
  $asset = $_
  if ([IO.Path]::GetFileName($asset.name) -ne $asset.name) {
    throw "Unsafe release asset name: $($asset.name)"
  }
  Invoke-WebRequest -Uri $asset.url -Headers $headers -OutFile (Join-Path $OutputDirectory $asset.name)
}

# Exact set equality rejects both missing deliverables and unexpected extras.
$assets = @(Get-ChildItem -LiteralPath $OutputDirectory -File)
$actualNames = @($assets.Name | Sort-Object)
if (($actualNames -join "`n") -ne ($expectedAssetNames -join "`n")) {
  throw "Unexpected release asset set: $($actualNames -join ', ')"
}
if (-not [string]::IsNullOrWhiteSpace($ExpectedAssetDirectory)) {
  if (-not (Test-Path -LiteralPath $ExpectedAssetDirectory -PathType Container)) {
    throw "Expected asset directory does not exist: $ExpectedAssetDirectory"
  }
  $expectedAssets = @(Get-ChildItem -LiteralPath $ExpectedAssetDirectory -File)
  $expectedNames = @($expectedAssets.Name | Sort-Object)
  if (($expectedNames -join "`n") -ne ($actualNames -join "`n")) {
    throw "Draft asset names do not match the tested bundle: $($expectedNames -join ', ')"
  }
  $assets | ForEach-Object {
    $expectedPath = Join-Path $ExpectedAssetDirectory $_.Name
    $expectedDigest = (Get-FileHash -LiteralPath $expectedPath -Algorithm SHA256).Hash
    $actualDigest = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    if ($actualDigest -ne $expectedDigest) {
      throw "Draft asset does not match the tested bundle: $($_.Name)"
    }
  }
}
$setup = @($assets | Where-Object { $_.Name -match '(?i)setup.*\.exe$' })
$sbom = @($assets | Where-Object { $_.Name -like '*.spdx.json' })
$checksums = @($assets | Where-Object { $_.Name -eq 'SHA256SUMS' })

if ($setup.Count -ne 1) { throw "Expected exactly one Setup executable, found $($setup.Count)." }
if ($sbom.Count -ne 1) { throw "Expected exactly one SPDX SBOM, found $($sbom.Count)." }
if ($checksums.Count -ne 1) { throw "Expected exactly one SHA256SUMS file, found $($checksums.Count)." }

$checksummedNames = @()
# Parse a deliberately narrow checksum format and keep every referenced path
# inside the verified output directory.
Get-Content -LiteralPath $checksums[0].FullName | ForEach-Object {
  if ($_ -notmatch '^([0-9a-f]{64}) \*(.+)$') { throw "Invalid checksum line: $_" }
  $expectedDigest = $Matches[1]
  $assetName = $Matches[2]
  if ([IO.Path]::GetFileName($assetName) -ne $assetName) { throw "Unsafe checksum asset name: $assetName" }
  if ($checksummedNames -contains $assetName) { throw "Duplicate checksum entry: $assetName" }
  $target = Join-Path $OutputDirectory $assetName
  if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "Missing checksummed asset: $assetName" }
  $actualDigest = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualDigest -ne $expectedDigest) { throw "Digest mismatch for $assetName" }
  $checksummedNames += $assetName
}

$expectedChecksummedNames = @($setup[0].Name, $sbom[0].Name) | Sort-Object
$actualChecksummedNames = @($checksummedNames | Sort-Object)
if (($actualChecksummedNames -join "`n") -ne ($expectedChecksummedNames -join "`n")) {
  throw "Unexpected checksum coverage: $($actualChecksummedNames -join ', ')"
}

$assets | ForEach-Object {
  # Every published asset, including the manifest, must carry a valid attestation.
  gh attestation verify $_.FullName --repo $Repository
}

[pscustomobject]@{
  releaseId = $ReleaseId
  tag = $Tag
  state = $ExpectedState
  assets = $actualNames
} | ConvertTo-Json -Depth 3
