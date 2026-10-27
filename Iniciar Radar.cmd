@echo off
rem Doble clic para encender todo (Docker, base de datos, n8n y la app).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar.ps1"
if errorlevel 1 pause
