# SonaDSP — Parametric Audio & IEM Workbench

**SonaDSP** is a zero-dependency, browser-based parametric equalizer and acoustic measurement workbench built on the Web Audio API. It combines real-time multi-band `BiquadFilterNode` audio processing, live frequency response (FR) graphing for over 6,000 headphones and IEMs, full-scale FFT spectrum analysis, and an AI-assisted acoustic controller into a clean studio interface.

---

## Key Features

### 1. Real-Time Web Audio DSP Engine
* **Live Parametric EQ Chain:** Dynamic series of up to 10 `BiquadFilterNode` filters (`Peaking`, `Low Shelf`, `High Shelf`, `Low Pass`, `High Pass`) wired in series with automatic negative preamp gain staging to prevent digital clipping.
* **Click-Free A/B Comparison:** Instant bypass toggle (`EQ Active [A]` vs. `Bypass Flat [B]`, or press `B` on your keyboard) using `AudioParam.setTargetAtTime` exponential smoothing to compare stock vs. EQ'd audio during live playback without pops or clicks.
* **Local Audio & Reference Generators:** Decode and play local `FLAC`, `WAV`, `MP3`, `OGG`, or `OPUS` tracks directly in the browser, or evaluate filter changes against a built-in harmonic reference groove and a calibrated pink noise generator.

### 2. Dual-Axis Interactive Canvas (FR + 60fps FFT)
* **Left Y-Axis (`Relative dB` / `dB SPL`):** Plots the raw transducer frequency response (normalized at `500 Hz` or `1 kHz`), the active reference target curve, individual filter band shaded regions, the composite EQ transfer function, and the resulting Post-EQ frequency response across `20 Hz – 20 kHz`.
* **Right Y-Axis (`-90 dBFS` to `0 dBFS`):** Renders a real-time 8192-point floating-point Fast Fourier Transform (FFT) pre/post spectrum analyzer with adjustable visual gain (`+0 dB` to `+36 dB`) to inspect track energy and sibilance peaks live.
* **Direct Canvas Manipulation:**
  * **Drag** any numbered EQ node directly on the canvas to adjust **Frequency (`Hz`)** and **Gain (`dB`)**.
  * **Scroll** your mouse wheel over any node (or anywhere on the plot for the selected band) to widen or narrow its **Q Factor**.
  * **Hover** across the plot for a live crosshair readout showing exact frequency, stock SPL, Post-EQ SPL, and filter delta.

### 3. 6,000+ AutoEq Measurement Database & Custom Targets
* **Built-In & Live GitHub Indexing:** Ships with instant offline profiles for popular IEMs (Simgot EM6L, CrinEar Daybreak, Truthear Hexa, Moondrop Blessing 3, Variations, 7Hz Zero:2, Dunu DaVinci, Sennheiser IE 200, Letshuoer S12 Pro, Sony IER-M9, Etymotic ER2XR) and dynamically indexes the master [AutoEq](https://github.com/jaakkopasanen/AutoEq) measurement catalog (`6,000+` models across Crinacle 711 & B&K 5128, Oratory1990, Super* Review, and Rtings).
* **Customizable Reference Targets:** Switch between **JM-1 (DF + Tilt)**, **IEF Neutral 2023**, **Harman IE 2019v2**, and **Diffuse Field (5128)**, with real-time sliders for **Target Tilt (`dB/octave`)** and **Bass Shelf (`dB`)**.
* **Custom FR Import:** Load any exported `.txt` or `.csv` frequency response measurement file directly onto the canvas.

### 4. AI Acoustic Controller & Local AutoEQ Solver
* **Octave Telemetry & Track LTAS:** Computes a 10-band ISO octave deviation map (`31 Hz` to `16 kHz`) between the loaded IEM and the active target curve, alongside a Long-Term Average Spectrum (LTAS) analysis of the loaded audio buffer.
* **Natural Language & Vision Support:** Describe desired tonal adjustments in plain English (e.g., *"Match the target below 1kHz, keep a warm sub-bass shelf, and notch out the 4.5kHz glare"*) or attach a frequency response screenshot using any OpenAI-compatible chat completions endpoint.
* **Zero-Key Offline Fallback:** Includes a built-in deterministic acoustic solver so one-click target matching and prompt shaping work immediately offline even without an external API key configured.

### 5. System & Mobile EQ Export / Import
* **Equalizer APO / Peace (`.txt`):** Exports and imports standard `Preamp` and `Filter` directives ready for Equalizer APO or Peace GUI on Windows.
* **Poweramp Equalizer (`.json`):** One-click export of formatted parametric band presets compatible with Poweramp Equalizer on Android.

---
~~~text
sonadsp/
├── css/
│   └── style.css    # Warm studio color tokens, range sliders, and tabular UI styles
├── js/
│   └── app.js       # Web Audio API DSP chain, RBJ Biquad math, AutoEq fetcher, and AI Controller
├── index.html       # Studio layout, dual-axis canvas stage, PEQ table, and modals
├── LICENSE          # MIT License
└── README.md        # Project documentation
~~~


---


## Controls & Shortcuts

| Action | Control / Shortcut |
| :--- | :--- |
| **Play / Pause Audio** | Click **Play / Pause** in the top transport bar |
| **Toggle A/B Bypass** | Press **`B`** on keyboard or click **EQ Active [A] / Bypass Flat [B]** |
| **Adjust Band Frequency & Gain** | Drag any numbered node (`1–10`) on the graph canvas |
| **Adjust Band Q Factor** | Hover over a node on the canvas and scroll the **Mouse Wheel** |
| **Normalize Curves** | Toggle **500Hz** or **1kHz** below the graph |
| **Fit IEM to Active Target** | Click **AutoEQ to Target** below the graph |

---

## DSP & Mathematical Architecture

* **Transfer Function Evaluation:** Evaluates exact 2nd-order digital biquad coefficients ($b_0, b_1, b_2, a_0, a_1, a_2$) per the Robert Bristow-Johnson (RBJ) Audio EQ Cookbook across 512 logarithmically spaced frequencies from $20\text{ Hz}$ to $20\text{ kHz}$:
  $$H(e^{j\omega}) = \frac{b_0 + b_1 e^{-j\omega} + b_2 e^{-j2\omega}}{a_0 + a_1 e^{-j\omega} + a_2 e^{-j2\omega}}$$
* **Anti-Clipping Auto-Preamp:** Continuously evaluates the composite transfer function across all active bands and sets the master `GainNode` headroom to $-\left(\max\left(0, \text{PeakBoost}_{\text{dB}}\right) + 0.3\text{ dB}\right)$.

---

## Credits & Acknowledgments

* **Frequency Response Measurements:** Headphone and IEM measurements and official AutoEq profiles are fetched from [jaakkopasanen/AutoEq](https://github.com/jaakkopasanen/AutoEq) and respective measurement databases (Crinacle, Oratory1990, Super* Review, Rtings).

## License

This project is licensed under the [MIT License](LICENSE).
