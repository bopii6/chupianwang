"""批量配音：一次启动，并发合成多句（开发期用 edge-tts，商用请换 Azure 语音服务）。

stdin 输入 JSON：{"voice": "...", "rate": "+8%", "items": [{"text": "...", "out": "绝对路径.mp3"}]}
"""
import asyncio
import json
import os
import sys

import edge_tts

CONCURRENCY = 8
# 单句最多等这么久。微软那边偶尔“连上了但一句不回”，没有超时就会把整批卡死
# （2026-11-24 实测：56 句里 55 句 20 秒内就好了，剩 1 句挂了 10 分钟，页面一直转圈）
ATTEMPT_TIMEOUT = 20


async def synth_one(sem, item, voice, rate):
    async with sem:
        last = None
        for attempt in range(3):
            tmp = f"{item['out']}.{os.getpid()}.tmp"
            try:
                await asyncio.wait_for(
                    edge_tts.Communicate(item["text"], voice, rate=rate).save(tmp),
                    timeout=ATTEMPT_TIMEOUT,
                )
                os.replace(tmp, item["out"])
                return
            except Exception as e:  # noqa: BLE001 网络抖动时重试
                last = e if str(e) else type(e).__name__
                try:
                    os.unlink(tmp)
                except OSError:
                    pass
                await asyncio.sleep(0.8 * (attempt + 1))
        raise RuntimeError(f"配音失败：{item['text'][:20]}… {last}")


async def main():
    job = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    sem = asyncio.Semaphore(CONCURRENCY)
    await asyncio.gather(*(synth_one(sem, it, job["voice"], job["rate"]) for it in job["items"]))


if __name__ == "__main__":
    asyncio.run(main())
