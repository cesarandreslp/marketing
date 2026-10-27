# Evita que el PC se suspenda o hiberne conectado a la corriente (n8n necesita estar despierto).
# La pantalla sí se apaga a los 15 min. Con batería no se cambia nada.
# Para revertir: powercfg /change standby-timeout-ac 30
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 15
Write-Host "Suspensión desactivada con corriente."
