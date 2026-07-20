@echo off
rem ============================================================
rem The Teacher's Desk — local dev server.
rem Double-click to serve the suite at http://localhost:8765/
rem CLOSE THIS WINDOW (or press Ctrl+C) to stop the server.
rem ============================================================
title The Teacher's Desk - local server (close window to stop)
cd /d "%~dp0"

set PY=C:\Users\benja\AppData\Local\Python\pythoncore-3.14-64\python.exe
if not exist "%PY%" set PY=python

echo Serving The Teacher's Desk at http://localhost:8765/
echo Close this window when you're done.
echo.
start "" http://localhost:8765/
"%PY%" -m http.server 8765
