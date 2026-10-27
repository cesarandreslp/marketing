# Guarda los flujos de n8n (en n8n\flujos, versionables en git) y la base de datos (en respaldos\, fuera de git).
# Las credenciales de n8n NO se exportan: viven cifradas en su volumen con N8N_ENCRYPTION_KEY.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)

New-Item -ItemType Directory -Force n8n\flujos, respaldos | Out-Null
docker compose exec -T n8n n8n export:workflow --all --separate --output=/respaldo/flujos
if ($LASTEXITCODE) { throw "No se pudieron exportar los flujos de n8n" }

$archivo = "respaldos\radar-$(Get-Date -Format yyyyMMdd-HHmm).sql"
# cmd /c para que la redirección guarde bytes tal cual (PowerShell 5.1 los recodifica).
cmd /c "docker compose exec -T db pg_dump -U radar radar > $archivo"
if ($LASTEXITCODE) { throw "pg_dump falló" }

# Postiz: canales conectados y publicaciones programadas.
$postiz = "respaldos\postiz-$(Get-Date -Format yyyyMMdd-HHmm).sql"
cmd /c "docker compose exec -T postiz-postgres pg_dump -U postiz postiz > $postiz"
if ($LASTEXITCODE) { Write-Warning "No se pudo respaldar Postiz (¿está encendido?)"; Remove-Item $postiz -ErrorAction SilentlyContinue }
Get-ChildItem respaldos\postiz-*.sql -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -Skip 14 | Remove-Item

# Fotos y videos subidos a las piezas (se copian solo los nuevos o cambiados).
if (Test-Path datos\medios) { robocopy datos\medios respaldos\medios /E /XO /NFL /NDL /NJH /NJS | Out-Null }

# Conserva los últimos 14 respaldos de la base.
Get-ChildItem respaldos\radar-*.sql | Sort-Object Name -Descending | Select-Object -Skip 14 | Remove-Item
Write-Host "Respaldo listo: n8n\flujos y $archivo"
