@echo off
rem Envia a app e os dados (data\sync.json) para o GitHub Pages, para o telemóvel ficar atualizado.
cd /d "%~dp0"
git add -A
git commit -m "Atualizar dados %date% %time:~0,5%"
git push
echo.
echo Feito. O telemovel fica atualizado em 1-2 minutos (abre a app ou puxa para atualizar).
pause
