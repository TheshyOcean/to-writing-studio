@echo off
chcp 65001 >nul
title 开机自动运行 QQ 音乐中转
if not exist "%~dp0qqmusic-key.txt" (
  echo 还没有保存 API Key，请先双击 qqmusic-relay.bat 运行一次。
  pause & exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$v = Join-Path '%~dp0' 'qqmusic-relay-hidden.vbs'; $lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'TWS-QQMusicRelay.lnk'; $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk); $s.TargetPath = 'wscript.exe'; $s.Arguments = '"' + $v + '"'; $s.WorkingDirectory = '%~dp0'; $s.Save()"
if errorlevel 1 (echo 设置失败。& pause & exit /b)
echo 已设置开机自动运行（不会弹出窗口）。
echo 想取消：双击「取消开机自动运行.bat」。
start "" wscript.exe "%~dp0qqmusic-relay-hidden.vbs"
echo 中转已经在后台启动了，可以关掉这个窗口。
pause
