"""服务端转写：把已经下到本机的一部视频抽音轨，用 faster-whisper 转成文字。

给出片王的 /api/copy/transcribe 用，只监听 127.0.0.1:8002，不对外。

设计取舍：
* 客户浏览器不用下 78MB 听写模型，只等结果；
* 一次只跑一个任务（CPU 4 核，跑一个已经吃满），多的排队；
* 转完统一转成简体（whisper 中文经常输出繁体）；
* 输出按句切分并保留时间戳，以后做字幕能用。
"""
import json
import os
import subprocess
import threading
import time
import uuid
from collections import OrderedDict
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

MODEL_DIR = os.environ.get("ASR_MODEL_DIR", "/opt/sph/fw-base")
MAX_SECONDS = int(os.environ.get("ASR_MAX_SECONDS", "3600"))
ALLOW_PREFIX = ("/opt/sph/media/", "/opt/chupianwang/.cache/sph-cache/")
JOBS = OrderedDict()
QUEUE = threading.Semaphore(1)

app = FastAPI(title="asr", docs_url=None, redoc_url=None)


def _ffmpeg_wav(src: str, dst: str) -> float:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-vn",
                    "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", dst], check=True)
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=noprint_wrappers=1:nokey=1", dst],
                         capture_output=True, text=True, check=True)
    return float((out.stdout or "0").strip() or 0)


def _to_simplified(text: str) -> str:
    try:
        from opencc import OpenCC
        return OpenCC("t2s").convert(text)
    except Exception:  # noqa: BLE001
        return text


def _worker(job_id: str, src: str) -> None:
    with QUEUE:
        job = JOBS[job_id]
        job.update(status="running", phase="audio")
        wav = f"/tmp/asr-{job_id}.wav"
        try:
            duration = _ffmpeg_wav(src, wav)
            job["duration"] = round(duration, 1)
            if duration > MAX_SECONDS:
                raise RuntimeError(f"视频太长（{duration / 60:.0f} 分钟），服务端最多处理 {MAX_SECONDS // 60} 分钟")

            job["phase"] = "load"
            from faster_whisper import WhisperModel
            model = WhisperModel(MODEL_DIR, device="cpu", compute_type="int8", cpu_threads=4)

            job["phase"] = "transcribe"
            started = time.time()
            segments, _info = model.transcribe(wav, language="zh", beam_size=1, vad_filter=True)
            lines = []
            texts = []
            for seg in segments:
                piece = (seg.text or "").strip()
                if not piece:
                    continue
                texts.append(piece)
                lines.append({"start": round(seg.start, 2), "end": round(seg.end, 2), "text": piece})
                job["done"] = len(lines)

            text = _to_simplified("".join(texts)).strip()
            job.update(status="done", phase="done", text=text, segments=lines,
                       took=round(time.time() - started, 1), chars=len(text))
            print(f"[asr] {job_id} 完成：{duration:.0f}s 音频 / {job.get('took')}s 转写 / {len(text)} 字", flush=True)
        except Exception as exc:  # noqa: BLE001
            job.update(status="error", error=str(exc)[:300])
            print(f"[asr] {job_id} 失败：{exc}", flush=True)
        finally:
            try:
                os.remove(wav)
            except OSError:
                pass
            while len(JOBS) > 50:
                JOBS.popitem(last=False)


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "model": MODEL_DIR, "exists": Path(MODEL_DIR).exists()}


@app.post("/api/asr")
async def submit(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    src = str((body or {}).get("file") or "")
    if not src.startswith(ALLOW_PREFIX):
        raise HTTPException(400, "只接受本机转存目录里的文件")
    if not Path(src).exists():
        raise HTTPException(404, "文件不存在或已过期")
    job_id = uuid.uuid4().hex[:10]
    JOBS[job_id] = {"status": "queued", "phase": "audio", "created": time.time()}
    threading.Thread(target=_worker, args=(job_id, src), daemon=True).start()
    return {"id": job_id}


@app.get("/api/asr/{job_id}")
async def job(job_id: str) -> JSONResponse:
    data = JOBS.get(job_id)
    if not data:
        raise HTTPException(404, "任务不存在")
    return JSONResponse(data)
