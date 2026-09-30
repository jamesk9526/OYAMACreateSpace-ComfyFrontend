@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.16 or newer is required.
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);if(a<22||(a===22&&b<16))process.exit(1)"
if errorlevel 1 exit /b 1
call npx --yes pnpm@10.11.0 --offline=false install --frozen-lockfile
if errorlevel 1 exit /b 1
call npx --yes pnpm@10.11.0 package:win %*
if errorlevel 1 exit /b 1
echo Installer ready in "%~dp0release"
endlocal
