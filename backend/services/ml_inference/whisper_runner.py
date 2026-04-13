"""Whisper ASR → audio_segment payloads (transformers or faster-whisper; optional Hub-offline)."""

from __future__ import annotations

import io
import logging
import os
import tempfile
from typing import Any

from core.config import Settings
from services.ml_inference.mappers import model_meta
from services.ml_inference.runtime_env import ml_annotation_source, transformers_local_kw, transformers_token

log = logging.getLogger("annotra.ml.whisper")


def _whisper_faster_whisper(
    audio_bytes: bytes,
    settings: Settings,
    meta: dict[str, Any],
) -> tuple[list[dict[str, Any]], float | None]:
    """CTranslate2 models on disk — no Hugging Face Hub when ML_OFFLINE and path is local."""
    try:
        import numpy as np
        import soundfile as sf
        import torch
        from faster_whisper import WhisperModel
    except ImportError:
        log.warning("faster_whisper_not_installed")
        return (
            [
                {
                    "start": 0.0,
                    "end": 1.0,
                    "label": "pip install faster-whisper",
                    **meta,
                }
            ],
            None,
        )

    wav, sr = sf.read(io.BytesIO(audio_bytes))
    if wav.ndim > 1:
        wav = wav.mean(axis=1)
    duration = float(len(wav) / sr) if sr else None
    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "default"

    model_path = settings.WHISPER_MODEL_ID
    if settings.ML_OFFLINE and not os.path.isdir(os.path.expanduser(model_path)):
        log.error(
            "whisper_faster_offline_requires_local_dir",
            extra={"path": model_path},
        )
        return (
            [
                {
                    "start": 0.0,
                    "end": 0.1,
                    "label": "ML_OFFLINE: set WHISPER_MODEL_ID to a local CTranslate2 model directory",
                    **meta,
                }
            ],
            duration,
        )

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        sf.write(tmp.name, np.asarray(wav, dtype=np.float32), int(sr), subtype="PCM_16")
        tmp_path = tmp.name
    try:
        model = WhisperModel(
            model_path,
            device=device,
            compute_type=compute_type,
        )
        segments, _info = model.transcribe(tmp_path, beam_size=5, vad_filter=True)
        out: list[dict[str, Any]] = []
        for i, seg in enumerate(segments):
            start = float(seg.start)
            end = float(seg.end)
            if end <= start:
                end = start + 0.1
            text = (seg.text or "").strip() or f"segment_{i}"
            label = text[:512] if len(text) <= 512 else text[:509] + "..."
            out.append({"start": start, "end": end, "label": label, **meta})
        if not out:
            out.append(
                {
                    "start": 0.0,
                    "end": max(0.1, duration or 1.0),
                    "label": "(no speech detected)",
                    **meta,
                }
            )
        return out, duration
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def run_whisper_audio(audio_bytes: bytes, settings: Settings) -> tuple[list[dict[str, Any]], float | None]:
    """Return (audio_segment payloads, duration_seconds estimate)."""
    meta = model_meta(ml_annotation_source(settings), settings.WHISPER_MODEL_ID)
    if settings.ML_PIPELINE_DRY_RUN:
        return (
            [
                {
                    "start": 0.0,
                    "end": 1.0,
                    "label": "dry_run speech",
                    **meta,
                }
            ],
            1.0,
        )

    engine = (settings.WHISPER_ENGINE or "transformers").strip().lower()
    if engine == "faster_whisper":
        return _whisper_faster_whisper(audio_bytes, settings, meta)

    try:
        import numpy as np
        import torch
        try:
            import soundfile as sf
            from transformers import pipeline
        except ImportError:
            log.warning("whisper_soundfile_or_transformers_missing")
            return (
                [
                    {
                        "start": 0.0,
                        "end": 1.0,
                        "label": "install requirements-ml.txt for Whisper",
                        **meta,
                    }
                ],
                None,
            )

        wav, sr = sf.read(io.BytesIO(audio_bytes))
        if wav.ndim > 1:
            wav = wav.mean(axis=1)
        duration = float(len(wav) / sr) if sr else None
        device = 0 if torch.cuda.is_available() else -1
        torch_dtype = torch.float16 if device == 0 else torch.float32

        model_id = settings.WHISPER_MODEL_ID
        tok = transformers_token(settings)
        mkw = dict(transformers_local_kw(settings))
        pipe_kw: dict[str, Any] = {
            "model": model_id,
            "torch_dtype": torch_dtype,
            "chunk_length_s": 30,
            "return_timestamps": "segment",
            "device": device,
            "model_kwargs": mkw,
        }
        if tok:
            pipe_kw["token"] = tok
        pipe = pipeline("automatic-speech-recognition", **pipe_kw)
        result = pipe(
            {"array": np.asarray(wav, dtype=np.float32), "sampling_rate": int(sr)},
            generate_kwargs={"task": "transcribe"},
        )
        chunks = result.get("chunks") or []
        out: list[dict[str, Any]] = []
        for i, ch in enumerate(chunks):
            ts = ch.get("timestamp") or (0.0, duration or 1.0)
            start = float(ts[0]) if ts[0] is not None else 0.0
            end = float(ts[1]) if len(ts) > 1 and ts[1] is not None else start + 0.5
            if end <= start:
                end = start + 0.1
            text = (ch.get("text") or "").strip() or f"segment_{i}"
            label = text[:512] if len(text) <= 512 else text[:509] + "..."
            out.append({"start": start, "end": end, "label": label, **meta})
        if not out:
            out.append(
                {
                    "start": 0.0,
                    "end": max(0.1, duration or 1.0),
                    "label": "(no speech detected)",
                    **meta,
                }
            )
        return out, duration
    except Exception:
        log.exception("whisper_failed")
        return (
            [
                {
                    "start": 0.0,
                    "end": 1.0,
                    "label": "transcription error",
                    **meta,
                }
            ],
            None,
        )
