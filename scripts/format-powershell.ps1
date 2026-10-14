param([switch]$Check)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$settings = Join-Path $projectRoot 'PSScriptAnalyzerSettings.psd1'
$localModule = Join-Path $projectRoot 'artifacts/source-format/tools/PSScriptAnalyzer/PSScriptAnalyzer.psd1'
if (Test-Path -LiteralPath $localModule) {
    Import-Module $localModule
} else {
    Import-Module PSScriptAnalyzer -ErrorAction Stop
}

$files = @(
    'build_requirements.ps1',
    'scripts/package-thesis-source.ps1',
    'scripts/verify-mysql-interactive.ps1',
    'scripts/format-powershell.ps1',
    'PSScriptAnalyzerSettings.psd1'
)
$changed = 0
foreach ($relativePath in $files) {
    $path = Join-Path $projectRoot $relativePath
    $source = [System.IO.File]::ReadAllText($path)
    # Normalize structural line endings before invoking the formatter; restore
    # literal tokens afterwards so multiline text is not changed by this step.
    $sourceTokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$sourceTokens, [ref]$parseErrors) | Out-Null
    if ($parseErrors.Count) {
        throw "PowerShell parse error: $relativePath" 
    }
    $literals = @($sourceTokens | Where-Object { $_.Kind -in @('StringLiteral', 'StringExpandable', 'HereStringLiteral', 'HereStringExpandable') })
    $normalized = $source -replace "`r?`n", "`r`n"
    $formatted = Invoke-Formatter -ScriptDefinition $normalized -Settings $settings
    $formattedTokens = $null
    [System.Management.Automation.Language.Parser]::ParseInput($formatted, [ref]$formattedTokens, [ref]$parseErrors) | Out-Null
    if ($parseErrors.Count) {
        throw "Formatted PowerShell parse error: $relativePath" 
    }
    $formattedLiterals = @($formattedTokens | Where-Object { $_.Kind -in @('StringLiteral', 'StringExpandable', 'HereStringLiteral', 'HereStringExpandable') })
    if ($literals.Count -ne $formattedLiterals.Count) {
        throw "String token count changed: $relativePath" 
    }
    for ($i = $literals.Count - 1; $i -ge 0; $i--) {
        $extent = $formattedLiterals[$i].Extent
        $formatted = $formatted.Remove($extent.StartOffset, $extent.EndOffset - $extent.StartOffset).Insert($extent.StartOffset, $literals[$i].Text)
    }
    $formatted = $formatted.TrimEnd() + "`r`n"
    if ($source -ceq $formatted) {
        continue 
    }
    $changed++
    if ($Check) {
        Write-Output "Needs formatting: $relativePath"
    } else {
        [System.IO.File]::WriteAllText($path, $formatted, [System.Text.UTF8Encoding]::new($false))
        Write-Output "Formatted: $relativePath"
    }
}
Write-Output "$($files.Count) PowerShell files checked; $changed require changes."
if ($Check -and $changed -gt 0) {
    exit 1 
}
