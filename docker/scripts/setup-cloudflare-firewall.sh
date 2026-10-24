#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "Configuración de Firewall de Origen: Solo IPs de Cloudflare"
echo "=========================================================="

if command -v ufw >/dev/null 2>&1; then
  echo "[+] Configurando UFW (Uncomplicated Firewall)..."

  ufw allow 22/tcp comment 'SSH Access' || true

  IPV4_LIST=$(curl -s https://www.cloudflare.com/ips-v4)
  IPV6_LIST=$(curl -s https://www.cloudflare.com/ips-v6)

  ufw delete allow 80/tcp 2>/dev/null || true
  ufw delete allow 443/tcp 2>/dev/null || true
  ufw delete allow http 2>/dev/null || true
  ufw delete allow https 2>/dev/null || true

  for ip in $IPV4_LIST; do
    ufw allow proto tcp from "$ip" to any port 80,443 comment 'Cloudflare IPv4'
  done

  for ip in $IPV6_LIST; do
    ufw allow proto tcp from "$ip" to any port 80,443 comment 'Cloudflare IPv6'
  done

  echo "[+] Activando UFW..."
  ufw reload
  echo "[✓] Firewall UFW configurado exitosamente. Todo tráfico directo ajeno a Cloudflare en 80/443 será bloqueado."

elif command -v iptables >/dev/null 2>&1; then
  echo "[+] Configurando iptables..."

  IPV4_LIST=$(curl -s https://www.cloudflare.com/ips-v4)

  iptables -N CLOUDFLARE 2>/dev/null || iptables -F CLOUDFLARE

  for ip in $IPV4_LIST; do
    iptables -A CLOUDFLARE -p tcp -s "$ip" -m multiport --dports 80,443 -j ACCEPT
  done

  iptables -A CLOUDFLARE -p tcp -m multiport --dports 80,443 -j DROP
  iptables -C INPUT -j CLOUDFLARE 2>/dev/null || iptables -I INPUT -p tcp -m multiport --dports 80,443 -j CLOUDFLARE

  echo "[✓] Reglas iptables configuradas exitosamente."
else
  echo "[!] No se detectó ufw ni iptables en el sistema."
  exit 1
fi
