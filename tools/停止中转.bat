@echo off
chcp 65001 >nul
set found=0
rem 只找「本机 127.0.0.1:17890 正在监听」的那一个进程，不会误关浏览器
for /f "tokens=5" %%p in ('netstat -ano -p TCP ^| findstr /r /c:"127\.0\.0\.1:17890  *0\.0\.0\.0:0 "') do (
  taskkill /PID %%p /F >nul 2>nul
  set found=1
)
if "%found%"=="1" (echo 中转已停止。) else (echo 中转本来就没在运行。)
pause
