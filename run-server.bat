@echo off
REM ────────────────────────────────────────────
REM run-dev.bat — launch API, webhook & ngrok
REM ────────────────────────────────────────────

cd /d C:\Users\admin\code\tagcontactbridge

REM This will fire up all three processes in one window, with prefixes/colors
npm run dev

pause