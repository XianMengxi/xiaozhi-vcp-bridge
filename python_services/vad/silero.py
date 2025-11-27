import time
import numpy as np
import torch
import gc
import sys
sys.path.append("..")
from utils.logger import setup_logging
from .base import VADProviderBase
import os

try:
    import opuslib_next as opuslib
except Exception:
    opuslib = None

TAG = __name__
logger = setup_logging()

class VADProvider(VADProviderBase):
    def __init__(self, config):
        logger.bind(tag=TAG).info(f"SileroVAD config: {config}")
        # Load model
        # Assuming model_dir points to a directory containing the silero_vad.onnx or similar, 
        # or we use torch.hub.load. The original code used torch.hub.load with source='local'.
        # We need to ensure the model is available. 
        # For simplicity, if 'model_dir' is a path, we try to load it.
        # If the user doesn't have the model locally, this might fail.
        # We will try to use 'snakers4/silero-vad' from hub if local fails or if configured.
        custom_dir = "./models"  # 这里替换为你想要的路径
        os.makedirs(custom_dir, exist_ok=True) # 确保文件夹存在

        # 2. 告诉 torch.hub 使用这个目录
        torch.hub.set_dir(custom_dir)
        try:
            self.model, _ = torch.hub.load(
                repo_or_dir=config.get("model_dir", "snakers4/silero-vad"),
                source='local', # Changed default to github for easier setup
                model="silero_vad",
                force_reload=False,
                trust_repo=True
            )
        except Exception as e:
            logger.bind(tag=TAG).error(f"Failed to load Silero VAD model: {e}")
            raise e

        if opuslib:
            self.decoder = opuslib.Decoder(16000, 1)
        else:
            logger.bind(tag=TAG).warning("Opus decoder not available")
            self.decoder = None

        threshold = config.get("threshold", "0.5")
        threshold_low = config.get("threshold_low", "0.2")
        min_silence_duration_ms = config.get("min_silence_duration_ms", "1000")

        self.vad_threshold = float(threshold) if threshold else 0.5
        self.vad_threshold_low = float(threshold_low) if threshold_low else 0.2
        self.silence_threshold_ms = int(min_silence_duration_ms) if min_silence_duration_ms else 1000
        self.frame_window_threshold = 3

    def __del__(self):
        if hasattr(self, 'decoder') and self.decoder is not None:
            try:
                del self.decoder
                gc.collect()
            except Exception:
                pass

    def process_full_audio(self, pcm_data, sample_rate=16000):
        """
        Process full audio PCM data using get_speech_timestamps.
        Returns True if speech is detected.
        """
        try:
            # 1. Convert PCM bytes to float32 tensor
            audio_int16 = np.frombuffer(pcm_data, dtype=np.int16)
            audio_float32 = audio_int16.astype(np.float32) / 32768.0
            audio_tensor = torch.from_numpy(audio_float32)
            
            # 2. Get speech timestamps
            # We need to access get_speech_timestamps. 
            # Since we loaded the model via torch.hub.load('local', ...), 
            # the utils are returned as the second element of the tuple.
            # self.model was set to the model object, but we didn't save the utils.
            # We need to reload or import utils.
            
            # Importing directly from the local path since we know the structure
            sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'models', 'snakers4_silero-vad', 'src'))
            from silero_vad.utils_vad import get_speech_timestamps
            
            speech_timestamps = get_speech_timestamps(
                audio_tensor,
                self.model,
                threshold=self.vad_threshold,
                sampling_rate=sample_rate,
                min_speech_duration_ms=250,
                min_silence_duration_ms=100
            )
            
            if len(speech_timestamps) > 0:
                logger.bind(tag=TAG).info(f"Speech detected: {speech_timestamps}")
                return True
            else:
                return False

        except Exception as e:
            logger.bind(tag=TAG).error(f"Error processing full audio: {e}")
            return False



    def is_vad(self, conn, opus_packet):
        # conn is expected to have:
        # client_audio_buffer: list/bytearray
        # last_is_voice: bool
        # client_voice_window: list
        # client_have_voice: bool
        # last_activity_time: float (ms)
        # client_voice_stop: bool
        
        try:
            if not self.decoder:
                return False

            pcm_frame = self.decoder.decode(opus_packet, 960)
            conn.client_audio_buffer.extend(pcm_frame)

            client_have_voice = False
            while len(conn.client_audio_buffer) >= 512 * 2:
                chunk = conn.client_audio_buffer[: 512 * 2]
                conn.client_audio_buffer = conn.client_audio_buffer[512 * 2 :]

                audio_int16 = np.frombuffer(chunk, dtype=np.int16)
                audio_float32 = audio_int16.astype(np.float32) / 32768.0
                audio_tensor = torch.from_numpy(audio_float32)

                with torch.no_grad():
                    speech_prob = self.model(audio_tensor, 16000).item()

                if speech_prob >= self.vad_threshold:
                    is_voice = True
                elif speech_prob <= self.vad_threshold_low:
                    is_voice = False
                else:
                    is_voice = conn.last_is_voice

                conn.last_is_voice = is_voice
                conn.client_voice_window.append(is_voice)
                
                # Keep window size reasonable (e.g., 10 frames)
                if len(conn.client_voice_window) > 10:
                    conn.client_voice_window.pop(0)

                client_have_voice = (
                    conn.client_voice_window.count(True) >= self.frame_window_threshold
                )

                if conn.client_have_voice and not client_have_voice:
                    stop_duration = time.time() * 1000 - conn.last_activity_time
                    if stop_duration >= self.silence_threshold_ms:
                        conn.client_voice_stop = True
                
                if client_have_voice:
                    conn.client_have_voice = True
                    conn.last_activity_time = time.time() * 1000

            return client_have_voice
        except Exception as e:
            logger.bind(tag=TAG).error(f"Error processing audio packet: {e}")
            return False
