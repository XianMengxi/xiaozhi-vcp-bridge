from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from pydantic import BaseModel
import uvicorn
import os
import io
import asyncio
from typing import List
import numpy as np
import torch
import aiofiles

base_dir = os.path.dirname(os.path.abspath(__file__))
ffmpeg_dir = os.path.join(base_dir, 'models')
if ffmpeg_dir not in os.environ["PATH"]:
    os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ["PATH"]

from vad.silero import VADProvider
from asr.fun_local import ASRProvider
from utils.logger import setup_logging

app = FastAPI()
logger = setup_logging()

# Configuration
VAD_CONFIG = {
    "model_dir": "models/snakers4_silero-vad", # Or local path if available
    "threshold": "0.5",
    "min_silence_duration_ms": "1000"
}

ASR_CONFIG = {
    "model_dir": "models/SenseVoiceSmall", # Using SenseVoiceSmall as it's faster/better often, or "paraformer-zh"
    "output_dir": "./output"
}

# Initialize Providers
vad_provider = None
asr_provider = None

@app.on_event("startup")
async def startup_event():
    global vad_provider, asr_provider
    try:
        vad_provider = VADProvider(VAD_CONFIG)
        # delete_audio_file=True means we don't keep wavs forever
        asr_provider = ASRProvider(ASR_CONFIG, delete_audio_file=True)
        logger.info("Services initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")
        # Don't crash, but endpoints will fail
        pass

class MockConnection:
    def __init__(self):
        self.client_audio_buffer = []
        self.last_is_voice = False
        self.client_voice_window = []
        self.client_have_voice = False
        self.last_activity_time = 0
        self.client_voice_stop = False

@app.post("/process_audio")
async def process_audio(file: UploadFile = File(...), audio_format: str = Form("pcm")):
    """
    Process uploaded audio file:
    1. Check VAD
    2. If speech detected, run ASR
    """
    if not vad_provider or not asr_provider:
        raise HTTPException(status_code=503, detail="Services not initialized")

    try:
        # 1. 读取完整的 WAV 文件数据 (包含 Header)
        audio_bytes = await file.read()
        
        # 2. 准备 VAD 需要的 PCM 裸数据 (不含 Header)
        vad_pcm_data = b""
        
        # 解析 WAV 用于 VAD
        if audio_format == "pcm": # 你的前端传参是指这是一个 wav/pcm 文件
            import wave
            try:
                # 这是一个只读操作，不破坏原始 audio_bytes
                with wave.open(io.BytesIO(audio_bytes), 'rb') as wf:
                    # 校验格式 (可选，但推荐)
                    if wf.getnchannels() != 1 or wf.getframerate() != 16000:
                        logger.warning("Format warning: ensure 16k mono wav")
                    
                    # 提取裸数据给 VAD
                    vad_pcm_data = wf.readframes(wf.getnframes())
            except wave.Error:
                # 如果解析失败，回退到原始数据
                vad_pcm_data = audio_bytes
        else:
            # 如果是 Opus，VAD 需要解码 (这里假设你已经有处理逻辑，或者暂时跳过)
            vad_pcm_data = audio_bytes 

        # 3. 执行 VAD 检查 (使用裸数据)
        # 注意：确保你的 vad_provider 能处理 bytes (int16)，有的 VAD 需要 float32 numpy array
        has_speech = vad_provider.process_full_audio(vad_pcm_data)
        logger.info(f"VAD Result: has_speech={has_speech}")
        
        if not has_speech:
            return {"text": "", "message": "No speech detected"}

        # 4. 执行 ASR (关键修改点！！！)
        # 不要传 vad_pcm_data，要传原始的 audio_bytes (带 WAV 头)
        # FunASR 能够自己识别 wav 头的元数据
        
        input_data = [audio_bytes] 
        
        # 这里的 audio_format="pcm" 只是告诉你的 wrapper 这是一个 wav/pcm 流程
        # 但数据我们要给完整的 wav bytes
        text, _ = await asr_provider.speech_to_text(input_data, "session_temp", audio_format="pcm")
        
        logger.info(f"ASR Result: {text}")
        return {"text": text}

    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
