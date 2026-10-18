@echo off
chcp 65001 >nul
title QQ 音乐中转 - To写作工作台
cd /d "%~dp0"
where py >nul 2>nul && (py -3 qqmusic-relay.py) || (python qqmusic-relay.py)
pause
