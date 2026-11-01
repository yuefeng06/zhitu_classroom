$ErrorActionPreference = 'Stop'
$sourceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$archivePath = Join-Path $sourceRoot 'thesis\zhitu-classroom-source.zip'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Explicit allowlist: never walk business data, backup, uploaded-avatar or dependency directories.
$rootFiles = @(
    '.prettierrc.json', '.prettierignore', '.editorconfig', 'PSScriptAnalyzerSettings.psd1',
    '.env.example', 'package.json', 'package-lock.json', 'README.md',
    'frontend/index.html', 'frontend/js/account.js', 'frontend/js/app.js', 'frontend/js/auth.js', 'frontend/js/avatar.js', 'backend/avatars.mjs',
    'backend/backend.mjs', 'backend/admin-api.mjs', 'frontend/js/admin.js', 'frontend/js/published-articles.js', 'backend/passwords.mjs', 'backend/course-summary.mjs', 'backend/recommendation-evaluation.mjs', 'backend/recommendations.mjs', 'backend/recommendation-store.mjs', 'backend/catalog.mjs', 'frontend/js/checkin-calendar.js', 'backend/checkins.mjs',
    'backend/config.mjs', 'backend/database.mjs', 'frontend/js/experience.js', 'frontend/js/handwriting-data.js',
    'frontend/js/handwriting.js', 'frontend/js/history.js', 'frontend/js/home.js', 'backend/media.mjs', 'media-sources.json', 'frontend/js/motion.js',
    'backend/mysql-schema.mjs', 'frontend/js/navigation.js', 'frontend/js/player.js', 'frontend/js/profile.js', 'frontend/js/search.js',
    'frontend/js/select-menu.js', 'server.mjs', 'backend/sqlite-bootstrap.mjs', 'frontend/js/studio.js',
    'frontend/js/study-collection.js', 'frontend/js/study-posts.js', 'frontend/css/styles.css', 'frontend/css/studio.css', 'frontend/css/theme.css',
    'frontend/assets/landscape.svg', 'frontend/assets/logo.svg', 'frontend/assets/logo-mark.svg'
)
$rootFiles += @(
    'frontend/js/account.js', 'backend/admin-api.mjs', 'backend/admin-learning-api.mjs', 'frontend/js/admin-learning.js', 'frontend/js/admin-user.js', 'frontend/js/admin.js', 'frontend/js/app.js', 'frontend/js/article-markdown.js', 'frontend/js/auth.js', 'frontend/js/avatar.js', 'backend/avatars.mjs', 'backend/backend.mjs', 'backend/catalog.mjs', 'frontend/js/checkin-calendar.js', 'backend/checkins.mjs', 'backend/config.mjs', 'backend/course-covers.mjs', 'frontend/js/course-image.js', 'backend/course-summary.mjs', 'backend/database.mjs', 'frontend/js/experience.js', 'frontend/js/handwriting-data.js', 'frontend/js/handwriting.js', 'frontend/js/history.js', 'frontend/js/home.js', 'frontend/assets/landscape.svg', 'frontend/assets/logo-mark.svg', 'frontend/assets/logo.svg', 'backend/media.mjs', 'frontend/js/motion.js', 'backend/mysql-schema.mjs', 'frontend/js/navigation.js', 'backend/passwords.mjs', 'frontend/js/player.js', 'frontend/js/profile.js', 'frontend/js/published-articles.js', 'backend/recommendation-evaluation.mjs', 'backend/recommendation-store.mjs', 'backend/recommendations.mjs', 'backend/relationships.mjs', 'frontend/js/search.js', 'frontend/js/select-menu.js', 'backend/server.mjs', 'backend/sqlite-bootstrap.mjs', 'frontend/css/studio.css', 'frontend/js/studio.js', 'frontend/js/study-collection.js', 'frontend/js/study-posts.js', 'frontend/css/styles.css', 'frontend/css/theme.css', 'backend/video-files.mjs', 'frontend/index.html'
)
$relativeFiles = [System.Collections.Generic.List[string]]::new()
$relativeFiles.Add('scripts/format-powershell.ps1')
foreach ($name in $rootFiles) {
    $relativeFiles.Add($name) 
}
foreach ($folder in @('frontend/assets/course-images', 'frontend/assets/discovery-images', 'licenses', 'articles')) {
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
    $manifest = @{snapshotDate = (Get-Date -Format 'yyyy-MM-dd'); files = $fileRows; excludes = @('business databases', 'private .env', 'uploaded avatars', 'private backups', 'node_modules', 'logs') }
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
