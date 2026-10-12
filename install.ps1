<#
.SYNOPSIS
  Register dsh-mocha into a dsh profile so it loads automatically on every DSH
  start — no rebuild after a restart.

.DESCRIPTION
  The agent's file sandbox can only write inside the workspace, and the profile
  lives outside it, so this step must be run by you in a normal terminal.

  Registration is two separate things, and skipping either leaves the plugin
  invisible:

    1. manifest     — add  "dsh-mocha": "link:<path>"  to dependencies and append
                      "dsh-mocha" to dsh.profile.bundles
    2. node_modules — the link: dependency must actually be installed. DSH does
                      NOT run pnpm install on startup, so an edited package.json
                      alone resolves to nothing and the plugin never loads.

  This script performs both, backs up the profile manifest first, and restores
  the backup if the manifest write cannot be re-parsed.

.PARAMETER Profile
  Profile id to register into. Defaults to 'web', this machine's active profile.

.PARAMETER Uninstall
  Remove the manifest entries again.

.PARAMETER DryRun
  Show what would change without writing anything.

.PARAMETER SkipInstall
  Register the manifest only; do not run pnpm install.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -DryRun
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall

.NOTES
  Restart DSH after installing. Verify the host half with:
    Invoke-RestMethod http://127.0.0.1:43129/dsh-mocha/persona
  which answers { personaOn = True } once the plugin is live.
