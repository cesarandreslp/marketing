# Enciende todo: Docker Desktop → base de datos y n8n → la app → abre el navegador.
# Se puede ejecutar las veces que sea: lo que ya está encendido no se repite.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)

function MotorDocker { docker info --format "{{.ServerVersion}}" 2>$null | Out-Null; return $LASTEXITCODE -eq 0 }

if (-not (MotorDocker)) {
  Write-Host "Abriendo Docker Desktop..."
  Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  $espera = 0
  while (-not (MotorDocker)) {
    Start-Sleep 3; $espera += 3
    if ($espera -ge 180) { throw "Docker no arrancó en 3 minutos. Ábrelo a mano y vuelve a ejecutar esto." }
  }
}

Write-Host "Encendiendo base de datos y n8n..."
docker compose up -d | Out-Null
do { Start-Sleep 2; docker compose exec -T db pg_isready -U radar -d radar 2>$null | Out-Null } while ($LASTEXITCODE)

$appViva = $false
try { $appViva = (Invoke-WebRequest http://localhost:3000/login -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch {}
if (-not $appViva) {
  Write-Host "Encendiendo la app (queda en una ventana minimizada; no la cierres)..."
  Start-Process cmd -ArgumentList "/k", "title Radar (no cerrar) && npm.cmd run dev" -WindowStyle Minimized
  $espera = 0
  while (-not $appViva -and $espera -lt 90) {
    Start-Sleep 2; $espera += 2
    try { $appViva = (Invoke-WebRequest http://localhost:3000/login -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch {}
  }
}

Start-Process http://localhost:3000
Write-Host "Listo."
