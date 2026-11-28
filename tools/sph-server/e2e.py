#!/usr/bin/python3.11
"""自建转存端到端自检：提交一条真实链接 → 轮询 → 下载，打印耗时和大小。"""
import json
import re
import time
import urllib.request

env = dict(l.split("=", 1) for l in open("/opt/sph/web.env").read().splitlines() if "=" in l)
CODE = env.get("SPH_ACCESS_CODE", "")
API = "http://127.0.0.1:8001"
LINK = "https://weixin.qq.com/sph/Abxnctlunb"


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
print("状态", data.get("status"), "用时", round(time.time() - t0), "s", "标题",
      (data.get("title") or "")[:20], "大小", data.get("size_label"), flush=True)
if data.get("status") != "done":
    print("失败原因", data.get("error"))
else:
    with urllib.request.urlopen(f"{API}/media/{jid}", timeout=60) as r:
        buf = r.read()
    print("下载", len(buf), "字节")
