"""Speech-to-text (STT) module."""

import sys

import numpy as np
from pathlib import Path
import whisper

try:
    ...
except ImportError:
    sys.path.append(str(Path().resolve()))


def load_model():
    model = whisper.load_model("tiny.en")
    return model

def stt(audio_data: np.ndarray, sample_rate: int) -> str:
    """Speech-to-text (STT) module."""
    model = load_model()

    # Format the audio to fit Whisper's exact input size expectation
    # Whisper processes audio in strict 30-second chunks (480,000 samples at 16kHz)
    
    audio_data = whisper.pad_or_trim(audio_data)
    # Convert the raw audio into a Log-Mel Spectrogram
    mel = whisper.log_mel_spectrogram(audio_data).to(model.device)

    # Decode the features into text
    result = whisper.decode(model, mel, options=whisper.DecodingOptions(language="en"))
    import pdb; pdb.set_trace()
    return result.text


if __name__ == "__main__":
    from load_audio import load_audio
    if len(sys.argv) < 2:
        print("Usage: python stt.py <path_to_audio_file>")
        sys.exit(1)

    audio_file_path = Path(sys.argv[1])
    audio_data, sample_rate = load_audio(audio_file_path)

    text = stt(audio_data, sample_rate)
    print(f"Transcription: {text}")