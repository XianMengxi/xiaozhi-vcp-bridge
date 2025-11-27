import asyncio
import os
import sys
from pathlib import Path

base_dir = os.path.dirname(os.path.abspath(__file__))
ffmpeg_dir = os.path.join(base_dir, 'models')
if ffmpeg_dir not in os.environ["PATH"]:
    os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ["PATH"]

from asr.fun_local import ASRProvider
from utils.logger import setup_logging

logger = setup_logging()
TAG = __name__

async def test_asr_on_wav_files():
    """测试 ASR 识别 uploads 目录下的 WAV 文件"""
    
    # 配置
    ASR_CONFIG = {
        "model_dir": "models/SenseVoiceSmall",
        "output_dir": "./output"
    }
    
    # 初始化 ASR Provider
    print("正在初始化 ASR Provider...")
    asr_provider = ASRProvider(ASR_CONFIG, delete_audio_file=True)
    print("ASR Provider 初始化完成\n")
    
    # 查找 uploads 目录下的所有 WAV 文件
    uploads_dir = Path("./uploads")
    if not uploads_dir.exists():
        print(f"错误: uploads 目录不存在: {uploads_dir.absolute()}")
        return
    
    wav_files = list(uploads_dir.glob("*.wav"))
    
    if not wav_files:
        print(f"在 {uploads_dir.absolute()} 中没有找到 .wav 文件")
        return
    
    print(f"找到 {len(wav_files)} 个 WAV 文件\n")
    print("=" * 80)
    
    # 逐个测试文件
    for wav_file in wav_files:
        print(f"\n测试文件: {wav_file.name}")
        print("-" * 80)
        
        try:
            # 读取 WAV 文件
            with open(wav_file, 'rb') as f:
                audio_bytes = f.read()
            
            print(f"文件大小: {len(audio_bytes)} bytes")
            
            # 调用 ASR
            # 注意: fun_local.py 的 speech_to_text 期望 List[bytes]
            # audio_format="pcm" 表示输入是 PCM 数据
            text, file_path = await asr_provider.speech_to_text(
                [audio_bytes], 
                session_id="test_session",
                audio_format="pcm"
            )
            
            # 输出结果
            print(f"识别结果: {text}")
            if file_path:
                print(f"保存路径: {file_path}")
            
        except Exception as e:
            print(f"错误: {e}")
            import traceback
            traceback.print_exc()
        
        print("-" * 80)
    
    print("\n" + "=" * 80)
    print("测试完成")

if __name__ == "__main__":
    asyncio.run(test_asr_on_wav_files())
