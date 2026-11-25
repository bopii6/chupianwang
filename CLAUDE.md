# 出片王（装在客户电脑上的本地版，以前叫“微信出片”）

用户大多不懂技术，回复用中文、说人话，少讲命令。用户说旧名字“微信出片”也照下面做。

## 常用口令
- “打开出片王”：运行 `打开出片王.bat`（后台启动服务 + 用 Chrome/Edge 打开 http://localhost:5173 ）。不要前台运行 `node server.js`，会把对话卡住。
- “关掉出片王”：`node scripts/open.mjs --stop`
- “更新出片王”：运行 `更新出片王.bat`（拉新版 + 补装依赖 + 重启；新版启动失败会自动退回上一版）
- “退回上一版”：`node scripts/update.mjs --rollback`
- 客户说出了问题：让他点页面右下角的版本号 →「复制诊断信息」，发到微信 bopii2024（页面上也写着）
- 第一次装 / 缺东西：`node scripts/setup.mjs`（npm 依赖、Python 的 edge-tts、听写模型、.env，可反复运行）

## 出问题先看
- 服务日志：`server.log`
- 打不开 AI：`.env` 里 `DEEPSEEK_API_KEY` 没填
- 没声音 / 配音失败：Python 或 edge-tts 没装好，运行 setup
- 扫描件 PDF / 图片 / 老版 .doc .ppt 读不出字：这些要“识图”，用的也是 DeepSeek 密钥（没填、填错、余额不足都会失败）；`server.log` 里搜 `[识图]`
- “用别人的爆款做”卡在下载模型：`.cache/models/web/onnx-community/whisper-base/` 不全，运行 setup

## 不要动
- `data/`、`文案库/样本/`、`works/` 是客户自己的数据，不进仓库，不要删
- 不要改项目代码；客户要改功能就记下来让他联系我们
