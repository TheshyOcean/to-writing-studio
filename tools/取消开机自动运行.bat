@echo off
chcp 65001 >nul
powershell -NoProfile -Command "Remove-Item -ErrorAction SilentlyContinue (Join-Path ([Environment]::GetFolderPath('Startup')) 'TWS-QQMusicRelay.lnk')"
echo 已确认没有开机自动运行（如果之前设置过，现在已删除）。
pause
