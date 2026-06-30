@echo off
setlocal
cd /d "%~dp0"
set "NODE_BIN=C:\Users\thisi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
set "PATH=%NODE_BIN%;%PATH%"
set CI=
echo Starting CoTrip AI at http://localhost:3000
echo Keep this window open while using the website.
echo.
call ".\node_modules\.bin\next.cmd" start -p 3000
echo.
echo CoTrip AI server stopped. Press any key to close this window.
pause >nul
