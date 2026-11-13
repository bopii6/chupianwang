# 一键出片（原型）

给教培机构和个人用的竖屏视频自助出片工具。客户选一个「形式」，写一句话，AI 写文案、自动配音，**在客户自己电脑的浏览器里渲染出 MP4**。

## 运行

```bash
npm install
```

```bash
node server.js
```

然后用电脑上的 Chrome 或 Edge 打开 http://localhost:5173

- 配音：开发期用 `edge-tts`（需要 `pip install edge-tts`）。**商用前要换成微软 Azure 语音服务**。
- AI 文案：把 `.env.example` 复制成 `.env`，填入 `DEEPSEEK_API_KEY=...`。不填也能用「先看示例」体验。

## 目录

| 路径 | 作用 |
|---|---|
| `server.js` | 轻量服务端：静态文件、配音、DeepSeek 代理（密钥不下发到浏览器） |
| `prompts/<形式>.md` | 每种形式给 AI 的编导规则（结构） |
| `public/forms/<形式>.js` | 每种形式的画面（版式、模块、皮肤、动画节奏） |
| `public/forms/registry.js` | 形式库：画廊里显示哪些形式、属于哪个分类 |
| `public/engine/` | 通用引擎：时间轴 + 配音拼接、MP4 导出 |
| `public/samples/` | 每种形式的示例文案 |
| `形式库/` | 每种形式的说明书（从对标样片拆出来的“灵魂”） |
| `文案库/` | 爆款获客文案样本 + 违禁词规则；拆解工作台在 http://localhost:5173/admin/copy.html（见 `文案库/说明书.md`） |
| `public/engine/asr*.js` + `prompts/remix-plan.md` | 爆款变原创：客户上传对标视频，浏览器里转文字，AI 拆出为什么火，照打法换成客户行业重写（见下方「爆款变原创」） |

## 新增一种形式

1. 在 `形式库/` 写说明书（拆对标样片）
2. 写 `prompts/<id>.md`（AI 怎么按这个结构写文案）
3. 写 `public/forms/<id>.js`，导出 `meta`、`skins`、`plan()`、`drawFrame()`、`preloadFonts()`
4. 在 `registry.js` 里登记，并放一份示例到 `public/samples/`

## 爆款变原创（首页“别人的爆款文案 + 你的行业 + 获客模板 = 你的原创视频”）

对客户的说法是一个等式：别人的爆款文案 + 你的行业 + 获客模板 = 你的原创视频（画面用出片王的模板）。界面上不用“复刻”这个词，免得客户以为连画面都照搬；要和原视频一样的画面走 899 定制。

流程：客户上传视频 → **浏览器里**拆出音轨、转成文字（视频不上传）→ `/api/remix-plan` 拆出“为什么火 + 打法 + 推荐模板” → 客户填“做什么培训的” → `/api/script` 带上原文稿照打法重写 → 正常出片。

- **转文字全在客户电脑上跑**：transformers.js + Whisper base 量化版（约 77MB，第一次使用时下载，浏览器会缓存）。2 分钟视频大约 50 秒（16 核电脑实测 112 秒视频 52 秒；核数少的电脑会慢一些）。有少量同音错字，AI 改写时按上下文理解。
- **模型文件**放在 `.cache/models/web/onnx-community/whisper-base/`，换电脑要重新下载（huggingface.co 的 `onnx-community/whisper-base`：10 个配置文件 + `onnx/encoder_model_quantized.onnx` + `onnx/decoder_model_merged_quantized.onnx`）。同目录下还有更准但慢 2.5 倍的 `whisper-small`（250MB），在 `.env` 里写 `ASR_MODEL=whisper-small` 可切换。
- **正式上线**：77MB 模型最好放到对象存储/CDN，在 `.env` 写 `ASR_MODEL_BASE=https://你的CDN/asr/`（目录结构同上，CDN 要允许跨域），不占服务器带宽。
- 页面开启了跨源隔离（`Cross-Origin-Embedder-Policy: credentialless`），转文字才能用多线程；外站图片（Pexels）不受影响。
- MP4/MOV 用 mp4box + WebCodecs 解出音轨（2 分钟视频约 1 秒）；其它格式退回浏览器自带解码。
- 重写后服务端自动检查：和原文连续 8 个字相同（照抄）或命中 `文案库/违禁词.json` 里“违法”级的说法，会带着问题让 AI 重写一次。
- **手机扫码上传**（上传页“视频在手机上？扫码传过来”）：电脑上出二维码 → 手机打开 `/m/up.html` 选视频 → **在手机上**拆出声音，只上传 16kHz 声音（约 2MB/分钟，不传视频）→ 服务端 `lib/relay.js` 暂存，电脑取走后立刻删除，二维码 30 分钟有效。本机开发时二维码里自动换成电脑的局域网地址，手机要连同一个 Wi-Fi；Windows 第一次可能弹防火墙提示，要允许 node 访问网络。
- 手机端在 HTTPS 下用快速解码（约 1 秒）；本机开发走 http 局域网地址时浏览器不给用，会退回慢的解码（2 分钟视频约 20 秒），正式上线有 HTTPS 就没这个问题。

## 登录（邮箱验证码）

随便看、点灵感、选模板都不用登录；点“生成”或上传别人的爆款视频时才弹出登录框，登录完自动接着做。新用户记 3 条免费试做（目前只记录，还没扣次数）。

- 服务端 `lib/auth.js`：发 6 位验证码（10 分钟有效，同一邮箱 60 秒发一次，一个码最多试 5 次，同一 IP 每小时最多 20 次），登录状态是签名 cookie，30 天有效。没登录时 `/api/script`、`/api/remix-plan` 返回 401。
- 用户数据在 `data/users/<id>.json`（邮箱、注册时间、试用次数）。签名密钥优先用 `.env` 的 `SESSION_SECRET`，没有就自动生成 `data/.session-secret`。**`data/` 要备份，不要上传到公开仓库。**
- **发信邮箱**（在 `.env` 里配）：
  ```
  SMTP_HOST=smtp.qq.com
  SMTP_PORT=465
  SMTP_USER=你的邮箱@qq.com
  SMTP_PASS=邮箱的 SMTP 授权码（不是登录密码）
  MAIL_FROM=出片王 <你的邮箱@qq.com>
  ```
  QQ 邮箱、163 邮箱都能免费开 SMTP（个人邮箱每天能发几百封，起步够用）；量大了换阿里云邮件推送。
- **没配发信邮箱时是开发模式**：验证码打印在服务端日志里；本机访问时登录框里直接显示并自动填好，方便自己测试。
