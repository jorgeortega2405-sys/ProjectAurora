Write-Host "=========================================================="
Write-Host "Configuración de Windows Defender Firewall: Solo Cloudflare"
Write-Host "=========================================================="

try {
  $ipv4 = (Invoke-RestMethod -Uri "https://www.cloudflare.com/ips-v4") -split "`n" | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+/\d+' }
  $ipv6 = (Invoke-RestMethod -Uri "https://www.cloudflare.com/ips-v6") -split "`n" | Where-Object { $_ -match '^[0-9a-fA-F:]+/\d+' }
  $allIps = @($ipv4) + @($ipv6)

  Remove-NetFirewallRule -DisplayName "ProjectAurora Cloudflare Only HTTP/HTTPS" -ErrorAction SilentlyContinue

  New-NetFirewallRule -DisplayName "ProjectAurora Cloudflare Only HTTP/HTTPS" `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort 80,443 `
    -RemoteAddress $allIps `
    -Profile Any `
    -Description "Permite tráfico entrante en puertos 80 y 443 únicamente desde la red global de Cloudflare."

  Write-Host "[✓] Reglas de Windows Firewall creadas exitosamente para $($allIps.Count) rangos IP de Cloudflare."
} catch {
  Write-Error "Fallo al configurar reglas de firewall: $_"
}
