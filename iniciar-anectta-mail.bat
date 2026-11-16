@echo off
cd /d "%~dp0"
title Anectta MAIL
echo ==============================================
echo   Iniciando Anectta MAIL - Desktop Client
echo ==============================================
"%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
