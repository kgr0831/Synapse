@echo off
rem Synapse dev server. Closing this window stops it (console close event kills the tree).
cd /d "%~dp0"
if not exist node_modules call npm install
call npx vite --open
