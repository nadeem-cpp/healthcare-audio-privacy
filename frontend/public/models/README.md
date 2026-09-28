# On-device models

Speaker-encoder weights are not committed. From `frontend/`:

```
pnpm fetch-models
```

That writes `ecapa-tdnn.onnx` (WeSpeaker ECAPA-TDNN 512, ~25 MB). If the file is missing, the engine falls back to an MFCC statistical embedding so the DSP path still runs.

Whisper Tiny and BERT NER are downloaded by Transformers.js into the browser Cache API on first use.
