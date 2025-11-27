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

    # Create dummy PCM chunk (1024 bytes = 512 samples * 2 bytes)
    # Silence
    silence = bytes(1024)
    prob_silence = vad.process_pcm(silence)
    print(f"Silence probability: {prob_silence}")

    # Noise (random)
    # Note: Random noise might not trigger speech, but it shouldn't crash
    noise = np.random.randint(-1000, 1000, 512, dtype=np.int16).tobytes()
    prob_noise = vad.process_pcm(noise)
    print(f"Noise probability: {prob_noise}")

    print("SUCCESS: VAD processing completed without error.")
    sys.exit(0)

except Exception as e:
    with open("error.log", "w") as f:
        f.write(f"FAILURE: {e}\n")
        import traceback
        traceback.print_exc(file=f)
    sys.exit(1)
