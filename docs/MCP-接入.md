# 让 Agent 调出片王（MCP 接入）

出片王自带 MCP 端点，本机 Agent 可以直接调它出片，拿到**成片的本机绝对路径**，再由 Agent 自己把文件发出去（飞书/微信都是原生视频消息）。

> **不暴露公网。** 只在本机 127.0.0.1 上工作，返回体里不给任何链接——手机用流量打不开本机地址，给了只会误导人。

## 0. 前置（就一步）

双击 **`打开微信出片.bat`**。

这个脚本会用 `JOB_WORKER=1` 在后台起服务（`scripts/open.mjs` 第 38 行），worker 是必开的——没有它，`create_video` 会返回「未开启渲染 worker」。

**默认不弹窗口。** worker 启动 Chrome 时带 `--headless=new`，跑片时桌面上不会出现任何浏览器窗口。要看着它跑（调试、演示）才设 `JOB_HEADLESS=0`。

## 1. 出片要 30–90 秒，务必调大客户端超时

1 分钟片子实测：无头 **约 30 秒**，有窗口约 90 秒。片长翻倍、等待也翻倍。

多数 Agent 客户端默认工具超时只有 60 秒，会在服务端还在渲染时先判失败，看起来像"这工具没用"。按下面配。

### Claude Code

```bash
claude mcp add chupian -- node E:\出片王\tools\chupian-stdio-mcp.mjs
```

超时用环境变量（毫秒）：

```powershell
$env:MCP_TOOL_TIMEOUT="300000"; claude
```

或写进 `~/.claude.json`：

```json
{
  "mcpServers": {
    "chupian": {
      "command": "node",
      "args": ["E:\\出片王\\tools\\chupian-stdio-mcp.mjs"]
    }
  }
}
```

### Codex（`~/.codex/config.toml`）

```toml
[mcp_servers.chupian]
command = "node"
args = ["E:\\出片王\\tools\\chupian-stdio-mcp.mjs"]
tool_timeout_sec = 300
# 键名随版本略有差异；若这行报错就删掉，改用客户端自身的超时设置
```

### 通用 mcp.json（Cursor / Cline / Claude Desktop 等）

```json
{
  "mcpServers": {
    "chupian": {
      "command": "node",
      "args": ["E:\\出片王\\tools\\chupian-stdio-mcp.mjs"],
      "timeout": 300000
    }
  }
}
```

`timeout` 字段不是所有客户端都认（有的写在设置界面里、单位可能是秒或毫秒）。**认就填 300000（毫秒）或 300（秒），不认就到设置里找工具超时调到 300 秒以上。**

## 2. 它有哪些工具

| 工具 | 用途 |
|---|---|
| `list_formats` | 看有哪些视频形式（模板） |
| `create_video` | 按主题出片：`topic`（必填）、`format`（必填）、`minutes`（1/2/3）、`account`（画面上显示的账号名）、`inline` |
| `remix_video` | 按客户发来的对标片出片：`video_path`（本机绝对路径）、`industry` 或 `topic` |
| `list_works` | 列出作品墙里已导出的成片（返回本机路径） |
| `prepare_video` | 旧工具；worker 开着等同 `create_video`，没开只回一句提示 |

`create_video` 的返回长这样（**第一行就是文件路径**）：

```
E:\出片王\works\1794985838687_暑假补课3个真相.mp4
标题：暑假补课3个真相 · 时长：1 分钟 · 大小：9.2 MB
```

## 3. `inline` 参数（默认关，别开着跑常态出片）

`inline: true` 会在文字后面再附一个 base64 视频块。**只给小于 8MB 的短片/缩略图用**：20MB 视频转 base64 是 27MB 文本，多数客户端会截断或把上下文撑爆。超过 8MB 会被拒绝并说明原因。

日常出片**不要开 inline**，用第一行的路径读文件。

## 4. 排错

| 现象 | 原因 | 处理 |
|---|---|---|
| 返回「未开启渲染 worker」 | 服务是用 `node server.js` 手工起的 | 关掉，改用 `打开微信出片.bat` |
| 返回「本机出片服务没起来…」 | 5173 没在跑 | 双击 `打开微信出片.bat` |
| 客户端 60 秒报超时，但作品墙里多了片子 | 客户端超时小于出片耗时 | 按第 1 节调大超时 |
| 出片失败：AI 没配 key | `.env` 里缺 `DEEPSEEK_API_KEY` | 看 README 的「AI 文案」一节 |
