@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22 或更高版本，然后重新打开。
  pause
  exit /b 1
)
powershell -NoProfile -Command "$exe=(Get-Command ollama.exe -ErrorAction SilentlyContinue).Source; if($exe -and -not (Get-Process -Name ollama -ErrorAction SilentlyContinue)){ Start-Process -FilePath $exe -ArgumentList 'serve' -WindowStyle Hidden }"
node "%~dp0local.mjs" --open
if errorlevel 1 pause

