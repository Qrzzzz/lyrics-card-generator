param([Parameter(Mandatory=$true)][string]$Installer)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskInstaller = (Resolve-Path -LiteralPath $Installer).Path
$taskGuid = '5a835873-d72a-592e-994b-b491c1b60160'
$taskRegistry = "Software\$taskGuid"
$taskDesktop = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Lyrics Card Generator.lnk'
$taskStartMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Lyrics Card Generator.lnk'
# This is a real install/upgrade/uninstall gate. Refuse to touch an existing install.
foreach ($taskKey in @("HKCU:\$taskRegistry", "HKLM:\$taskRegistry")) {
    if (Test-Path -LiteralPath $taskKey) { throw "Existing installation registry found: $taskKey" }
}
if ((Test-Path -LiteralPath $taskDesktop) -or (Test-Path -LiteralPath $taskStartMenu)) { throw 'Existing shortcut found; use a clean Windows profile.' }
if (Get-Process -Name 'Lyrics Card Generator' -ErrorAction SilentlyContinue) { throw 'Application is running.' }
$taskDirectory = Join-Path $env:TEMP ('lyrics-custom-installer-' + [Guid]::NewGuid().ToString('N'))
$taskInstallDirectory = Join-Path $taskDirectory '应用 Test'
New-Item -ItemType Directory -Path $taskInstallDirectory -Force | Out-Null
$taskReport = Join-Path $taskRoot 'dist-desktop/installer/integration.txt'
try {
    & node (Join-Path $PSScriptRoot 'build-installer-shell.mjs') --integration-harness
    if ($LASTEXITCODE -ne 0) { throw 'Harness compilation failed.' }
    $taskHarness = Join-Path $taskRoot 'dist-desktop/installer/SetupIntegration.exe'
    $taskArguments = @($taskInstaller, $taskRegistry, $taskInstallDirectory, $taskReport) | ForEach-Object { '"' + $_ + '"' }
    $taskProcess = Start-Process -FilePath $taskHarness -ArgumentList $taskArguments -PassThru -WindowStyle Hidden
    if (-not $taskProcess.WaitForExit(300000)) { throw "Installer gate timed out; inspect process $($taskProcess.Id) before cleanup." }
    Get-Content -LiteralPath $taskReport -TotalCount 35
    if ($taskProcess.ExitCode -ne 0) { throw "Installer gate failed: $($taskProcess.ExitCode)" }
} finally {
    $taskUninstaller = Join-Path $taskInstallDirectory 'Uninstall Lyrics Card Generator.exe'
    if ((Test-Path -LiteralPath $taskUninstaller) -and (!$taskProcess -or $taskProcess.HasExited)) {
        $taskRemove = Start-Process -FilePath $taskUninstaller -ArgumentList '/S' -PassThru -WindowStyle Hidden
        if (-not $taskRemove.WaitForExit(90000)) { throw 'Uninstaller timed out.' }
        # NSIS's uninstaller relaunches from temp; wait for that child to finish.
        $taskDeadline = [DateTime]::UtcNow.AddSeconds(30)
        while (((Test-Path -LiteralPath (Join-Path $taskInstallDirectory 'Lyrics Card Generator.exe')) -or (Test-Path -LiteralPath "HKCU:\$taskRegistry") -or (Test-Path -LiteralPath $taskStartMenu)) -and [DateTime]::UtcNow -lt $taskDeadline) { Start-Sleep -Milliseconds 300 }
        if (Test-Path -LiteralPath (Join-Path $taskInstallDirectory 'Lyrics Card Generator.exe')) { throw 'Uninstall left application executable.' }
        if (Test-Path -LiteralPath "HKCU:\$taskRegistry") { throw 'Uninstall left installation registry.' }
        if (Test-Path -LiteralPath $taskStartMenu) { throw 'Uninstall left Start menu shortcut.' }
        Add-Content -LiteralPath $taskReport -Value 'PASS: real silent uninstall removed application files and installation registry'
        Write-Output 'PASS: real silent uninstall removed application files and installation registry'
    }
    # Only remove the exact, GUID-owned test directory under the verified temp root.
    $taskResolved = [IO.Path]::GetFullPath($taskDirectory)
    $taskTempPrefix = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
    if ((!$taskProcess -or $taskProcess.HasExited) -and $taskResolved.StartsWith($taskTempPrefix, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $taskResolved) -match '^lyrics-custom-installer-[a-f0-9]{32}$') {
        Remove-Item -LiteralPath $taskResolved -Recurse -Force -ErrorAction SilentlyContinue
    }
}
