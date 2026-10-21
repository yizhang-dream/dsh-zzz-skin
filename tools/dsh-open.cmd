@echo off
REM Print or open the current DSH web login URL from lab-ts.
REM Usage: dsh-open          open in browser
REM        dsh-open --print  print URL only
setlocal

set "GITBASH=C:\Program Files\Git\bin\bash.exe"
if not exist "%GITBASH%" (
  echo Cannot find Git Bash at: %GITBASH%
  exit /b 1
)

set "HOME=C:\Users\%USERNAME%"
"%GITBASH%" -lc "bash /c/Users/%USERNAME%/bin/dsh-open.sh %*"
exit /b %ERRORLEVEL%
