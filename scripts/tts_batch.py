"""批量配音：一次启动，并发合成多句（开发期用 edge-tts，商用请换 Azure 语音服务）。

stdin 输入 JSON：{"voice": "...", "rate": "+8%", "items": [{"text": "...", "out": "绝对路径.mp3"}]}
"""
import asyncio
import json
import os
import sys

import edge_tts

CONCURRENCY = 8


async def synth_one(sem, item, voice, rate):
    async with sem:
        last = None
        for attempt in range(3):
            tmp = f"{item['out']}.{os.getpid()}.tmp"
            try:
                await edge_tts.Communicate(item["text"], voice, rate=rate).save(tmp)
                os.replace(tmp, item["out"])
                return
            except Exception as e:  # noqa: BLE001 网络抖动时重试
                last = e
                await asyncio.sleep(0.8 * (attempt + 1))
        raise RuntimeError(f"配音失败：{item['text'][:20]}… {last}")


async def main():
    job = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    sem = asyncio.Semaphore(CONCURRENCY)
    await asyncio.gather(*(synth_one(sem, it, job["voice"], job["rate"]) for it in job["items"]))


if __name__ == "__main__":
    asyncio.run(main())
