from pathlib import Path
import sys

import numpy as np
import soundfile as sf
from scipy import signal


try:
    ...
except ImportError:
    sys.path.append(str(Path().resolve()))


TARGET_SR = 16_000


def load_audio(audio_file_path: Path, target_sample_rate: int = TARGET_SR) -> tuple[np.ndarray, int]:
    """Load an audio file as mono float32 PCM at ``target_sr`` Hz."""
    audio, sample_rate = sf.read(str(audio_file_path), dtype="float32", always_2d=True)
    audio = audio.mean(axis=1)

    if sample_rate != target_sample_rate:
        n_out = int(len(audio) * target_sample_rate / sample_rate)
        audio = signal.resample(audio, n_out).astype(np.float32)

    return audio, target_sample_rate


if __name__ == "__main__":

    if len(sys.argv) < 2:
        print("Usage: python load_audio.py <path_to_audio_file>")
        sys.exit(1)

    audio_file_path = Path(sys.argv[1])
    audio_data, sample_rate = load_audio(audio_file_path)

    print(f"Loaded audio file: {audio_file_path}")
    print(f"Audio data shape: {audio_data.shape}")
    print(f"Sample rate: {sample_rate} Hz")
    print(f"Duration: {len(audio_data) / sample_rate:.2f} s")
