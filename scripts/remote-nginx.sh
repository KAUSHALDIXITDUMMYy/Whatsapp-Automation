#!/bin/bash
set -euo pipefail

API_HOST="38-248-12-151.sslip.io"
SITE="/etc/nginx/sites-available/cable-crm-api"

sudo tee "$SITE" > /dev/null <<EOF
server {
    listen 80;
    server_name ${API_HOST};

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

sudo ln -sf "$SITE" /etc/nginx/sites-enabled/cable-crm-api
sudo nginx -t
sudo systemctl reload nginx

if ! command -v certbot >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx
fi

sudo certbot --nginx -d "${API_HOST}" --non-interactive --agree-tos --register-unsafely-without-email --redirect || true

echo "API URL: https://${API_HOST}"
