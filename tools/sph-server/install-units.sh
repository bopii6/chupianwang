#!/bin/bash
# 部署/更新自建转存的三个脚本，并装好 systemd 单元（wxcd 守护 + 10 分钟巡检）
set -e
for f in refresh_cookie.py login_qr.py health.py; do
  sed -i "s/\r$//" /opt/sph/$f
done
chmod +x /opt/sph/*.py

cat > /etc/systemd/system/sph-wxcd.service <<'EOF'
[Unit]
Description=Sph wxcd parser (127.0.0.1:2022)
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/sph/bin
ExecStart=/opt/sph/bin/wx_video_download
Restart=always
RestartSec=5
StandardOutput=append:/var/log/wxcd.log
StandardError=append:/var/log/wxcd.log

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/sph-health.service <<'EOF'
[Unit]
Description=Sph self-heal check
After=sph-wxcd.service

[Service]
Type=oneshot
ExecStart=/usr/bin/python3.11 /opt/sph/health.py
StandardOutput=append:/var/log/sph-health.log
EOF

cat > /etc/systemd/system/sph-health.timer <<'EOF'
[Unit]
Description=Run sph health check every 10 minutes

[Timer]
OnBootSec=3min
OnUnitActiveSec=10min
AccuracySec=30s

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
# 接管手动起的 wxcd
pkill -f wx_video_download || true
sleep 2
systemctl enable --now sph-wxcd
systemctl enable --now sph-health.timer
sleep 5
systemctl is-active sph-wxcd sph-health.timer
curl -s --max-time 6 http://127.0.0.1:2022/api/status | head -c 120; echo
