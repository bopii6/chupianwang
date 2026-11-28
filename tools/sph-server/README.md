# getcut 服务器上的转存 / 转写脚本

这些文件不是给客户运行的，是**线上那台服务器（115.190.113.128）在跑的东西**，
放在仓库里只是为了别忘了它们、换机器时能照着重装。实际运行位置在 `/opt/sph/`。

## 部署位置对照

| 仓库里的文件 | 服务器上的位置 | 说明 |
|---|---|---|
| `asr_app.py` | `/opt/sph/asr_app.py` | 服务端转写（faster-whisper），127.0.0.1:8002 |
| `health.py` | `/opt/sph/health.py` | 10 分钟巡检：解析服务挂了拉起、元宝 Cookie 掉了自动续 |
| `refresh_cookie.py` | `/opt/sph/refresh_cookie.py` | 用 Xvfb + chromium 取元宝 Cookie，写进 wxcd 配置 |
| `login_qr.py` | `/opt/sph/login_qr.py` | 需要人工扫码时用，二维码刷到 `/opt/sph/qr.png` |
| `install-web.sh` | — | 装转存 Web（uvicorn :8001，带访问码，读 `web.env`） |
| `install-units.sh` | — | 装 systemd：`sph-wxcd` / `sph-health.timer` |
| `install-asr.sh` | — | 装 systemd：`sph-asr` + opencc（繁体转简体） |
| `patch-app2.py` | — | 给 `cloud/app.py` 的 `/api/health` 加 `ready` 字段（就绪探测） |
| `e2e.py` / `probe_link.py` | `/opt/sph/` | 查一条链接：能不能下、多长、多大 |
| `asr-e2e.py` / `asr-bench.py` | `/opt/sph/` | 转写端到端 + 单独压测（录音时长 / 转写耗时） |
| `pub-transcribe.mjs` | 本机跑 | 走公网 `https://getcut.cn` 验证转写，用完自动删临时账号 |

## 依赖（服务器上一次性装好）

```bash
# 解析服务（Linux 版 wx_video_download）
/opt/sph/bin/wx_video_download          # 从 GitHub release 下的 linux_x86_64 包

# Python（CentOS Stream 9 自带 3.9 跑不了 dataclass(slots=True)，要 3.11）
dnf -y install python3.11 python3.11-pip
/usr/bin/python3.11 -m pip install fastapi uvicorn requests pyyaml websocket-client faster-whisper opencc-python-reimplemented
dnf -y install chromium xorg-x11-server-Xvfb

# 转写模型（CTranslate2 格式，142MB，从本机 scp 上去比服务器直连 HF 快得多）
/opt/sph/fw-base/{config.json,tokenizer.json,vocabulary.txt,model.bin}
```

## 端口与单元

| 端口 | 进程 | systemd |
|---|---|---|
| 2022 | `wx_video_download` | `sph-wxcd` |
| 8001 | `cloud/app.py`（转存 Web，带访问码） | `sph-web` |
| 8002 | `asr_app.py`（转写，只监听 127.0.0.1） | `sph-asr` |

出片王通过环境变量接上它们（`/opt/chupianwang/.env`）：

```
SPH_API=http://127.0.0.1:8001
SPH_CODE=...
SPH_API_FALLBACK=http://8.140.220.104:8000
SPH_CODE_FALLBACK=sph-2026
ASR_API=http://127.0.0.1:8002     # 不填默认也是这个
```

## 三个坑（都踩过）

1. **`sed -i "s/\r$//"` 会吃掉行尾的 r**：这台机器上的 sed 把 `\r` 当成普通字符 `r`，
   于是 `CookieJar` 变 `CookieJa`、`sph-asr` 变 `sph-as`。传脚本上来要去 CRLF 请用
   `tr -d '\r' < f > f.tmp && mv f.tmp f`。
2. **Linux 版 wxcd 的键名是驼峰 `sphCookie`**，写成小写 `sphcookie` 不报错，只表现为「缺少 Cookie」。
3. **元宝 Cookie 不是登录才有**，但无界面浏览器取到的会缺 `hy_token`，用了就报
   「此内容暂时无法播放」。必须 Xvfb + 有界面 Chromium，取不到 hy_token 宁可报错也不要写入。
