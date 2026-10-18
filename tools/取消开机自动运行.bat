@echo off
chcp 65001 >nul
powershell -NoProfile -Command "Remove-Item -ErrorAction SilentlyContinue (Join-Path ([Environment]::GetFolderPath('Startup')) 'TWS-QQMusicRelay.lnk')"
echo 已取消开机自动运行（现在正在运行的中转不受影响，要停止请双击「停止中转.bat」）。
pause
