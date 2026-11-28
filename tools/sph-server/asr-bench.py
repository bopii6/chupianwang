#!/usr/bin/env python3.11
"""服务端转写可行性实测：抽音轨 → faster-whisper 转 → 报耗时和文字长度。"""
import subprocess
import sys
import time

VIDEO = sys.argv[1] if len(sys.argv) > 1 else "/opt/sph/media/5393f2f016/5393f2f016.mp4"
WAV = "/tmp/asr-test.wav"

t0 = time.time()
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", VIDEO,
                "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", WAV], check=True)
t_ff = time.time() - t0
print(f"抽音轨 {t_ff:.1f}s", flush=True)

from faster_whisper import WhisperModel

t1 = time.time()
model = WhisperModel("/opt/sph/fw-base", device="cpu", compute_type="int8", cpu_threads=4)
print(f"加载模型 {time.time() - t1:.1f}s", flush=True)

t2 = time.time()
segments, info = model.transcribe(WAV, language="zh", beam_size=1, vad_filter=True)
texts = []
for seg in segments:
    texts.append(seg.text)
    if len(texts) % 10 == 0:
        print(f"  …{len(texts)} 段，{time.time() - t2:.0f}s", flush=True)
dur = time.time() - t2
text = "".join(texts).strip()
print(f"转写 {dur:.1f}s，音频 {info.duration:.1f}s，加速比 {info.duration / max(dur, 0.1):.1f}x")
print(f"字数 {len(text)}")
print("开头:", text[:120])
