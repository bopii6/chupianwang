#!/bin/bash
set -e
/usr/bin/python3.11 -m pip install --quiet opencc-python-reimplemented > /root/opencc.log 2>&1 || echo "opencc 装失败（转简体会跳过）"

cat > /etc/systemd/system/sph-asr.service <<'EOF'
[Unit]
Description=Sph server-side ASR (faster-whisper)
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/sph
Environment=ASR_MODEL_DIR=/opt/sph/fw-base
Environment=ASR_MAX_SECONDS=3600
Environment=PYTHONIOENCODING=utf-8
ExecStart=/usr/bin/python3.11 -m uvicorn asr_app:app --app-dir /opt/sph --host 127.0.0.1 --port 8002
Restart=always
RestartSec=3
StandardOutput=append:/var/log/sph-asr.log
StandardError=append:/var/log/sph-asr.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now sph-asr
sleep 6
systemctl is-active sph-asr
curl -s --max-time 10 http://127.0.0.1:8002/api/health; echo
