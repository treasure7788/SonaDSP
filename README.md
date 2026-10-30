# SonaDSP — Parametric IEM & Audio Workbench

**SonaDSP** is a zero-dependency, browser-based parametric equalizer and acoustic measurement workbench built on the Web Audio API. It combines real-time multi-band `BiquadFilterNode` audio processing, live frequency response (FR) graphing for over 6,000 headphones and IEMs, and an AI-assisted acoustic controller into a clean, lightweight interface.

---

## Key Features

### 1. Real-Time Web Audio DSP Engine
* **Live Parametric EQ Chain:** Dynamic series of `BiquadFilterNode` filters (`Peaking`, `Low Shelf`, `High Shelf`, `Low Pass`, `High Pass`) with automatic negative preamp gain staging to prevent digital clipping.
* **Click-Free A/B Comparison:** Instant bypass toggle using `AudioParam.setTargetAtTime` smoothing to compare stock vs. EQ'd audio during live playback without pops or clicks.
* **Local Audio & Reference Signals:** Decode and play local `FLAC`, `WAV`, `MP3`, or `OGG` tracks directly in the browser, or test filters against a built-in harmonic synth loop and calibrated pink noise generator.

### 2. Dual-Axis Interactive Canvas (FR + 60fps FFT)
* **Left Axis (`dB SPL`):** Plots the raw transducer frequency response (normalized at `500 Hz`), the active reference target curve, the composite EQ transfer function, and the resulting Post-EQ frequency response across `20 Hz – 20 kHz`.
* **Right Axis (`-90 dBFS` to `0 dBFS`):** Renders a real-time 4096-point Fast Fourier Transform (FFT) spectrum analyzer with adjustable input gain (`+0 dB` to `+36 dB`) to visualize track energy and sibilance peaks live.
* **Direct Canvas Manipulation:** Drag numbered EQ nodes directly on the graph to adjust Frequency and Gain, or use the mouse scroll wheel over any node to widen or narrow its Q factor.

### 3. 6,000+ AutoEq Measurement Database & Custom Targets
* **Built-in & Live GitHub Indexing:** Ships with instant offline profiles for popular IEMs and fetches the master [AutoEq](https://github.com/jaakkopasanen/AutoEq) measurement index (`6,000+` models across Crinacle 711 & B&K 5128, Oratory1990, Super* Review, and Rtings) directly in the browser.
* **Reference Targets with Tilt & Shelf Controls:** Switch between **JM-1 (DF + Tilt)**, **IEF Neutral 2023**, **Harman IE 2019v2**, and **Diffuse Field**, and fine-tune the target slope (`dB/octave`) and sub-bass shelf (`dB`) in real time.
* **Custom FR Import:** Load any exported `.txt` or `.csv` frequency response file directly onto the canvas.

### 4. AI Acoustic Controller & Local AutoEQ Solver
* **Telemetry-Driven Tuning:** Computes a 10-band octave deviation map (`31 Hz` to `16 kHz`) between the loaded IEM and the active target curve, plus a Long-Term Average Spectrum (LTAS) of the loaded audio track.
* **Natural Language & Vision Support:** Describe desired tonal adjustments in plain English (e.g., *"Match the target below 1kHz, keep mid-bass warm, and notch out the 6kHz peak"*) or attach a frequency response screenshot using any OpenAI-compatible multimodal endpoint.
* **Zero-Key Offline Fallback:** Includes a deterministic local least-squares acoustic solver so one-click target matching works immediately even without an external API key configured.

### 5. Hardware & System EQ Export
* **Equalizer APO / Peace (`.txt`):** Exports standard `Preamp` and `Filter` directives ready to load into Equalizer APO or Peace GUI on Windows.
* **Poweramp Equalizer (`.json`):** Exports formatted parametric band presets compatible with Poweramp on Android.

---

## Project Structure

SonaDSP is built with vanilla HTML5, CSS3, and ES6+ JavaScript with zero build steps or external bundlers required:

```text
sonadsp/
├── index.html   # Application layout, graph stage, PEQ table, and modal markup
├── style.css    # Warm studio color tokens, responsive grid layout, and tabular UI styles
├── app.js       # Web Audio API DSP graph, Canvas renderer, AutoEq parser, and AI Controller
└── README.md    # Documentation
Getting Started
Run Locally
Because SonaDSP uses vanilla JavaScript without a build step, you can open index.html directly in any modern browser or serve the folder locally:

Bash
# Clone the repository
git clone [https://github.com/](https://github.com/)<your-username>/sonadsp.git
cd sonadsp

# Optional: start a simple local static server
python3 -m http.server 8080
Then open http://localhost:8080 in your browser.

Configuring the AI Controller (Optional)
Click AI Config in the top navigation bar.

Enter an OpenAI-compatible /v1/chat/completions endpoint URL, your API key, and the model identifier.

Credentials are stored strictly in your browser's local localStorage and are never hardcoded or transmitted elsewhere.

If no API key is provided, SonaDSP automatically uses its built-in Local Acoustic Solver to compute parametric filters from the active IEM and target curves.

Credits & Acknowledgments
Frequency Response Database: Live headphone and IEM measurements are sourced from jaakkopasanen/AutoEq and respective measurement databases (Crinacle, Oratory1990, Super* Review, Rtings).

License
This project is licensed under the MIT License.
