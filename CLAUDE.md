# 微信出片（装在客户电脑上的本地版）

用户大多不懂技术，回复用中文、说人话，少讲命令。

## 常用口令
- “打开微信出片”：运行 `打开微信出片.bat`（后台启动服务 + 用 Chrome/Edge 打开 http://localhost:5173 ）。不要前台运行 `node server.js`，会把对话卡住。
- “关掉微信出片”：`node scripts/open.mjs --stop`
- “更新微信出片”：运行 `更新微信出片.bat`（git pull + 补装依赖 + 重启）
- 第一次装 / 缺东西：`node scripts/setup.mjs`（npm 依赖、Python 的 edge-tts、听写模型、.env，可反复运行）

## 出问题先看
- 服务日志：`server.log`
- 打不开 AI：`.env` 里 `DEEPSEEK_API_KEY` 没填
- 没声音 / 配音失败：Python 或 edge-tts 没装好，运行 setup
- “用别人的爆款做”卡在下载模型：`.cache/models/web/onnx-community/whisper-base/` 不全，运行 setup

## 不要动
- `data/`、`文案库/样本/`、`works/` 是客户自己的数据，不进仓库，不要删
- 不要改项目代码；客户要改功能就记下来让他联系我们