#>
[CmdletBinding()]
param(
  [string]$Profile = 'web',
  [switch]$Uninstall,
  [switch]$DryRun,
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$packageName = 'dsh-mocha'
# dsh resolves link: targets with forward slashes.
$linkTarget = 'link:' + ($packageRoot -replace '\\', '/')

$profileDir = Join-Path $env:APPDATA "dsh-desktop\harness\profiles\$Profile"
$packageFile = Join-Path $profileDir 'package.json'
$nmLink = Join-Path $profileDir "node_modules\$packageName"

if (-not (Test-Path $packageFile)) {
  Write-Host "[mocha] Profile package.json not found: $packageFile"
  Write-Host '[mocha] Check the -Profile value, or whether DSH_HOME differs on this machine.'
  exit 1
}

Write-Host "[mocha] Profile : $profileDir"
Write-Host "[mocha] Package : $packageRoot"
Write-Host "[mocha] Action  : $(if ($Uninstall) { 'uninstall' } else { 'install' })$(if ($DryRun) { ' (dry run)' })"
Write-Host ''

# ---------------------------------------------------------------- read + parse

$raw = Get-Content $packageFile -Raw
$json = $null
try {
  $json = $raw | ConvertFrom-Json
} catch {
  Write-Host '[mocha] The profile package.json is not valid JSON. Aborting; nothing was changed.'
  exit 1
}

if (-not $json.PSObject.Properties['dependencies']) {
  Write-Host '[mocha] The profile has no "dependencies" block. Aborting; nothing was changed.'
  exit 1
}
if (-not $json.PSObject.Properties['dsh']) {
  Write-Host '[mocha] The profile has no "dsh" block. Aborting; nothing was changed.'
  exit 1
}

$bundlesBefore = @($json.dsh.profile.bundles)
$depBefore = $json.dependencies.PSObject.Properties[$packageName]
$hasBundles = @($bundlesBefore) -contains $packageName
$manifestOk = [bool]$depBefore -and $hasBundles
$linkOk = Test-Path $nmLink

Write-Host ('[mocha] manifest    : {0}' -f $(if ($manifestOk) { 'present' } else { 'MISSING' }))
Write-Host ('[mocha] node_modules: {0}' -f $(if ($linkOk) { 'linked' } else { 'MISSING (needs pnpm install)' }))
Write-Host ''

# ------------------------------------------------------------------- uninstall

if ($Uninstall) {
  if (-not $manifestOk) {
    Write-Host '[mocha] Nothing to remove: the package is not registered in this profile.'
    exit 0
  }
  if ($DryRun) {
    Write-Host '[mocha] Dry run: would remove the dependency and bundles entries.'
    exit 0
  }

  $backup = "$packageFile.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -Path $packageFile -Destination $backup -Force
  Write-Host "[mocha] Backup written: $backup"

  try {
    $json.dependencies.PSObject.Properties.Remove($packageName)
    $json.dsh.profile.bundles = @($bundlesBefore | Where-Object { $_ -ne $packageName })
    $text = $json | ConvertTo-Json -Depth 24
    [System.IO.File]::WriteAllText($packageFile, $text, (New-Object System.Text.UTF8Encoding($false)))

    $check = Get-Content $packageFile -Raw | ConvertFrom-Json
    if ($check.dependencies.PSObject.Properties[$packageName]) { throw 'dependency entry still present' }
    if (@($check.dsh.profile.bundles) -contains $packageName) { throw 'bundles entry still present' }
  } catch {
    Write-Host ''
    Write-Host "[mocha] FAILED: $($_.Exception.Message)"
    Copy-Item -Path $backup -Destination $packageFile -Force
    Write-Host '[mocha] Restored the backup. The profile is unchanged.'
    exit 1
  }

  Write-Host ''
  Write-Host '[mocha] Uninstalled from the manifest.'
  Write-Host "[mocha] Note: node_modules\$packageName was left in place; it is harmless."
  Write-Host '[mocha] Restart DSH to unload the plugin.'
  exit 0
}

# --------------------------------------------------------------- already done?

if ($manifestOk -and ($linkOk -or $SkipInstall)) {
  Write-Host '[mocha] Already fully registered. Nothing to do.'
  Write-Host '[mocha] If the plugin is still not visible, restart DSH.'
  exit 0
}

if ($DryRun) {
  if (-not $manifestOk) { Write-Host ('[mocha] Would add dependency "{0}": "{1}"' -f $packageName, $linkTarget) }
  if (-not $hasBundles) { Write-Host ('[mocha] Would append "{0}" to dsh.profile.bundles' -f $packageName) }
  if (-not $linkOk -and -not $SkipInstall) { Write-Host '[mocha] Would run pnpm install to create the node_modules link.' }
  Write-Host ''
  Write-Host '[mocha] Dry run: no files were written.'
  exit 0
}

# ------------------------------------------------------------ 1. manifest step

if (-not $manifestOk) {
  $backup = "$packageFile.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -Path $packageFile -Destination $backup -Force
  Write-Host "[mocha] Backup written: $backup"

  try {
    if (-not $depBefore) {
      $json.dependencies | Add-Member -NotePropertyName $packageName -NotePropertyValue $linkTarget -Force
    }
    if (-not $hasBundles) {
      $json.dsh.profile.bundles = @($bundlesBefore) + $packageName
    }

    $text = $json | ConvertTo-Json -Depth 24
    # UTF8 without BOM: a BOM makes JSON.parse throw in Node.
    [System.IO.File]::WriteAllText($packageFile, $text, (New-Object System.Text.UTF8Encoding($false)))

    # Re-read: never report success on a file we cannot parse back.
    $check = Get-Content $packageFile -Raw | ConvertFrom-Json
    if (-not $check.dependencies.PSObject.Properties[$packageName]) { throw 'dependency entry missing after write' }
    if (-not (@($check.dsh.profile.bundles) -contains $packageName)) { throw 'bundles entry missing after write' }
  } catch {
    Write-Host ''
    Write-Host "[mocha] FAILED: $($_.Exception.Message)"
    Copy-Item -Path $backup -Destination $packageFile -Force
    Write-Host '[mocha] Restored the backup. The profile is unchanged.'
    exit 1
  }

  Write-Host '[mocha] Manifest updated and verified.'
} else {
  Write-Host '[mocha] Manifest already present; skipping that step.'
}

# -------------------------------------------------------- 2. node_modules step

if ($linkOk) {
  Write-Host ('[mocha] node_modules\{0} already linked.' -f $packageName)
  Write-Host ''
  Write-Host '[mocha] Installed. Restart DSH to load the plugin.'
  exit 0
}

if ($SkipInstall) {
  Write-Host ''
  Write-Host '[mocha] -SkipInstall given, so the link step was skipped.'
  Write-Host '[mocha] The plugin will NOT load until pnpm install has run in the profile:'
  Write-Host ('[mocha]   cd "{0}"; pnpm install' -f $profileDir)
  exit 0
}

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
  Write-Host ''
  Write-Host '[mocha] pnpm was not found on PATH, so the link step cannot run.'
  Write-Host '[mocha] Restart DSH (it writes the pnpm shim), or link it by hand:'
  Write-Host ('[mocha]   mklink /J "{0}" "{1}"' -f $nmLink, $packageRoot)
  exit 1
}

Write-Host ('[mocha] Running pnpm install in the profile (via {0}) ...' -f $pnpm.Source)
Push-Location $profileDir
try {
  & $pnpm.Source install
  $code = $LASTEXITCODE
} finally {
  Pop-Location
}

if ($code -ne 0) {
  Write-Host ''
  Write-Host "[mocha] pnpm install exited with code $code."
  Write-Host '[mocha] The manifest stays registered; re-run this script after fixing pnpm.'
  exit 1
}

if (-not (Test-Path $nmLink)) {
  Write-Host ''
  Write-Host ('[mocha] pnpm install finished but node_modules\{0} is still missing.' -f $packageName)
  Write-Host '[mocha] Link it by hand instead:'
  Write-Host ('[mocha]   mklink /J "{0}" "{1}"' -f $nmLink, $packageRoot)
  exit 1
}

Write-Host ''
Write-Host '[mocha] Installed and verified: manifest + node_modules link.'
Write-Host '[mocha] Restart DSH to load the plugin.'
Write-Host '[mocha] Expect: Mocha HUD at the bottom-right, "Mocha" pill left of the composer.'
Write-Host '[mocha] Note: microphone input only works in a browser tab, not the desktop shell.'
exit 0
