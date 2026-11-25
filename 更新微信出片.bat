@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在拉取最新版本…
git pull --ff-only || (echo 拉取失败：看上面的报错。如果改过项目里的文件，先联系我们（微信 bopii2024） & pause & exit /b 1)
node scripts\setup.mjs
node scripts\open.mjs --stop
node scripts\open.mjs
pause
