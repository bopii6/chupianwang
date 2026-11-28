#!/usr/bin/env python3.11
"""查一条视频号链接：下得了吗、多长、多大。用法：python3.11 probe_link.py <链接>"""
import json
import sys
import time
import urllib.request

env = dict(l.split("=", 1) for l in open("/opt/sph/web.env").read().splitlines() if "=" in l)
CODE = env.get("SPH_ACCESS_CODE", "")
API = "http://127.0.0.1:8001"
LINK = sys.argv[1]


def post(path, payload):
    req = urllib.request.Request(API + path, data=json.dumps(payload).encode(),
                                 headers={"content-type": "application/json", "x-access-code": CODE})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def get(path):
    with urllib.request.urlopen(API + path, timeout=30) as r:
        return json.load(r)


t0 = time.time()
job = post("/api/jobs", {"url": LINK})
jid = job["id"]
print("任务", jid, flush=True)
data = {}
while time.time() - t0 < 200:
    time.sleep(2)
    data = get(f"/api/jobs/{jid}")
    if data.get("status") in ("done", "error"):
        break
print(json.dumps({k: data.get(k) for k in ("status", "title", "duration", "size", "size_label", "error")},
                 ensure_ascii=False, indent=1))
print("耗时", round(time.time() - t0), "秒")
