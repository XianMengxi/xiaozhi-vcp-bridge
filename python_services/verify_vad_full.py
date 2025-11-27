import sys
import os
try:
    import torch
    import numpy as np
    from vad.silero import VADProvider
except Exception as e:
    with open("error.log", "w") as f:
        f.write(f"IMPORT FAILURE: {e}\n")
    sys.exit(1)

# Mock config
config = {
    "model_dir": "models/snakers4_silero-vad",
    "threshold": "0.5"
}

try:
    print("Initializing VADProvider...")
    vad = VADProvider(config)
    print("VADProvider initialized.")

    # Create dummy PCM audio (1 second silence)
    # 16000 samples * 2 bytes = 32000 bytes
    silence = bytes(32000)
    
    print("Testing process_full_audio with silence...")
    has_speech = vad.process_full_audio(silence)
    print(f"Has speech (silence): {has_speech}")
    
    if has_speech:
        print("FAILURE: Silence detected as speech.")
        sys.exit(1)

    # Create dummy PCM audio (1 second noise)
    # Note: Random noise might not trigger speech, but we check for crash
    print("Testing process_full_audio with noise...")
    noise = np.random.randint(-10000, 10000, 16000, dtype=np.int16).tobytes()
    has_speech_noise = vad.process_full_audio(noise)
    print(f"Has speech (noise): {has_speech_noise}")

    print("SUCCESS: VAD processing completed without error.")
    sys.exit(0)

except Exception as e:
    with open("error.log", "w") as f:
        f.write(f"FAILURE: {e}\n")
        import traceback
        traceback.print_exc(file=f)
    sys.exit(1)
