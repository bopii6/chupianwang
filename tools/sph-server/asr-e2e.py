#!/usr/bin/env python3.11
"""端到端测服务端转写：提交本机文件 → 轮询 → 打印耗时/字数/开头。"""
import json
import sys
import time
import urllib.request

API = "http://127.0.0.1:8002"
FILE = sys.argv[1] if len(sys.argv) > 1 else "/opt/sph/media/5393f2f016/5393f2f016.mp4"

req = urllib.request.Request(API + "/api/asr", data=json.dumps({"file": FILE}).encode(),
                             headers={"content-type": "application/json"})
t0 = time.time()
job = json.load(urllib.request.urlopen(req, timeout=30))
print("任务", job["id"], flush=True)
data = {}
while time.time() - t0 < 900:
    time.sleep(3)
    data = json.load(urllib.request.urlopen(f"{API}/api/asr/{job['id']}", timeout=30))
    if data.get("status") in ("done", "error"):
        break
print("状态", data.get("status"), "阶段", data.get("phase"), "总耗时", round(time.time() - t0, 1), "s")
print("音频", data.get("duration"), "s | 转写", data.get("took"), "s | 字数", data.get("chars"))
print("错误", data.get("error") or "无")
print("开头:", (data.get("text") or "")[:100])
