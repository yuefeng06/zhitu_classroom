$ErrorActionPreference = 'Stop'
$sourceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$archivePath = Join-Path $sourceRoot 'thesis\zhitu-classroom-source.zip'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Explicit allowlist: never walk business data, backup, uploaded-avatar or dependency directories.
$rootFiles = @(
    '.prettierrc.json', '.prettierignore', '.editorconfig', 'PSScriptAnalyzerSettings.psd1',
    '.env.example', 'package.json', 'package-lock.json', 'README.md',
    'index.html', 'account.js', 'app.js', 'auth.js', 'avatar.js', 'avatars.mjs',
    'backend.mjs', 'admin-api.mjs', 'admin.js', 'published-articles.js', 'passwords.mjs', 'course-summary.mjs', 'recommendation-evaluation.mjs', 'recommendations.mjs', 'recommendation-store.mjs', 'catalog.mjs', 'checkin-calendar.js', 'checkins.mjs',
    'config.mjs', 'database.mjs', 'experience.js', 'handwriting-data.js',
    'handwriting.js', 'history.js', 'home.js', 'media.mjs', 'media-sources.json', 'motion.js',
    'mysql-schema.mjs', 'navigation.js', 'player.js', 'profile.js', 'search.js',
    'select-menu.js', 'server.mjs', 'sqlite-bootstrap.mjs', 'studio.js',
    'study-collection.js', 'study-posts.js', 'styles.css', 'studio.css', 'theme.css',
    'landscape.svg', 'logo.svg', 'logo-mark.svg'
)
$relativeFiles = [System.Collections.Generic.List[string]]::new()
$relativeFiles.Add('scripts/format-powershell.ps1')
foreach ($name in $rootFiles) {
    $relativeFiles.Add($name) 
}
foreach ($folder in @('course-images', 'discovery-images', 'licenses', 'articles')) {
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $sourceRoot $folder) -File) {
        if ($file.Extension -in @('.jpg', '.svg', '.txt', '.md')) {
            $relativeFiles.Add("$folder/$($file.Name)") 
        }
    }
}
foreach ($folder in @('scripts', 'tests')) {
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $sourceRoot $folder) -File -Filter '*.mjs') {
        # This legacy verifier requires a historical SQL data export, intentionally not distributed.
        if ($file.Name -ne 'verify-mysql.mjs') {
            $relativeFiles.Add("$folder/$($file.Name)") 
        }
    }
}
foreach ($name in @('mysql-schema.sql', 'video-catalog.json', 'cover-sources.json', 'discovery-image-sources.json', 'mysql-actual-schema.sql', 'mysql-structure-snapshot.json', '数据库表结构说明.md', 'MySQL切换说明.md')) {
    $relativeFiles.Add("database/$name")
}
$items = @($relativeFiles | Sort-Object -Unique | ForEach-Object { @{Source = $_; Entry = $_ } })
$items += @{Source = 'thesis/源码下载说明.md'; Entry = 'README-SOURCE.md' }
$fileRows = @()
$fileStream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create)
$zip = [System.IO.Compression.ZipArchive]::new($fileStream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($item in $items) {
        $filePath = [System.IO.Path]::GetFullPath((Join-Path $sourceRoot $item.Source))
        if (-not $filePath.StartsWith($sourceRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Source path outside project' 
        }
        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
            throw "Missing source: $($item.Source)" 
        }
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $filePath, 'zhitu-classroom/' + $item.Entry, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        $fileRows += @{path = $item.Entry; sha256 = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
    $manifest = @{snapshotDate = '2026-10-08'; files = $fileRows; excludes = @('business databases', 'private .env', 'uploaded avatars', 'private backups', 'node_modules', 'logs') }
    $entry = $zip.CreateEntry('zhitu-classroom/SOURCE-MANIFEST.json')
    $writer = [System.IO.StreamWriter]::new($entry.Open(), [System.Text.UTF8Encoding]::new($false))
    try {
        $writer.Write(($manifest | ConvertTo-Json -Depth 5)) 
    } finally {
        $writer.Dispose() 
    }
} finally {
    $zip.Dispose(); $fileStream.Dispose() 
}
$archiveInfo = Get-Item -LiteralPath $archivePath
Write-Output "Source archive: $($fileRows.Count) files plus manifest; $($archiveInfo.Length) bytes."
