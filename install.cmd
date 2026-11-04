@echo off
setlocal
where py >nul 2>nul
if not errorlevel 1 (
  py -3 -c "import sys; sys.exit(int(sys.version_info.major != 3 or sys.version_info.minor not in range(10,100)))" >nul 2>nul
  if not errorlevel 1 (
    py -3 "%~dp0scripts\setup_environment.py" %*
    goto result
  )
)
where python >nul 2>nul
if not errorlevel 1 (
  python -c "import sys; sys.exit(int(sys.version_info.major != 3 or sys.version_info.minor not in range(10,100)))" >nul 2>nul
  if not errorlevel 1 (
    python "%~dp0scripts\setup_environment.py" %*
    goto result
  )
)
echo Python 3.10+ is required. Install Python from python.org, then rerun. See docs\SETUP.md.
set "KODE_SETUP_STATUS=1"
goto finish
:result
set "KODE_SETUP_STATUS=%errorlevel%"
:finish
if not defined CI if not defined KODE_SETUP_NO_PAUSE pause
exit /b %KODE_SETUP_STATUS%
