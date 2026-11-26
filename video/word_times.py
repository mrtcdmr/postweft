# Word timestamps for captions. Usage: python3 word_times.py voice.wav "known script" [language] > words.json
# Needs: pip install faster-whisper  (the "small" model is downloaded on first use)
import sys, json, os
from faster_whisper import WhisperModel

model_dir = os.environ.get("WHISPER_MODEL_DIR", os.path.expanduser("~/.cache/social-autopilot-whisper"))
m = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), device="cpu", compute_type="int8", download_root=model_dir)
lang = sys.argv[3] if len(sys.argv) > 3 else None
segs, _ = m.transcribe(sys.argv[1], language=lang, word_timestamps=True,
                       initial_prompt=(sys.argv[2] if len(sys.argv) > 2 else None), vad_filter=False)
print(json.dumps([{"w": w.word.strip(), "a": round(w.start, 2), "b": round(w.end, 2)} for s in segs for w in s.words], ensure_ascii=False))
