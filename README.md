# SonaDSP

**SonaDSP** is a browser-based acoustic parametric equalizer, target curve workbench, and real-time Web Audio DSP studio built for In-Ear Monitors (IEMs) and headphones. Running entirely client-side with zero backend dependencies, it combines a custom `AudioWorklet` biquad engine, live 6,000+ model AutoEq integration, local coordinate-descent curve fitting, and multi-platform DSP preset conversion.

* **Live Application:** [https://treasure7788.github.io/SonaDSP/](https://treasure7788.github.io/SonaDSP/)
* **Source Repository:** [https://github.com/treasure7788/SonaDSP](https://github.com/treasure7788/SonaDSP)

---

## Table of Contents

1. [Overview and Architecture](#overview-and-architecture)
2. [Core Features](#core-features)
3. [Supported Import and Export Formats](#supported-import-and-export-formats)
4. [DSP Mathematical Reference](#dsp-mathematical-reference)
5. [Controls and Keyboard Shortcuts](#controls-and-keyboard-shortcuts)
6. [Local Development](#local-development)
7. [Project Structure](#project-structure)
8. [Acknowledgments](#acknowledgments)
9. [License](#license)

---

## Overview and Architecture

SonaDSP is designed to eliminate the discrepancies commonly found in browser-based audio equalizers. Standard Web Audio API `BiquadFilterNode` implementations impose a fixed slope ($S = 1$) on low-shelf and high-shelf filters—ignoring the user's $Q$ parameter—and evaluate low-pass and high-pass $Q$ values in decibels rather than linear quality factor.

To guarantee that the plotted transfer curve, the real-time audition engine, the local AutoEQ optimizer, and exported impulse responses are mathematically identical, SonaDSP uses a unified Robert Bristow-Johnson (RBJ) *Audio EQ Cookbook* coefficient generator (`computeBiquadCoeffs`) across the entire application.

---

## Core Features

### 1. Unified RBJ Biquad Math and Custom `AudioWorklet` Engine
* **Single Source of Truth:** The interactive frequency response graph, real-time audio processor, coordinate-descent AutoEQ solver, and Impulse Response (IR) exporter all share the exact same biquad transfer function calculations.
* **True Shelf-$Q$ AudioWorklet (`sona-eq`):** Dynamically compiles and loads a stereo **Transposed Direct Form II (TDF-II)** `AudioWorkletProcessor` with 16 ms exponential parameter smoothing ($\tau = 0.016\text{ s}$). Shelf $Q$ and linear pass-filter $Q$ behave identically in both the visual plot and the audio output.
* **Graceful Native Fallback:** If `AudioWorklet` is blocked or unavailable, SonaDSP automatically falls back to a native `BiquadFilterNode` chain, converts low-pass/high-pass linear $Q$ via $20 \log_{10}(Q)$, and locks the plotted shelf slope so the visual graph remains strictly accurate to the audible filter chain.

### 2. Full 6,000+ AutoEq Library and IEM-as-Target Workbench
* **Live AutoEq Master Indexer:** Fetches and parses the master `INDEX.md` from `jaakkopasanen/AutoEq` (with automatic jsDelivr CDN failover), providing instant search across more than 6,000 measured headphones and IEMs from `oratory1990`, `crinacle` (711 and B&K 5128), `rtings`, and other measurement databases.
* **Three Load Modes per Entry:**
  * **FR Curve:** Loads the raw frequency response measurement (`.csv`).
  * **+PEQ:** Loads both the measurement curve and the official AutoEq `ParametricEQ.txt` filter bands.
  * **Target:** Loads any headphone or IEM in the AutoEq catalog *as the active target curve*, allowing you to match one transducer's tonal signature to another.
* **Built-In Synthetic Profiles and Targets:** Includes analytical approximations for reference IEMs (*Simgot EM6L, CrinEar Daybreak, Truthear Hexa, Moondrop Blessing 3, Moondrop Variations, Thieaudio Monarch MkIII, 7Hz Zero:2, Dunu DaVinci, Sennheiser IE 200, Letshuoer S12 Pro, Sony IER-M9, Etymotic ER2XR*) alongside standard acoustic targets:
  * **JM-1** (Population Average Diffuse Field)
  * **IEF Neutral 2023**
  * **Harman IE 2019v2**
  * **B&K 5128 Diffuse Field**
* **Live Target Modifiers:** Continuously adjustable **Spectral Tilt** ($\text{dB/octave}$ pivoted at $1\text{ kHz}$), **Sub-Bass Shelf** ($\text{dB}$ boost below $105\text{ Hz}$), and switchable **$500\text{ Hz}$ / $1\text{ kHz}$ SPL normalization**.

### 3. Local Coordinate-Descent AutoEQ Solver and AI Controller
* **Iterative Parametric Curve Fitter (`fitParametricEq`):** Fits up to 10 parametric bands (peaking and low/high shelves) across a 512-point logarithmic grid ($20\text{ Hz} - 20\text{ kHz}$). Uses greedy residual peak placement followed by cyclic coordinate descent across frequency (octaves), $\log_2(Q)$, and gain ($\pm 15\text{ dB}$) with multi-pass refinement.
* **Natural-Language AI Acoustic Controller:**
  * **LLM API Mode:** Connects to any OpenAI-compatible chat completions endpoint (`gpt-4o`, local Ollama, LM Studio, etc.). Transmits the user prompt, active target parameters, 10-band ISO octave target error deltas, and the loaded audio track's **Long-Term Average Spectrum (LTAS)** to generate context-aware parametric filters with per-band engineering rationales.
  * **Offline Acoustic Solver Fallback:** Operates without an API key by parsing natural-language descriptors (*"warm sub-bass"*, *"remove 240Hz mud"*, *"tame 4.5kHz glare"*, *"forward vocals"*, *"11kHz air"*) into target-shaping filters before running the local coordinate-descent optimizer.

### 4. Real-Time Audition Studio and Binary Container Inspector
* **Built-In Test Signals and Custom Tracks:** Audition filters using a synthesized stereo **Reference Groove**, calibrated **Pink Noise** ($-3\text{ dB/octave}$), or local audio files via file picker or drag-and-drop (`.mp3`, `.wav`, `.flac`, `.ogg`, `.opus`, `.m4a`, `.aac`, `.aiff`).
* **Sample-Accurate A-B Looping and Bypass:** Configure A-B loop regions (`[`, `]`, `L`) and toggle instant EQ A/B bypass (`B`) with automatic anti-clipping preamp headroom calculation.
* **Raw Binary Audio Header Parser:** Because Web Audio's `decodeAudioData()` detaches the underlying `ArrayBuffer` and resamples audio to the `AudioContext` sample rate, SonaDSP inspects raw binary container headers prior to decoding. It parses **RIFF/WAVE** (`fmt ` and extensible GUIDs), **FLAC** (`STREAMINFO`), **MP3** (MPEG frame sync, CBR, and Xing/VBRI VBR headers), **AAC** (ADTS), **Ogg** (Vorbis, Opus, Ogg FLAC), **AIFF/AIFC** (80-bit IEEE extended precision float sample rates), and **ISO BMFF / MP4 / M4A** (`stsd`, `esds`, `alac`, `dOps`, `dfLa`) to report true source sample rate, bit depth, bitrate, channel count, and browser resampling notices.
* **Goertzel LTAS and Dual-Axis 60fps Canvas:** Computes 10-band ISO octave Long-Term Average Spectrum energy on track load and renders a high-DPI 60fps canvas featuring pre/post-EQ 8192-point float FFT spectrum overlays and live **RMS Error vs. Target ($100\text{ Hz}-10\text{ kHz}$)** telemetry.

### 5. Session Persistence, Undo Stack, and URL Hash Sharing
* **Serverless Shareable Links (`#s=...`):** Serializes the active IEM, AutoEq GitHub metadata, target curve, tilt/bass modifiers, preamp, and all 10 filter bands into a compact UTF-8 Base64URL hash. Opening a shared link restores the workspace and automatically fetches the corresponding AutoEq measurement from GitHub.
* **Named Browser Presets and Auto-Save:** Automatically saves the active session to `localStorage` (`sonadsp_session_v1`) and provides a preset manager (`sonadsp_presets_v1`) for storing named configurations.
* **30-Step Coalesced Undo History:** Full undo support (`Ctrl/Cmd + Z`) across AI generations, AutoEQ runs, preset imports, canvas handle drags, and coalesced slider adjustments.

---

## Supported Import and Export Formats

SonaDSP translates presets across desktop, mobile, and hardware DSP ecosystems. For non-parametric formats (such as GraphicEQ tables and convolution `.wav` impulse responses), SonaDSP extracts the magnitude response and fits a new set of editable parametric biquad bands.

| Platform / Format | Export | Import | Implementation Details |
| :--- | :---: | :---: | :--- |
| **Equalizer APO (`.txt`)** | Yes | Yes | Supports `Preamp`, `PK`/`PEQ`, `LSC`/`LSQ`/`LS`, `HSC`/`HSQ`/`HS`, `LPQ`/`LP`, `HPQ`/`HP`, `BW Oct`, `BW Hz`, and `GraphicEQ:` lines. |
| **Poweramp Equalizer (`.json`)** | Yes | Yes | Exports and imports parametric JSON presets with band colors. Automatically warns and omits unsupported pass or disabled bands on export. |
| **Convolution Impulse Response (`.wav`)** | Yes | Yes | **Export:** Renders 32-bit IEEE float mono minimum-phase IRs at $44.1 / 48 / 96\text{ kHz}$ with raised-cosine tail windowing. **Import:** Runs an in-place radix-2 FFT with $1/6$-octave power smoothing on `.wav` IRs and fits parametric biquad bands to the magnitude response. |
| **CamillaDSP (`.yml`)** | Yes | Yes | **Export:** Generates CamillaDSP v1.0+ YAML configurations. **Import:** Built-in YAML parser reads `filters` and `pipeline`, converting `Gain`, `Peaking`, `Lowshelf`, `Highshelf`, `Lowpass`, `Highpass`, octave bandwidth, and shelf slope into $Q$. |
| **Easy Effects (`.json`)** | Yes | Yes | **Export:** Generates PipeWire/Linux `equalizer#0` IIR presets using `APO (DR)` biquad mode. **Import:** Reads `Bell`, `Lo-shelf`, `Hi-shelf`, `Lo-pass`, `Hi-pass`, and `input-gain`/`output-gain`. |
| **Wavelet GraphicEQ (`.txt`)** | Yes | Yes | **Export:** Samples the composite transfer function and preamp onto Wavelet's fixed 127-band frequency grid. **Import:** Interpolates `GraphicEQ:` pairs onto the logarithmic grid and fits parametric bands. |
| **SonaDSP DSP JSON (`.json`)** | Yes | Yes | Structured JSON containing band parameters alongside normalized $a_0=1$ biquad coefficients ($b_0, b_1, b_2, a_1, a_2$) at the selected sample rate. |

---

## DSP Mathematical Reference

### Biquad Transfer Function Evaluation
Every filter band is evaluated across a 512-point logarithmic grid from $20\text{ Hz}$ to $20\text{ kHz}$. For sample rate $f_s$, center/corner frequency $f_0$, gain $G_{\text{dB}}$, and quality factor $Q$:

$$\omega_0 = \frac{2\pi f_0}{f_s}, \quad A = 10^{G_{\text{dB}} / 40}, \quad \alpha = \frac{\sin(\omega_0)}{2Q}$$

After normalizing the filter coefficients by $a_0$, the squared magnitude response $|H(e^{j\omega})|^2$ is evaluated using precomputed $\cos(\omega)$ and $\cos(2\omega)$ lookup tables per sample rate:

$$|H(e^{j\omega})|^2 = \frac{(b_0^2 + b_1^2 + b_2^2) + 2(b_0 b_1 + b_1 b_2)\cos(\omega) + 2 b_0 b_2 \cos(2\omega)}{(1 + a_1^2 + a_2^2) + 2(a_1 + a_1 a_2)\cos(\omega) + 2 a_2 \cos(2\omega)}$$

### Bandwidth and Shelf Slope Conversions on Import
When importing presets from Equalizer APO or CamillaDSP that specify octave bandwidth ($BW$) or shelf slope ($S$) instead of $Q$, SonaDSP converts them to RBJ $Q$ values:

$$Q_{\text{BW}} = \frac{\sqrt{2^{BW}}}{2^{BW} - 1}, \quad Q_{\text{shelf}} = \left[ \left(A + \frac{1}{A}\right)\left(\frac{1}{S} - 1\right) + 2 \right]^{-1/2}$$

### RMS Target Error Metric
Displayed above the 10-band octave telemetry matrix, the **RMS Error vs. Target** measures the root-mean-square deviation between the post-EQ response and the active target curve from $100\text{ Hz}$ to $10\text{ kHz}$:

$$\text{RMS}_{\text{dB}} = \sqrt{\frac{1}{N} \sum_{f_i \in [100, 10000]} \left( \text{SPL}_{\text{IEM}}(f_i) + \text{EQ}(f_i) - \text{SPL}_{\text{Target}}(f_i) \right)^2}$$

Because `LOG_FREQS` is logarithmically spaced, an unweighted mean over the grid indices weights each octave equally.

---

## Controls and Keyboard Shortcuts

| Input / Shortcut | Action |
| :--- | :--- |
| **Drag Band Handle (Canvas)** | Adjust band **Frequency** ($20\text{ Hz} - 20\text{ kHz}$) and **Gain** ($\pm 15\text{ dB}$) in real time |
| **Mouse Wheel on Band Handle** | Fine-tune filter **$Q$ factor** ($0.10 - 18.00$) in $\pm 0.20$ increments |
| **`B`** | Toggle instant **EQ Active [A] / Bypass Flat [B]** comparison |
| **`[`** | Set A-B loop start point (**A**) at the current playhead position |
| **`]`** | Set A-B loop end point (**B**) at the current playhead position |
| **`L`** | Toggle **A-B Loop** playback on/off |
| **`Ctrl + Z` / `Cmd + Z`** | **Undo** last EQ modification (30-level history stack) |
| **Drag and Drop Audio File** | Drop any supported audio file anywhere on the window to decode and audition |

---

## Local Development

SonaDSP is a static, zero-build web application. Run it locally using any static HTTP server so `AudioWorklet` and `fetch` requests operate without `file://` CORS restrictions:

```bash
# Clone the repository
git clone https://github.com/treasure7788/SonaDSP.git
cd SonaDSP

# Option 1: Python 3 built-in HTTP server
python3 -m http.server 8080

# Option 2: Node.js serve
npx serve .
```

Open `http://localhost:8080` in any modern Chromium, Firefox, or Safari browser.

---

## Project Structure

```text
SonaDSP/
├── index.html       # Application layout, modals, dual-axis canvas, and styling
├── js/
│   └── app.js       # Core DSP engine, AudioWorklet, AutoEq indexer, solvers, parsers, and UI state
├── LICENSE          # Repository license
└── README.md        # Project documentation
```

---

## Acknowledgments

* **[AutoEq](https://github.com/jaakkopasanen/AutoEq)** by Jaakko Pasanen for the open-source measurement database and index of 6,000+ headphones and IEMs (`oratory1990`, `crinacle`, `rtings`, and contributors).
* **Robert Bristow-Johnson** for the *Audio EQ Cookbook* biquad filter transfer functions.
* **[CamillaDSP](https://github.com/HEnquist/camilladsp)**, **[Equalizer APO](https://sourceforge.net/projects/equalizerapo/)**, **[Easy Effects](https://github.com/wwmm/easyeffects)**, **[Wavelet](https://github.com/pittvandewitt/Wavelet)**, and **Poweramp** for their respective filter and preset specifications.

---

## License

Distributed under the MIT License. See [`LICENSE`](./LICENSE) for full license text.