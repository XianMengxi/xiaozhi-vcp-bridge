import os
import wave
import uuid
import gc
from abc import ABC, abstractmethod
from typing import Optional, Tuple, List
import opuslib
import sys
sys.path.append("..")
from utils.logger import setup_logging

TAG = __name__
logger = setup_logging()

class ASRProviderBase(ABC):
    def __init__(self):
        pass

    @abstractmethod
    async def speech_to_text(
        self, opus_data: List[bytes], session_id: str, audio_format="opus"
    ) -> Tuple[Optional[str], Optional[str]]:
        """Convert speech data to text"""
        pass

    def save_audio_to_file(self, pcm_data: List[bytes], session_id: str) -> str:
        """Save PCM data to WAV file"""
        # Ensure output directory exists
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir, exist_ok=True)

        module_name = __name__.split(".")[-1]
        file_name = f"asr_{module_name}_{session_id}_{uuid.uuid4()}.wav"
        file_path = os.path.join(self.output_dir, file_name)

        with wave.open(file_path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)  # 2 bytes = 16-bit
            wf.setframerate(16000)
            wf.writeframes(b"".join(pcm_data))

        return file_path

    @staticmethod
    def decode_opus(opus_data: List[bytes]) -> List[bytes]:
        """Decode Opus audio data to PCM data"""
        decoder = None
        try:
            # Note: opuslib.Decoder might differ from opuslib_next.Decoder
            # Assuming opuslib is installed and compatible or we use opuslib_next if available
            try:
                import opuslib
                decoder = opuslib.Decoder(16000, 1)
            except ImportError:
                import opuslib_next
                decoder = opuslib_next.Decoder(16000, 1)

            pcm_data = []
            buffer_size = 960  # 60ms at 16kHz
            
            for i, opus_packet in enumerate(opus_data):
                try:
                    if not opus_packet or len(opus_packet) == 0:
                        continue
                    
                    pcm_frame = decoder.decode(opus_packet, buffer_size)
                    if pcm_frame and len(pcm_frame) > 0:
                        pcm_data.append(pcm_frame)
                        
                except Exception as e:
                    logger.bind(tag=TAG).warning(f"Opus decode error, skipping packet {i}: {e}")
            
            return pcm_data
            
        except Exception as e:
            logger.bind(tag=TAG).error(f"Audio decode error: {e}")
            return []
        finally:
            if decoder is not None:
                try:
                    del decoder
                    gc.collect()
                except Exception:
                    pass
