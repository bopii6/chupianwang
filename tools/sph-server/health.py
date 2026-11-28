#!/usr/bin/env python3.11
"""自愈巡检：解析服务挂了就拉起来；元宝 Cookie 掉了就重新取；取不到就标记"需要扫码"并告警。

由 systemd timer 每 10 分钟跑一次。结果写到 /opt/sph/health.json。

告警（可选）：环境变量 SPH_ALERT_WEBHOOK 填企业微信/钉钉/飞书的群机器人地址，
只在"需要人工扫码"这种自己解决不了的时候发一条，避免刷屏。
"""
from __future__ import annotations

import json
import os
import subprocess
import time
import urllib.request

API = "http://127.0.0.1:2022"
WXCD_DIR = "/opt/sph/bin"
STATE = "/opt/sph/health.json"
NEED_SCAN = "/opt/sph/needs_scan"
LOCK = "/opt/sph/login.lock"
WEBHOOK = os.environ.get("SPH_ALERT_WEBHOOK", "").strip()


def http_json(url, timeout=6):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.load(r)


def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True)


def wxcd_alive():
    try:
        http_json(f"{API}/api/status", 4)
        return True
    except Exception:  # noqa: BLE001
        return False


def sph_available():
    try:
        data = http_json(f"{API}/api/scraper/platform/status", 8)
        sph = next((x for x in data.get("data", {}).get("statuses", []) if x.get("key") == "wxchannels:sph"), {})
        return bool(sph.get("available")), sph.get("reason", "")
    except Exception as e:  # noqa: BLE001
        return False, str(e)


def start_wxcd():
    subprocess.Popen([os.path.join(WXCD_DIR, "wx_video_download")], cwd=WXCD_DIR,
                     stdout=open("/var/log/wxcd.log", "a"), stderr=subprocess.STDOUT, start_new_session=True)


def alert(text):
    """只在需要人来处理时发一条。没配 webhook 就只写日志。"""
    print(f"[告警] {text}")
    if not WEBHOOK:
        return
    payload = {"msgtype": "text", "text": {"content": text}}
    if "feishu" in WEBHOOK:
        payload = {"msg_type": "text", "content": {"text": text}}
    req = urllib.request.Request(WEBHOOK, data=json.dumps(payload).encode(),
                                 headers={"content-type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=8)
    except Exception as e:  # noqa: BLE001
        print(f"[告警] 发不出去：{e}")


def main():
    out = {"at": time.strftime("%Y-%m-%d %H:%M:%S"), "actions": []}
    if not wxcd_alive():
        out["actions"].append("wxcd 没在跑，拉起")
        sh("pkill -f wx_video_download")
        time.sleep(1)
        start_wxcd()
        for _ in range(10):
            time.sleep(1)
            if wxcd_alive():
                break

    ok, reason = sph_available()
    out["sph"] = ok
    out["reason"] = reason
    locked = os.path.exists(LOCK) and time.time() - os.path.getmtime(LOCK) < 900
    already_warned = os.path.exists(NEED_SCAN) and time.time() - os.path.getmtime(NEED_SCAN) < 6 * 3600

    if not ok and locked:
        out["waiting_human"] = "有人正在扫码登录，不去抢浏览器"
    elif not ok and already_warned:
        out["waiting_human"] = "已经判定需要重新扫码，先不重复折腾浏览器"
    elif not ok:
        out["actions"].append(f"视频号通道不可用（{reason}），重新取 Cookie")
        r = sh("/usr/bin/python3.11 /opt/sph/refresh_cookie.py 2>&1 | tail -n 3")
        out["refresh"] = (r.stdout or "").strip()
        ok2, reason2 = sph_available()
        out["sph_after"] = ok2
        if ok2:
            for f in (NEED_SCAN,):
                try:
                    os.remove(f)
                except OSError:
                    pass
        else:
            open(NEED_SCAN, "w").write(time.strftime("%Y-%m-%d %H:%M:%S"))
            out["needs_scan"] = True
            alert(f"视频号转存需要重新扫码登录元宝（{reason2 or reason}）。"
                  f"在服务器上跑：/usr/bin/python3.11 /opt/sph/login_qr.py，然后把 /opt/sph/qr.png 发给负责人扫码。")
    elif ok:
        for f in (NEED_SCAN,):
            if os.path.exists(f):
                os.remove(f)

    json.dump(out, open(STATE, "w"), ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
