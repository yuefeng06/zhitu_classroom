$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = '知途课堂 - MySQL 本地验证'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
Write-Host '连接本机 MySQL：请在此窗口输入账号和密码。'
Write-Host '将创建独立的 zhitu_verify_* 验证库，不修改现有业务库。'
$verifyUser = Read-Host 'MySQL 用户名（直接回车使用 root）'
if ([string]::IsNullOrWhiteSpace($verifyUser)) {
    $verifyUser = 'root' 
}
$verifySecret = Read-Host 'MySQL 密码（输入不显示）' -AsSecureString
try {
    $env:MYSQL_VERIFY_USER = $verifyUser
    $env:MYSQL_PWD = ([System.Net.NetworkCredential]::new('', $verifySecret)).Password
    & node (Join-Path $PSScriptRoot 'verify-mysql.mjs')
    if ($LASTEXITCODE -eq 0) {
        Write-Host '验证通过，报告已保存到 database/mysql-verification.json。' -ForegroundColor Green 
    } else {
        Write-Host '验证未通过，请查看上方错误。' -ForegroundColor Yellow 
    }
} finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
    Remove-Item Env:MYSQL_VERIFY_USER -ErrorAction SilentlyContinue
    $verifySecret.Dispose()
}
Read-Host '按回车关闭窗口'
