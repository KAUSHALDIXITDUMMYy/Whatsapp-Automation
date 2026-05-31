#!/bin/bash
set -euo pipefail
cd /opt/cable-crm/server

JWT=$(openssl rand -hex 32)
ADMIN=$(openssl rand -hex 32)

if grep -q '^CORS_ORIGIN=' .env; then
  sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://whatsapp-automation-7aoh.vercel.app|' .env
else
  echo 'CORS_ORIGIN=https://whatsapp-automation-7aoh.vercel.app' >> .env
fi

if grep -q '^SKIP_REDIS=' .env; then
  sed -i 's|^SKIP_REDIS=.*|SKIP_REDIS=false|' .env
else
  echo 'SKIP_REDIS=false' >> .env
fi

if grep -q '^NODE_ENV=' .env; then
  sed -i 's|^NODE_ENV=.*|NODE_ENV=production|' .env
else
  echo 'NODE_ENV=production' >> .env
fi

sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT}|" .env
sed -i "s|^ADMIN_JWT_SECRET=.*|ADMIN_JWT_SECRET=${ADMIN}|" .env

grep -q '^META_TEMPLATE_WELCOME=' .env || echo 'META_TEMPLATE_WELCOME=cable_welcome_onboard' >> .env
grep -q '^META_TEMPLATE_RECHARGE=' .env || echo 'META_TEMPLATE_RECHARGE=cable_recharge_reminder' >> .env

npm ci
npm run build
npm run db:migrate
npm run db:seed || true

pm2 delete cable-crm-api 2>/dev/null || true
pm2 start dist/index.js --name cable-crm-api
pm2 save

echo "API started on port 4000"
