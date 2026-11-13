# 文案库：把视频/音频转成文字（本机 faster-whisper，CPU 运行，不上传到任何第三方）
# 用法：python scripts/transcribe.py <文件路径>
# 输出（stdout，一行 JSON）：{"text": "...", "duration": 秒, "lines": [{"start":0.0,"end":2.1,"text":"..."}]}
import json
import os
import sys

# 国内网络下载模型走镜像；已缓存过的模型不会再下载
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")


def to_simplified(text):
    try:
        import zhconv  # 可选：装了就把繁体转简体
        return zhconv.convert(text, "zh-cn")
    except Exception:
        return text


def to_full_width(text):
    # Whisper 常输出半角标点，中文口播统一成全角（小数点不动）
    import re
    for a, b in ((",", "，"), (r"\?", "？"), ("!", "！"), (";", "；"), (":", "：")):
        text = re.sub(a + r"\s*", b, text)
    return re.sub(r"(?<!\d)\.(?!\d)\s*", "。", text)


def load_audio(path):
    # 用 ffmpeg 解码成 16kHz 单声道（不依赖 PyAV：faster-whisper 自带的解码和新版 PyAV 不兼容）
    import subprocess
    import numpy as np
    ffmpeg = os.environ.get("FFMPEG", "ffmpeg")
    try:
        p = subprocess.run([ffmpeg, "-nostdin", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                           capture_output=True, check=False)
    except FileNotFoundError:
        sys.stderr.write("没找到 ffmpeg：请先安装 ffmpeg 并加入 PATH（或在 .env 里设置 FFMPEG=ffmpeg.exe 的完整路径）\n")
        sys.exit(3)
    if p.returncode != 0 or not p.stdout:
        detail = (p.stderr.decode("utf-8", "ignore").strip().splitlines() or [""])[-1]
        sys.stderr.write(f"这个文件读不出声音 {detail}\n")
        sys.exit(3)
    return np.frombuffer(p.stdout, np.float32).copy()


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "缺少文件路径"}, ensure_ascii=False))
        sys.exit(1)
    from faster_whisper import WhisperModel

    model_name = os.environ.get("WHISPER_MODEL", "small")
    threads = max(1, (os.cpu_count() or 4) - 1)
    # 优先用项目里放好的模型（.cache/models/faster-whisper-small/model.bin）；
    # 其次用 huggingface 缓存，但不联网下载——下载 480MB 会让网页请求一直卡着，没有就直接报错说明
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    local_dir = os.path.join(root, ".cache", "models", f"faster-whisper-{model_name}")
    try:
        if os.path.isfile(os.path.join(local_dir, "model.bin")):
            model = WhisperModel(local_dir, device="cpu", compute_type="int8", cpu_threads=threads)
        else:
            model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=threads, local_files_only=True)
    except Exception:
        sys.stderr.write(f"语音识别模型还没下载好：需要把 faster-whisper-{model_name} 放到 .cache/models/ 下（见 文案库/说明书.md）\n")
        sys.exit(2)
    segments, info = model.transcribe(
        load_audio(sys.argv[1]),
        language="zh",
        beam_size=5,
        vad_filter=True,
        # 提示模型输出简体中文、带标点（Whisper 中文默认常常没有标点或出繁体）
        initial_prompt="以下是普通话的短视频口播，使用简体中文，句子之间有逗号和句号。",
    )
    lines = []
    for s in segments:
        t = to_full_width(to_simplified(s.text.strip()))
        if t:
            lines.append({"start": round(s.start, 2), "end": round(s.end, 2), "text": t})
    # 每个分段补一个句末标点，拼成一段可读的口播稿
    out = []
    for l in lines:
        t = l["text"]
        out.append(t if t[-1] in "，。！？；…,.!?" else t + "，")
    text = "".join(out)
    if text.endswith("，"):
        text = text[:-1] + "。"
    sys.stdout.buffer.write(json.dumps({"text": text, "duration": round(info.duration, 1), "lines": lines}, ensure_ascii=False).encode("utf-8"))


if __name__ == "__main__":
    main()
