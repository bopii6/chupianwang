#!/usr/bin/env python3.11
"""取一条能用的元宝 Cookie，写进 wxcd 的配置，重启 wxcd，并自检。

为什么要真浏览器：无界面/裸 HTTP 拿到的 Cookie 缺 hy_token，
写进去只会让解析报「此内容暂时无法播放」。所以这里用 Xvfb + chromium 跑有界面浏览器。

用法：
  /usr/bin/python3.11 /opt/sph/refresh_cookie.py            # 取一次、写入、重启、自检
  /usr/bin/python3.11 /opt/sph/refresh_cookie.py --check     # 只看现在通道是否可用
  /usr/bin/python3.11 /opt/sph/refresh_cookie.py --pool 3    # 连取 3 条（结果存 cookie 池）
"""
from __future__ import annotations

import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.request

import websocket

WXCD_DIR = "/opt/sph/bin"
CFG = os.path.join(WXCD_DIR, "config.yaml")
API = os.environ.get("SPH_LOCAL_API", "http://127.0.0.1:2022")
PROFILE = "/opt/sph/browser"
DISPLAY = ":99"
CDP_PORT = 9333
CHROME = "/usr/bin/chromium-browser"
POOL_FILE = "/opt/sph/cookies.json"

def sh(cmd, **kw):
    return subprocess.run(cmd, shell=isinstance(cmd, str), capture_output=True, text=True, **kw)

def status():
    try:
        with urllib.request.urlopen(f"{API}/api/scraper/platform/status", timeout=6) as r:
            data = json.load(r)
        sph = next((x for x in data.get("data", {}).get("statuses", []) if x.get("key") == "wxchannels:sph"), {})
        return bool(sph.get("available")), sph.get("reason", "")
    except Exception as e:  # noqa: BLE001
        return False, f"抓包工具没在跑（{e}）"

def ensure_xvfb():
    if sh(f"pgrep -f 'Xvfb {DISPLAY}'").returncode == 0:
        return
    subprocess.Popen(["Xvfb", DISPLAY, "-screen", "0", "1280x900x24", "-nolisten", "tcp"],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    time.sleep(2)

class CDP:
    def __init__(self, url):
        self.ws = websocket.create_connection(url, timeout=20, suppress_origin=True)
        self.i = 0

    def call(self, method, params=None):
        self.i += 1
        self.ws.send(json.dumps({"id": self.i, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.i:
                if "error" in msg:
                    raise RuntimeError(msg["error"].get("message", "cdp error"))
                return msg.get("result", {})

def fetch_cookie(timeout=70):
    ensure_xvfb()
    sh(f"pkill -f 'user-data-dir={PROFILE}'")
    time.sleep(1)
    env = dict(os.environ, DISPLAY=DISPLAY)
    proc = subprocess.Popen([
        CHROME, "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
        f"--user-data-dir={PROFILE}", f"--remote-debugging-port={CDP_PORT}",
        "--remote-allow-origins=*", "--no-first-run", "--no-default-browser-check",
        "--disable-features=Translate", "https://yuanbao.tencent.com/",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True, env=env)

    ver = None
    for _ in range(40):
        time.sleep(1)
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json/version", timeout=3) as r:
                ver = json.load(r)
            break
        except Exception:  # noqa: BLE001
            continue
    if not ver:
        proc.kill()
        raise RuntimeError("浏览器没起来")

    cdp = CDP(ver["webSocketDebuggerUrl"])
    deadline = time.time() + timeout
    mine, names = [], []
    while time.time() < deadline:
        time.sleep(3)
        cookies = cdp.call("Storage.getCookies").get("cookies", [])
        mine = [c for c in cookies if re.search(r"(^|\.)tencent\.com$", str(c.get("domain", "")).lstrip("."))]
        names = [c["name"] for c in mine]
        if "hy_token" in names and "_qimei_uuid42" in names:
            break
    try:
        cdp.ws.close()
    except Exception:  # noqa: BLE001
        pass
    proc.kill()
    if not names:
        raise RuntimeError("没读到元宝 Cookie")
    if "hy_token" not in names:
        raise RuntimeError(f"没拿到 hy_token（只有 {len(names)} 条），这条 Cookie 不能用")
    return "; ".join(f"{c['name']}={c['value']}" for c in mine), len(mine)

def write_cookie(cookie):
    text = open(CFG, encoding="utf-8").read()
    text = re.sub(r'^(\s*)sphCookie:.*$', lambda m: f"{m.group(1)}sphCookie: '{cookie}'", text, count=1, flags=re.M)
    if "sphCookie:" not in text:
        raise RuntimeError("config.yaml 里没有 sphCookie 这一行")
    shutil.copyfile(CFG, CFG + ".bak")
    open(CFG, "w", encoding="utf-8").write(text)

def add_pool(cookie):
    pool = []
    if os.path.exists(POOL_FILE):
        try:
            pool = json.load(open(POOL_FILE))
        except Exception:  # noqa: BLE001
            pool = []
    if cookie not in pool:
        pool.insert(0, cookie)
    json.dump(pool[:5], open(POOL_FILE, "w"))
    return len(pool[:5])

def restart_wxcd():
    sh("pkill -f wx_video_download")
    time.sleep(2)
    subprocess.Popen([os.path.join(WXCD_DIR, "wx_video_download")], cwd=WXCD_DIR,
                     stdout=open("/var/log/wxcd.log", "a"), stderr=subprocess.STDOUT,
                     start_new_session=True)

LOCK = "/opt/sph/login.lock"

def login_pending():
    """有人正在扫码登录时，别去抢浏览器（会把登录窗口杀掉）。"""
    if not os.path.exists(LOCK):
        return False
    try:
        if time.time() - os.path.getmtime(LOCK) > 900:
            return False
    except OSError:
        return False
    return True


def main():
    args = sys.argv[1:]
    if "--force" not in args and login_pending():
        print("有登录窗口在等扫码，跳过这次自动续期")
        return 0
    if "--check" in args:
        ok, reason = status()
        print(json.dumps({"ok": ok, "reason": reason}, ensure_ascii=False))
        return 0 if ok else 1

    rounds = 1
    if "--pool" in args:
        rounds = int(args[args.index("--pool") + 1])

    best = None
    for i in range(rounds):
        print(f"▶ 第 {i + 1}/{rounds} 轮：开浏览器取元宝 Cookie", flush=True)
        cookie, n = fetch_cookie()
        print(f"  拿到 {n} 条，长度 {len(cookie)}", flush=True)
        pool_n = add_pool(cookie)
        print(f"  Cookie 池里现在有 {pool_n} 条", flush=True)
        if best is None:
            best = cookie
        if rounds > 1:
            time.sleep(5)

    write_cookie(best)
    print("▶ 已写入 config.yaml，重启抓包工具", flush=True)
    restart_wxcd()
    for _ in range(20):
        time.sleep(2)
        ok, reason = status()
        if ok:
            print("✓ 视频号通道可用")
            return 0
    print(f"× 还是不可用：{reason}")
    return 3

if __name__ == "__main__":
    sys.exit(main())
