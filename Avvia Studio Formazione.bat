@echo off
rem Avvio di Studio Formazione con un doppio clic: API locale e app web, ciascuna nella sua finestra.
rem Nessuna chiave qui dentro: fornitore, chiavi e modello stanno solo in services\api\.env,
rem scritto dalla schermata Impostazioni dell'app (oppure a mano, vedi .env.example).
chcp 65001 >nul
setlocal
title Studio Formazione - avvio
cd /d "%~dp0"

echo Studio Formazione: controllo dell'installazione...
echo.

set "MANCA="
if not exist ".venv\Scripts\python.exe" set "MANCA=1"
if not exist "node_modules\" set "MANCA=1"
if defined MANCA goto installazione_mancante

where npm >nul 2>nul
if errorlevel 1 goto node_mancante

call :porta_libera 8000 "l'API"
if errorlevel 1 goto fine_errore
call :porta_libera 8081 "l'app web"
if errorlevel 1 goto fine_errore

rem Expo con --web aprirebbe il browser da solo, prima che l'API sia pronta: lo apre questo file.
set "BROWSER=none"

echo Avvio dell'API su http://127.0.0.1:8000 ...
start "Studio Formazione - API (non chiudere)" cmd /k .venv\Scripts\python.exe -m uvicorn formazione_api.main:app --app-dir services/api --host 127.0.0.1 --port 8000
echo Avvio dell'app web su http://localhost:8081 ...
start "Studio Formazione - App web (non chiudere)" cmd /k npm run web

echo.
echo Attendo che l'API risponda...
set /a TENTATIVI=0
:attesa_api
curl.exe -s -f -o nul --max-time 2 http://127.0.0.1:8000/generation/config
if not errorlevel 1 goto api_pronta
set /a TENTATIVI+=1
if %TENTATIVI% geq 90 goto api_non_risponde
ping -n 2 127.0.0.1 >nul
goto attesa_api

:api_pronta
echo API pronta.
echo Attendo che l'app web risponda: la prima volta può richiedere un minuto...
set /a TENTATIVI=0
:attesa_web
curl.exe -s -f -o nul --max-time 2 http://localhost:8081
if not errorlevel 1 goto web_pronta
set /a TENTATIVI+=1
if %TENTATIVI% geq 180 goto web_non_risponde
ping -n 2 127.0.0.1 >nul
goto attesa_web

:web_pronta
echo App web pronta: apro il browser su http://localhost:8081
start "" http://localhost:8081
echo.
echo Per chiudere Studio Formazione chiudi le due finestre
echo "Studio Formazione - API" e "Studio Formazione - App web".
echo Questa finestra si chiude da sola.
ping -n 6 127.0.0.1 >nul
exit /b 0

:installazione_mancante
echo Manca l'installazione: .venv oppure node_modules non esistono.
echo Non installo nulla da solo. Apri PowerShell in questa cartella:
echo.
echo     %CD%
echo.
echo e lancia una volta sola questi comandi, come nel README:
echo.
echo     npm ci
echo     python -m venv .venv
echo     .venv/Scripts/python.exe -m pip install -r services/api/requirements-dev.txt
echo.
echo Servono Node.js e Python 3.12. Poi fai di nuovo doppio clic su "Avvia Studio Formazione".
goto fine_errore

:node_mancante
echo Non trovo npm: installa Node.js, poi fai di nuovo doppio clic su "Avvia Studio Formazione".
goto fine_errore

:api_non_risponde
echo L'API non risponde dopo 3 minuti. Guarda la finestra "Studio Formazione - API" per l'errore.
goto fine_errore

:web_non_risponde
echo L'app web non risponde dopo 6 minuti. Guarda la finestra "Studio Formazione - App web" per l'errore.
goto fine_errore

:porta_libera
rem %1 = porta, %2 = a cosa serve. Errorlevel 1 se la porta è già in ascolto.
powershell -NoProfile -Command "$c = Get-NetTCPConnection -State Listen -LocalPort %1 -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; Write-Output ('La porta %1 è già occupata da ' + $(if ($p) { $p.ProcessName + '.exe' } else { 'un altro programma' }) + ' (PID ' + $c.OwningProcess + ').'); exit 1 }; exit 0"
if errorlevel 1 (
  echo Serve libera per %~2: forse Studio Formazione è già aperto.
  echo Chiudi le finestre "Studio Formazione" già aperte, oppure il programma indicato, e riprova.
  exit /b 1
)
exit /b 0

:fine_errore
echo.
pause
exit /b 1
