import re

p = "/opt/sph/dl/cloud/app.py"
src = open(p, encoding="utf-8").read()
if "def sph_available" in src:
    print("already patched")
    raise SystemExit(0)

helper = '''
def sph_available() -> tuple[bool, str]:
    """视频号分享通道到底能不能用（元宝 Cookie 过期时这里是 False）。"""
    try:
        import json as _json
        import urllib.request

        with urllib.request.urlopen("http://127.0.0.1:2022/api/scraper/platform/status", timeout=4) as resp:
            data = _json.load(resp)
        sph = next((x for x in data.get("data", {}).get("statuses", []) if x.get("key") == "wxchannels:sph"), {})
        return bool(sph.get("available")), sph.get("reason", "")
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)

'''

marker = '@app.get("/api/health")'
assert marker in src, "health route not found"
src = src.replace(marker, helper + marker, 1)

old_ret = '    return {"ok": ok, "reason": reason, "needs_code": bool(ACCESS_CODE)}'
new_ret = ('    ready, why = sph_available() if ok else (False, reason)\n'
           '    return {"ok": ok, "reason": reason, "ready": ready, "ready_reason": why, "needs_code": bool(ACCESS_CODE)}')
assert old_ret in src, "return line not found"
src = src.replace(old_ret, new_ret, 1)

open(p, "w", encoding="utf-8").write(src)
print("patched ok")
