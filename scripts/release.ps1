[CmdletBinding(DefaultParameterSetName = 'Check')]
param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(ParameterSetName = 'Check')][switch]$CheckOnly,
    [Parameter(Mandatory = $true, ParameterSetName = 'Publish')][switch]$Publish,
    [Parameter(Mandatory = $true, ParameterSetName = 'Resume')][switch]$Resume,
    [Parameter(Mandatory = $true, ParameterSetName = 'Candidate')][switch]$PrepareCandidate,
    [ValidateRange(1, 240)][int]$TimeoutMinutes = 90
)
$ErrorActionPreference = 'Stop'
$mode = if ($Publish) { 'publish' } elseif ($Resume) { 'resume' } elseif ($PrepareCandidate) { 'candidate' } else { 'check' }
& node (Join-Path $PSScriptRoot 'release-cli.mjs') --version $Version --mode $mode --timeout $TimeoutMinutes
exit $LASTEXITCODE
