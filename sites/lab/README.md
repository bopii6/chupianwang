# 王总的项目橱窗（lab.getcut.cn）

这是可预览的静态站，文件根目录就是本目录。本次只准备文件，**不要在未获明确批准时改 DNS、SSH 到生产机，或改生产 Caddy**。

## 本地预览

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory /workspace/lab-getcut
```

然后打开 http://127.0.0.1:8765/

## 路径

- `/` 橱窗首页
- `/donggan/` 动感岛（静态体感小游戏，模型在 `donggan/vendor/`）
- `/动感岛/` 跳转到 `/donggan/`
- `/learnloop/` `/chuhai/` `/jianji/` `/maitian/` `/planner/` 介绍页
- 出片王、火影人物关系图谱只外链，不在本站部署

## 上线还差什么（需另做，不在这次范围内）

1. 为 `lab.getcut.cn` 添加 DNS 解析，指向计划中的服务器。
2. 在 Caddy（或同类反向代理）上为该子域名配置静态根目录和 HTTPS。动感岛摄像头必须走 HTTPS（localhost 预览除外）。
3. 把本目录同步到服务器，注意不要把转码/模型进程和本机密钥目录一并拷上去。
4. 橱窗页不加 ICP；备案号只留在主站 getcut.cn。
