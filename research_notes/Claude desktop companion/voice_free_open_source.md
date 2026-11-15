# Free, Open-Source TTS Voices for a Desktop Companion (as of Nov 2026)

## 1. Best fully open-source local English TTS options (licence, CPU, size, runtime)

### Takeaway
Kokoro-82M (via kokoro-js) is the strongest fit. Its code and weights are both Apache-2.0, it is small (82M parameters), and it runs in Node or the browser with no Python sidecar. Piper is the fastest and lightest on CPU, but the engine is now GPL-3.0 and many of its voices are non-commercial. KittenTTS v0.8, Pocket TTS and Supertonic are viable but have caveats on licence or runtime. sherpa-onnx (Apache-2.0) is a good native/Node runtime that can host several of these models.

### Cited Findings
**Kokoro-82M / kokoro-js**
- 82M-parameter open-weight model with weights under Apache-2.0. v1.0 was released 27 Jan 2025, with no newer official version found. — [HF hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)
- Training data: permissive or public-domain audio plus some CC BY sets, and also synthetic audio from closed commercial TTS providers. That is a provenance point to be aware of. — [HF hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)
- kokoro-js runs locally "in the browser or in Node" using Transformers.js (`npm i kokoro-js`), with dtype fp32/fp16/q8/q4/q4f16. The device is wasm or webgpu in the browser and cpu in Node, and TextSplitterStream streams LLM output to audio chunks. — [kokoro-js README](https://cdn.jsdelivr.net/npm/kokoro-js@1.2.0/README.md)
- The kokoro-js npm package is listed as Apache-2.0. — [npm kokoro-js](https://npmjs.com/package/kokoro-js)

**Piper (now OHF-Voice/piper1-gpl)**
- The original rhasspy/piper (MIT) was archived 6 Oct 2025, and development moved to OHF-Voice/piper1-gpl under the Open Home Foundation. — [promptquorum review](https://www.promptquorum.com/power-local-llm/piper-tts-review) (secondary source)
- The engine is GPL-3.0-or-later. The project grants no licence over voice models, so each voice's rights follow its training data. — [piper1-gpl LICENSING.md](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/LICENSING.md)
- The repo offers a Python API (`pip install piper-tts`) and a C/C++ API (libpiper). — [piper1-gpl repo](https://github.com/OHF-Voice/piper1-gpl)
- v1.8.0 is reported as of Sept 2026. — [AUR piper-tts 1.8.0-1](https://aur.archlinux.org/packages/piper-tts) (unconfirmed against the repo's releases page)
- The MIT-licensed fork piper-plus exists. — [piper-plus](https://github.com/ayutaz/piper-plus/)
- Piper is widely cited as the fastest neural TTS on CPU. — [localaimaster](https://localaimaster.com/blog/best-tts-without-gpu) (secondary source)

**KittenTTS**
- The code is Apache-2.0, but the weights are licensed separately. KittenTTS 2 (1.7B parameters, ~954 MB) is under the Stellon Labs Community License, which is not OSI open source. — [KittenTTS GitHub](https://github.com/KittenML/KittenTTS); [Better Stack](https://betterstack.com/community/guides/ai/kitten-tts-2/)
- The lightweight v0.8 ONNX models are mini 80M (80 MB), micro 40M (41 MB), nano 15M (56 MB) and nano int8 (25 MB). The KittenTTS 2 line also has mini 82M, nano 17M and pico 7M int8 ONNX builds. Named voices include Bella, Jasper, Luna, Bruno, Rosie, Hugo, Kiki and Leo. — [KittenTTS GitHub](https://github.com/KittenML/KittenTTS)
- Claims of "real time on a CPU" are disputed: one model card says CPU can be 2–3x slower than real time. — [KittenTTS GitHub](https://github.com/KittenML/KittenTTS); [Better Stack](https://betterstack.com/community/guides/ai/kitten-tts-2/)

**Kyutai Pocket TTS**
- 100M parameters with weights under CC-BY-4.0. It runs about 6x real time on 2 cores of an M4 MacBook Air (~200 ms to first audio) and about 2.3–2.5x real time on a 4-vCPU x86 VM. It has 26 voices (e.g. alba, anna, eve, jane, mary, vera, cosette) and zero-shot cloning. — [HF kyutai/pocket-tts](https://huggingface.co/kyutai/pocket-tts)
- There is no official browser build, only community WASM/ONNX-Web ports (wasm-pocket-tts, pocket-tts-onnx-export, jax-js). The official package is Python/PyTorch. — [HF kyutai/pocket-tts](https://huggingface.co/kyutai/pocket-tts); [dev.to review](https://dev.to/andrew-ooo/pocket-tts-review-kyutais-100m-cpu-voice-cloner-2026-40lb)
- Some voices (e.g. Jean, Cosette) reportedly come from non-commercial datasets. — [tts.ai](https://tts.ai/voices/pocket-tts/?lang=fr) (secondary source and unconfirmed; check Kyutai's voice-licence page)

**Supertonic (Supertone)**
- The sample code is MIT, but the model is OpenRAIL-M: open weights with use-based restrictions, not equivalent to MIT. It runs on ONNX, and the official card lists onnxruntime-web for in-browser use. Supertonic 3 is ~99M parameters across 31 languages, with preset styles such as "M1". — [HF Supertone/supertonic](https://huggingface.co/Supertone/supertonic/blob/main/README.md); [mer.vin](https://mer.vin/medium/supertonic-3-99m-on-device-tts-with-onnx-31-languages-and-1200-chars-sec-medium/)

**sherpa-onnx (runtime)**
- Apache-2.0. Supports Windows x64/x86/arm64, Node.js (`sherpa-onnx-node`, plus addon examples) and WebAssembly. Apps built on it run Kokoro, Piper/VITS, Kitten, Matcha, Pocket TTS and Supertonic models. — [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)

### Inferences
- For an Electron/Node app on Windows 11, kokoro-js needs no native sidecar. sherpa-onnx-node is the fallback if one native runtime should host several engines, including Piper voices, and Piper's ONNX voices can run through it without linking GPL Piper code.
- Shipping GPL piper1-gpl inside the app would push the app toward GPL. Using Piper voice files through sherpa-onnx avoids that, but the voice-data licences still apply.

### Gaps
- No primary-source CPU real-time factor was found for Kokoro on a typical Windows laptop, and no per-dtype download sizes for kokoro-js. q8 is commonly reported at roughly 80–90 MB, but that is unverified.
- No notable new fully permissive small English TTS released in 2026 was confirmed beyond KittenTTS 2 (not open weights) and Pocket TTS updates. 2026 roundups are SEO-heavy.
- The licence for Pocket TTS code and per-voice terms was not read directly.

## 2. Where to browse and download voices; which sound light, cute or childlike

### Takeaway
Use the Kokoro voice list on Hugging Face, the Piper samples page with the rhasspy/piper-voices repo, and the Pocket TTS and KittenTTS model pages. No engine labels a voice as childlike, so light, bright female voices are the closest starting point, followed by pitch-shifting.

### Cited Findings
- Kokoro's voice table (VOICES.md) lists 20 US voices (11F, 9M) and 8 UK voices (4F, 4M) with grades. Top grades are af_heart (A), af_bella (A-), af_nicole (B-) and bf_emma (B-). Other light female voices include af_sky (C-), af_nova (C), af_sarah (C+), bf_isabella (C) and bf_lily (D). No voice is labelled childlike. — [Kokoro VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)
- Piper voice samples and an online demo are at rhasspy.github.io/piper-samples, and the list of voices is in docs/VOICES.md. — [piper1-gpl repo](https://github.com/OHF-Voice/piper1-gpl); [Piper samples](https://rhasspy.github.io/piper-samples)
- Piper voice licences differ:
  - `en_US-ljspeech` is public domain (LJ Speech). — [ljspeech MODEL_CARD](https://huggingface.co/rhasspy/piper-voices/raw/main/en/en_US/ljspeech/high/MODEL_CARD)
  - `en_US-hifi_tts_92-medium` is CC BY 4.0. — [LICENSING.md](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/LICENSING.md)
  - `en_US-lessac-*` and the many voices fine-tuned from it are research-only in effect (Blizzard 2013 licence). — [LICENSING.md](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/LICENSING.md); [Piper discussion #271](https://github.com/rhasspy/piper/discussions/271)
- Pocket TTS voices (alba, anna, eve, jane, mary, vera…) are listed on the HF card. — [HF kyutai/pocket-tts](https://huggingface.co/kyutai/pocket-tts)
- KittenTTS voices include Kiki, Luna, Rosie and Bella. — [KittenTTS GitHub](https://github.com/KittenML/KittenTTS)

### Inferences
- For a cute, small-robot base, start with Kokoro af_heart, af_bella or af_nicole and add a +2 to +5 semitone pitch shift. af_sky is lighter but trained on little data. In Piper, use ljspeech, a public-domain female voice, as the base. KittenTTS "Kiki" is worth an ear test, but the name alone says nothing about how it sounds.

### Gaps
- Whether any voice sounds childlike is subjective and was not verified by listening. Piper's "Commercial use" list of fully permissive voices was not retrieved.

## 3. Free OS built-in voices as a zero-setup fallback

### Takeaway
The browser/Electron `speechSynthesis` API exposes the device's installed voices with adjustable pitch and rate. It is zero-setup but depends on the platform and is not open source.

### Cited Findings
- Web Speech `speechSynthesis.getVoices()` returns "all the available voices on the current device". `SpeechSynthesisUtterance` has `pitch` and `rate`. The voice list may be empty until `voiceschanged` fires. — [MDN SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)

### Inferences
- Windows: SAPI 5 and OneCore voices (e.g. Microsoft Zira/David) are reachable through speechSynthesis in Chromium/Electron or through PowerShell's System.Speech. They are free with the OS but proprietary.
- macOS: the `say` CLI and system voices are free with the OS but proprietary.
- Browser/Electron: speechSynthesis is the easiest cross-platform fallback, but voice quality and availability vary by OS.

### Gaps
- No primary sources were fetched for Windows SAPI/OneCore or macOS `say` within the search budget. Those lines come from general knowledge, not citations.

## 4. Making a robot-console character voice with free effects

### Takeaway
Post-process the TTS output in Web Audio with Tone.js, which is MIT and free. A light pitch-up, a mild bitcrush and a short ring-mod/tremolo give a cute console robot. Build an original character rather than imitating or cloning a real voice actor.

### Cited Findings
- Tone.js `PitchShift` (semitones, e.g. `pitch = -12` for an octave down) and `BitCrusher(bits)` are standard effects. — [Tone.js PitchShift docs](https://tonejs.github.io/docs/14.7.30/PitchShift); [Tone.js BitCrusher](https://tonejs.github.io/docs/r11/BitCrusher)
- A community browser voice-changer's "robot" chain is BitCrusher(4) → lowpass 800 Hz → Distortion(0.3), built on Tone.js. — [dev.to voice changer guide](https://dev.to/linmingren/building-a-browser-based-voice-changer-a-complete-technical-guide-14hd)
- Supertonic's OpenRAIL-M licence bans impersonation without consent. — [Supertonic summary](https://huggingface.co/Supertone/supertonic/blob/main/README.md)
- Pocket TTS and KittenTTS 2 support voice cloning. — [HF kyutai/pocket-tts](https://huggingface.co/kyutai/pocket-tts); [KittenTTS GitHub](https://github.com/KittenML/KittenTTS)

### Inferences
- For a cute small robot rather than a menacing one: PitchShift +3 to +5 semitones, then BitCrusher at about 8–10 bits (subtle), then a ring-mod-like tremolo or AM at about 30–60 Hz with a low wet mix, then a slight highpass. This is a suggested starting chain and has not been tested.
- The cloning features above should not be used to copy a real voice actor, for example the original BMO voice actor. Design an original voice and keep it legally clean.
- A pure-native alternative is SoX (pitch, overdrive, tremolo) on the generated WAV. It was not checked in this pass.

### Gaps
- No source was found that validates a specific "cute robot" effect recipe. The parameters above need tuning by ear.

---

**Recommendation:** Use **Kokoro-82M via kokoro-js** as the default engine. Code and weights are both Apache-2.0, it is ~82M parameters, it runs in Node and in the Electron renderer (WASM/WebGPU) with no Python, and it streams LLM text. Run it through a small Tone.js chain (pitch +3 to +5 semitones, light bitcrush, faint ring-mod) to get the robot-console character. Try **af_heart** (best quality), **af_bella** and **af_nicole** first, and **af_sky** for a lighter timbre. Keep `speechSynthesis` as the zero-setup fallback, and treat sherpa-onnx with the public-domain Piper voice `en_US-ljspeech` as an ultra-light alternative. Avoid lessac-derived Piper voices, GPL piper1-gpl linking, and KittenTTS 2 weights, because of their licences.
