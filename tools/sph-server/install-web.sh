#!/bin/bash
# 在 getcut 服务器上装"自建转存"：Web 服务（:8001）+ 目录 + 密钥
set -e
mkdir -p /opt/sph/media
CODE=$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')
cat > /opt/sph/web.env <<EOF
SPH_MEDIA_DIR=/opt/sph/media
SPH_KEEP_HOURS=24
SPH_MAX_WORKERS=2
SPH_DAILY_LIMIT=300
SPH_ACCESS_CODE=$CODE
EOF
chmod 600 /opt/sph/web.env

cat > /etc/systemd/system/sph-web.service <<'EOF'
[Unit]
Description=Sph transfer web (self-hosted)
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/sph/dl
EnvironmentFile=/opt/sph/web.env
Environment=PYTHONIOENCODING=utf-8
ExecStart=/usr/bin/python3.11 -m uvicorn cloud.app:app --app-dir /opt/sph/dl --host 127.0.0.1 --port 8001
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now sph-web
sleep 6
systemctl is-active sph-web
curl -s --max-time 8 http://127.0.0.1:8001/api/health; echo
grep -c . /opt/sph/web.env
