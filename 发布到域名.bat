@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo 没找到 Node.js & pause & exit /b 1)
node scripts\deploy.mjs %*
pause
