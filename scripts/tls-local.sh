#!/usr/bin/env bash
set -euo pipefail
umask 077
command -v mkcert >/dev/null || { echo 'Instala mkcert antes de ejecutar tls:local (macOS: brew install mkcert).' >&2; exit 1; }
TLS_DIRECTORY="${GYMTRACK_TLS_DIR:-$HOME/.local/share/gymtrack/tls}"
mkdir -p "$TLS_DIRECTORY"
# Genera la CA si todavía no existe y el certificado válido para los hosts locales.
mkcert -cert-file "$TLS_DIRECTORY/localhost.pem" -key-file "$TLS_DIRECTORY/localhost-key.pem" localhost 127.0.0.1 ::1
CA_DIRECTORY="$(mkcert -CAROOT)"
if [ "$(uname -s)" = Darwin ]; then
  # Confianza del usuario actual; no requiere instalar la CA para todos los usuarios.
  security add-trusted-cert -r trustRoot -k "$HOME/Library/Keychains/login.keychain-db" "$CA_DIRECTORY/rootCA.pem"
else
  mkcert -install
fi
cp "$CA_DIRECTORY/rootCA.pem" "$TLS_DIRECTORY/ca.pem"
chmod 600 "$TLS_DIRECTORY/localhost-key.pem"
echo 'HTTPS local preparado. Certificado, clave y CA pública fuera del repositorio.'
echo 'Reinicia los navegadores abiertos si todavía no reconocen la CA.'
