#!/usr/bin/env python3.11
"""在服务器上打开元宝登录二维码，等人扫；扫完把 Cookie 写进 wxcd 并自检。

用法：
  /usr/bin/python3.11 /opt/sph/login_qr.py            # 起二维码，最多等 5 分钟
  /usr/bin/python3.11 /opt/sph/login_qr.py --check    # 只看当前通道状态

二维码截图会不断刷新到 /opt/sph/qr.png（每 10 秒），用浏览器打开那个文件就能扫。
"""
from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request

import websocket

PROFILE = "/opt/sph/browser"
DISPLAY = ":99"
PORT = 9333
CHROME = "/usr/bin/chromium-browser"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
CFG = "/opt/sph/bin/config.yaml"
WXCD_DIR = "/opt/sph/bin"
API = "http://127.0.0.1:2022"
QR = "/opt/sph/qr.png"
LOCK = "/opt/sph/login.lock"


def sh(c):
    return subprocess.run(c, shell=True, capture_output=True, text=True)


def status():
    try:
        with urllib.request.urlopen(f"{API}/api/scraper/platform/status", timeout=6) as r:
            data = json.load(r)
        sph = next((x for x in data.get("data", {}).get("statuses", []) if x.get("key") == "wxchannels:sph"), {})
        return bool(sph.get("available")), sph.get("reason", "")
    except Exception as e:  # noqa: BLE001
        return False, f"抓包工具没在跑（{e}）"


class CDP:
    def __init__(self, url):
        self.ws = websocket.create_connection(url, timeout=30, suppress_origin=True)
        self.i = 0

    def call(self, method, params=None):
        self.i += 1
        self.ws.send(json.dumps({"id": self.i, "method": method, "params": params or {}}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == self.i:
                if "error" in m:
                    raise RuntimeError(m["error"].get("message", "cdp"))
                return m.get("result", {})

    def js(self, expr):
        return self.call("Runtime.evaluate", {"expression": expr, "returnByValue": True}).get("result", {}).get("value")


def main():
    if "--check" in sys.argv:
        ok, reason = status()
        print(json.dumps({"ok": ok, "reason": reason}, ensure_ascii=False))
        return 0 if ok else 1

    # 占个锁：这时候自动续期巡检不许抢浏览器，否则会把登录窗口杀掉
    import atexit
    open(LOCK, "w").write(str(os.getpid()))
    atexit.register(lambda: os.path.exists(LOCK) and os.remove(LOCK))

    if sh(f"pgrep -f 'Xvfb {DISPLAY}'").returncode != 0:
        subprocess.Popen(["Xvfb", DISPLAY, "-screen", "0", "1280x900x24"], stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, start_new_session=True)
        time.sleep(2)
    sh(f"pkill -f 'user-data-dir={PROFILE}'")
    time.sleep(1)
    env = dict(os.environ, DISPLAY=DISPLAY)
    subprocess.Popen([CHROME, "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
                      f"--user-data-dir={PROFILE}", f"--remote-debugging-port={PORT}",
                      "--remote-allow-origins=*", "--no-first-run", f"--user-agent={UA}",
                      "https://yuanbao.tencent.com/"],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True, env=env)

    page = None
    for _ in range(40):
        time.sleep(1)
        try:
            tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=3))
            page = next((t for t in tabs if t.get("type") == "page" and "yuanbao" in t.get("url", "")), None)
            if page:
                break
        except Exception:  # noqa: BLE001
            continue
    if not page:
        print("× 浏览器没起来")
        return 1
    cdp = CDP(page["webSocketDebuggerUrl"])
    time.sleep(8)
    # 点「登录」
    clicked = cdp.js("""(() => {
      const cands = [...document.querySelectorAll('button,div,span,a')]
        .filter(e => /^(Log In|登录|立即登录)$/i.test((e.innerText||'').trim()));
      if (!cands.length) return 'notfound';
      cands[0].click(); return 'clicked';
    })()""")
    print(f"点登录：{clicked}", flush=True)
    time.sleep(2)
    # 选微信扫码
    cdp.js("""(() => {
      const t = [...document.querySelectorAll('button,div,span,li')]
        .filter(e => /WeChat|微信/.test((e.innerText||'').trim()) && (e.innerText||'').trim().length < 12);
      if (t.length) t[0].click(); return t.length;
    })()""")

    deadline = time.time() + 300
    last_shot = 0
    while time.time() < deadline:
        png = cdp.call("Page.captureScreenshot", {"format": "png"})["data"]
        open(QR + ".tmp", "wb").write(base64.b64decode(png))
        os.replace(QR + ".tmp", QR)
        last_shot = time.time()
        cookies = cdp.call("Storage.getCookies")["cookies"]
        mine = [c for c in cookies if re.search(r"(^|\.)tencent\.com$", str(c.get("domain", "")).lstrip("."))]
        names = [c["name"] for c in mine]
        if "hy_token" in names:
            cookie = "; ".join(f"{c['name']}={c['value']}" for c in mine)
            print(f"✓ 登录成功，拿到 {len(mine)} 条 Cookie", flush=True)
            text = open(CFG, encoding="utf-8").read()
            text = re.sub(r'^(\s*)sphCookie:.*$', lambda m: f"{m.group(1)}sphCookie: '{cookie}'", text, count=1, flags=re.M)
            shutil.copyfile(CFG, CFG + ".bak")
            open(CFG, "w", encoding="utf-8").write(text)
            sh("pkill -f wx_video_download")
            time.sleep(2)
            subprocess.Popen([os.path.join(WXCD_DIR, "wx_video_download")], cwd=WXCD_DIR,
                             stdout=open("/var/log/wxcd.log", "a"), stderr=subprocess.STDOUT,
                             start_new_session=True)
            for _ in range(20):
                time.sleep(2)
                ok, reason = status()
                if ok:
                    print("✓ 视频号通道可用")
                    return 0
            print(f"× 通道还不可用：{reason}")
            return 3
        time.sleep(10)
    print("× 等超时了，二维码可能过期：重新跑一次")
    return 2


if __name__ == "__main__":
    sys.exit(main())
