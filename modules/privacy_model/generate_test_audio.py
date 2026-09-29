import subprocess, json, numpy as np
from scipy.io import wavfile

SR = 16000
VOICES = {"clinician": "slt", "patient": "rms"}

# (speaker, [(text, label_or_None), ...]) — all identifiers are fictional
SCRIPT = [
 ("clinician", [("Good morning. Can you please tell me your full name?", None)]),
 ("patient",   [("My name is", None), ("Sarah Mitchell", "PERSON")]),
 ("clinician", [("And your date of birth?", None)]),
 ("patient",   [("March twelfth, nineteen eighty four", "DATE")]),
 ("clinician", [("What brings you in today?", None)]),
 ("patient",   [("I have had chest tightness and a dry cough for about five days. I take lisinopril ten milligrams daily.", None)]),
 ("clinician", [("What is the best phone number to reach you?", None)]),
 ("patient",   [("It is", None), ("five five five, two one eight, four four seven nine", "PHONE")]),
 ("clinician", [("And your email?", None)]),
 ("patient",   [("sarah dot mitchell at example dot com", "EMAIL")]),
 ("clinician", [("I see your medical record number is", None), ("M R N four seven two nine one eight", "ID")]),
 ("patient",   [("Yes. I live at", None), ("forty two Oak Street, Springfield", "LOCATION")]),
 ("patient",   [("My grandfather,", None), ("Robert Mitchell", "PERSON"), (", is", None), ("ninety two", "AGE_OVER_89"), ("and he had a heart attack last year.", None)]),
 ("clinician", [("Thank you. I will ask", None), ("Doctor James Carter", "PERSON"), ("at", None), ("Riverside General Hospital", "ORGANIZATION"), ("to review your E C G.", None)]),
 ("clinician", [("Let us schedule a follow up on", None), ("October fifth, twenty twenty six", "DATE"), (".", None)]),
]

def synth(text, voice):
    t = text.replace("'", "").replace(":", " ")
    out = subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-f","lavfi",
        "-i", f"flite=text='{t}':voice={voice}","-ar",str(SR),"-ac","1","-f","s16le","-"],
        capture_output=True, check=True).stdout
    x = np.frombuffer(out, np.int16).astype(np.float32) / 32768
    idx = np.where(np.abs(x) > 0.01)[0]              # trim edge silence
    return x[max(0, idx[0]-80): idx[-1]+80] if len(idx) else x

def sil(sec): return np.zeros(int(sec*SR), np.float32)

audio, t, entities, transcript = [sil(0.5)], 0.5, [], []
for i, (spk, parts) in enumerate(SCRIPT):
    turn_start, words = t, []
    for j, (text, label) in enumerate(parts):
        if text.strip(" .,") == "":
            continue
        seg = synth(text, VOICES[spk])
        if label:
            entities.append({"label": label, "text": text, "speaker": spk,
                             "start": round(t, 3), "end": round(t + len(seg)/SR, 3)})
        audio.append(seg); t += len(seg)/SR
        audio.append(sil(0.08)); t += 0.08
        words.append(text)
    transcript.append({"speaker": spk, "start": round(turn_start,3), "end": round(t,3),
                       "text": " ".join(words).replace(" ,", ",").replace(" .", ".")})
    audio.append(sil(0.45)); t += 0.45

x = np.concatenate(audio)
x = x / max(1e-6, np.abs(x).max()) * 0.9
wavfile.write("encounter_phi_test.wav", SR, (x*32767).astype(np.int16))

dur = len(x)/SR
W = 6.0
for e in entities:
    e["crosses_6s_window"] = int(e["start"]//W) != int(e["end"]//W)
gt = {"sample_rate": SR, "channels": 1, "duration_sec": round(dur,3),
      "note": "Synthetic, fictional identifiers. Timestamps are exact (entities synthesized as separate segments).",
      "phi_window_seconds": W, "entities": entities, "transcript": transcript,
      "negative_controls": ["chest tightness", "dry cough", "five days", "lisinopril ten milligrams daily",
                            "heart attack", "E C G"]}
json.dump(gt, open("encounter_phi_test.ground_truth.json","w"), indent=2)
print(f"duration {dur:.1f}s, {len(entities)} entities")
for e in entities: print(e["label"], e["start"], e["end"], "CROSS" if e["crosses_6s_window"] else "")