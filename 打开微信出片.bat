@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo 没找到 Node.js，请先安装：https://nodejs.org/zh-cn & pause & exit /b 1)
node scripts\open.mjs %*
if errorlevel 1 pause
