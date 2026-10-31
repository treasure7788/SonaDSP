// SonaDSP 
      // ====================================================================
      // 1. CONSTANTS & LOGARITHMIC FREQUENCY GRID (512 POINTS, 20Hz - 20kHz)
      // ====================================================================
      const NUM_FREQ_POINTS = 512;
      const MIN_FREQ = 20;
      const MAX_FREQ = 20000;
      const MIN_LOG_F = Math.log10(MIN_FREQ);
      const MAX_LOG_F = Math.log10(MAX_FREQ);

      const LOG_FREQS = new Float32Array(NUM_FREQ_POINTS);
      for (let i = 0; i < NUM_FREQ_POINTS; i++) {
        LOG_FREQS[i] = Math.pow(10, MIN_LOG_F + (i / (NUM_FREQ_POINTS - 1)) * (MAX_LOG_F - MIN_LOG_F));
      }

      const ISO_OCTAVES = [
        { freq: 31.5, label: '31' },
        { freq: 63, label: '63' },
        { freq: 125, label: '125' },
        { freq: 250, label: '250' },
        { freq: 500, label: '500' },
        { freq: 1000, label: '1k' },
        { freq: 2000, label: '2k' },
        { freq: 4000, label: '4k' },
        { freq: 8000, label: '8k' },
        { freq: 16000, label: '16k' }
      ];

      const BAND_COLORS = [
        '#C83E2B', // Vermilion
        '#235789', // Cobalt
        '#1D5B4C', // Forest
        '#B86B28', // Amber Bronze
        '#6A4C73', // Plum
        '#1D7072', // Deep Teal
        '#9E473B', // Sienna
        '#4A5859', // Slate
        '#7F5539', // Umber
        '#3B6E5C'  // Pine
      ];

      const FILTER_TYPES = [
        { value: 'peaking', short: 'PK', apo: 'PK', label: 'PK (Peaking)' },
        { value: 'lowshelf', short: 'LSQ', apo: 'LSC', label: 'LSQ (Low Shelf)' },
        { value: 'highshelf', short: 'HSQ', apo: 'HSC', label: 'HSQ (High Shelf)' },
        { value: 'lowpass', short: 'LP', apo: 'LPQ', label: 'LP (Low Pass)' },
        { value: 'highpass', short: 'HP', apo: 'HPQ', label: 'HP (High Pass)' }
      ];

      // ====================================================================
      // 2. BUILT-IN HIGH-PRECISION IEM PROFILES & CUSTOMIZABLE TARGET ENGINE
      // ====================================================================
      function gaussianBell(logF, centerHz, widthOctaves, gainDb) {
        const logC = Math.log10(centerHz);
        const sigma = widthOctaves * 0.30103;
        return gainDb * Math.exp(-Math.pow((logF - logC) / Math.max(0.02, sigma), 2));
      }

      // Evaluate Target Curve with Live Target Tilt (dB/octave around 1kHz) & Bass Shelf Boost (dB below 105Hz)
      function evaluateRawTargetDb(targetId, f, tiltDbPerOct, bassShelfDb) {
        if (targetId === 'none') return 0;
        const logF = Math.log10(f);

        // User-controlled low-shelf bass boost below 105Hz
        const customBassShelf = bassShelfDb / (1 + Math.pow(f / 95, 2.15));
        // User-controlled spectral tilt pivoted at 1000Hz
        const customTilt = tiltDbPerOct * Math.log2(f / 1000);

        if (targetId === 'jm1') {
          // JM-1 Population Average Diffuse Field ear-gain + concha dip + user Tilt & Bass Shelf
          const earGain = gaussianBell(logF, 2850, 1.35, 6.8) + gaussianBell(logF, 4500, 0.9, 2.1);
          const conchaDip = gaussianBell(logF, 7200, 0.55, -2.0);
          return customBassShelf + customTilt + earGain + conchaDip;
        }

        if (targetId === 'ief2023') {
          const earGain = gaussianBell(logF, 2900, 1.4, 6.2) + gaussianBell(logF, 4800, 0.85, 1.5);
          const trebleTaper = f > 4000 ? -2.2 * Math.log10(f / 4000) : 0;
          return customBassShelf + (customTilt * 0.65) + earGain + trebleTaper;
        }

        if (targetId === 'harman2019') {
          const midTuck = gaussianBell(logF, 230, 1.1, -1.6);
          const earGain = gaussianBell(logF, 3150, 1.25, 8.2);
          const airPeak = gaussianBell(logF, 9200, 0.7, 2.2);
          return customBassShelf + (customTilt * 0.5) + midTuck + earGain + airPeak;
        }

        if (targetId === 'df_5128') {
          const earGain = gaussianBell(logF, 2750, 1.35, 8.0) + gaussianBell(logF, 5200, 0.9, 2.8);
          const dip = gaussianBell(logF, 7800, 0.5, -2.4);
          return customBassShelf + customTilt + earGain + dip;
        }

        return 0;
      }

      const BUILTIN_IEM_PROFILES = {
        simgot_em6l: {
          name: 'Simgot EM6L (711 Coupler)',
          evalDb: (f) => {
            const logF = Math.log10(f);
            return (
              5.4 / (1 + Math.pow(f / 115, 1.85)) +
              gaussianBell(logF, 210, 1.2, 0.9) +
              gaussianBell(logF, 2950, 1.25, 7.2) +
              gaussianBell(logF, 4650, 0.65, 3.6) +
              gaussianBell(logF, 6200, 0.45, -2.2) +
              gaussianBell(logF, 8200, 0.40, 2.8) +
              gaussianBell(logF, 12800, 0.60, 1.5)
            );
          }
        },
        crinear_daybreak: {
          name: 'CrinEar Daybreak (5128 / DF)',
          evalDb: (f) => {
            const logF = Math.log10(f);
            return (
              4.6 / (1 + Math.pow(f / 82, 2.2)) +
              -0.75 * Math.log2(f / 500) +
              gaussianBell(logF, 2800, 1.35, 6.5) +
              gaussianBell(logF, 4300, 0.85, 1.8) +
              gaussianBell(logF, 7400, 0.50, -1.5) +
              gaussianBell(logF, 11500, 0.65, 1.2)
            );
          }
        },
        truthear_hexa: {
          name: 'Truthear Hexa',
          evalDb: (f) => {
            const logF = Math.log10(f);
            return (
              4.2 / (1 + Math.pow(f / 72, 2.3)) +
              gaussianBell(logF, 180, 1.0, -0.7) +
              gaussianBell(logF, 2900, 1.3, 6.4) +
              gaussianBell(logF, 8100, 0.42, 2.4)
            );
          }
        },
        moondrop_blessing3: {
          name: 'Moondrop Blessing 3',
          evalDb: (f) => {
            const logF = Math.log10(f);
            return (
              3.5 / (1 + Math.pow(f / 75, 2.1)) +
              gaussianBell(logF, 240, 1.1, -0.9) +
              gaussianBell(logF, 3050, 1.25, 7.6) +
              gaussianBell(logF, 4700, 0.7, 2.8) +
              gaussianBell(logF, 11000, 0.7, 1.8)
            );
          }
        },
        moondrop_variations: {
          name: 'Moondrop Variations',
          evalDb: (f) => {
            const logF = Math.log10(f);
            return (
              7.2 / (1 + Math.pow(f / 78, 2.5)) +
              gaussianBell(logF, 250, 1.0, -1.8) +
              gaussianBell(logF, 3100, 1.25, 7.8) +
              gaussianBell(logF, 11500, 0.65, 2.6)
            );
          }
        },
        thieaudio_monarch_mk3: {
          name: 'Thieaudio Monarch MkIII',
          evalDb: (f) => {
            const logF = Math.log10(f);
            return (
              6.2 / (1 + Math.pow(f / 85, 2.2)) +
              gaussianBell(logF, 230, 1.0, -0.8) +
              gaussianBell(logF, 2900, 1.3, 6.9) +
              gaussianBell(logF, 5200, 0.6, 2.2) +
              gaussianBell(logF, 13000, 0.6, 3.1)
            );
          }
        },
        '7hz_zero2': {
          name: '7Hz x Crinacle Zero:2',
          evalDb: (f) => {
            const logF = Math.log10(f);
            return (
              5.8 / (1 + Math.pow(f / 110, 1.9)) +
              gaussianBell(logF, 2850, 1.3, 6.1) +
              (f > 5000 ? -2.2 * Math.log10(f / 5000) : 0)
            );
          }
        },
        dunu_davinci: {
          name: 'Dunu x Gizaudio DaVinci',
          evalDb: (f) => {
            const logF = Math.log10(f);
            return (
              6.8 / (1 + Math.pow(f / 115, 2.0)) +
              gaussianBell(logF, 220, 1.1, 1.1) +
              gaussianBell(logF, 2750, 1.3, 5.8) +
              (f > 4500 ? -3.0 * Math.log10(f / 4500) : 0)
            );
          }
        },
        sennheiser_ie200: {
          name: 'Sennheiser IE 200',
          evalDb: (f) => {
            const logF = Math.log10(f);
            return (
              5.0 / (1 + Math.pow(f / 100, 1.9)) +
              gaussianBell(logF, 1450, 0.9, -1.6) +
              gaussianBell(logF, 3100, 1.1, 5.5) +
              gaussianBell(logF, 8600, 0.45, 3.8)
            );
          }
        },
        letshuoer_s12pro: {
          name: 'Letshuoer S12 Pro',
          evalDb: (f) => {
            const logF = Math.log10(f);
            return (
              5.6 / (1 + Math.pow(f / 115, 1.85)) +
              gaussianBell(logF, 2400, 1.2, 5.5) +
              gaussianBell(logF, 4800, 0.7, 3.4) +
              gaussianBell(logF, 8200, 0.55, 4.2) +
              gaussianBell(logF, 11800, 0.6, 2.9)
            );
          }
        },
        sony_ier_m9: {
          name: 'Sony IER-M9',
          evalDb: (f) => {
            const logF = Math.log10(f);
            return (
              4.8 / (1 + Math.pow(f / 120, 1.8)) +
              gaussianBell(logF, 250, 1.1, 1.2) +
              gaussianBell(logF, 2700, 1.2, 5.2) +
              gaussianBell(logF, 5800, 0.6, -2.5) +
              gaussianBell(logF, 11000, 0.7, 1.4)
            );
          }
        },
        etymotic_er2xr: {
          name: 'Etymotic ER2XR',
          evalDb: (f) => {
            const logF = Math.log10(f);
            return (
              3.6 / (1 + Math.pow(f / 95, 2.1)) +
              gaussianBell(logF, 2650, 1.25, 8.4) +
              (f > 6000 ? -3.8 * Math.log10(f / 6000) : 0)
            );
          }
        },
        flat_none: {
          name: 'Flat / No IEM (Track EQ Only)',
          evalDb: () => 0
        }
      };

      // ====================================================================
      // 3. APPLICATION STATE & FULL AUTOEQ 6,000+ CATALOG STATE
      // ====================================================================
      const state = {
        selectedIemKey: 'simgot_em6l',
        customIemCurve: null,
        customIemName: '',
        activeAutoEqEntry: null, // Holds { name, relPath, source, rig } when an AutoEq GitHub model is loaded

        targetCurveKey: 'jm1',
        targetCustomCurve: null, // Used when targetCurveKey === 'iem:custom' (AutoEq model set as target)
        targetCustomName: '',
        targetTiltDbPerOct: -0.8,
        targetBassShelfDb: 4.5,
        normFreqHz: 500,
        normRefSpl: 60.0,

        isEqActive: true,
        preampDb: -3.8,
        autoPreamp: true,
        selectedBandId: 'b1',
        history: [], // undo stack of band snapshots (most recent last)

        showLiveFft: true,
        fftGainOffsetDb: 14,

        audioSourceType: 'synth',
        fileName: 'Reference Groove (Built-in)',
        isPlaying: false,
        duration: 8.0,
        ltasBands: ISO_OCTAVES.map((o) => ({ ...o, db: -4.0 })),

        // Full 6,000+ AutoEq Index State
        autoEqCatalog: [],
        autoEqLoaded: false,

        // AI Config
        apiEndpoint: 'https://api.openai.com/v1/chat/completions',
        modelId: 'gpt-4o',
        apiKey: '',
        useFallback: true,
        uploadedGraphDataUrl: null,

        bands: [
          { id: 'b1', enabled: true, filterType: 'lowshelf', frequency: 75, gain: 2.2, Q: 0.71, rationale: 'Sub-bass shelf alignment' },
          { id: 'b2', enabled: true, filterType: 'peaking', frequency: 215, gain: -1.8, Q: 1.35, rationale: 'Clean lower-midrange warmth' },
          { id: 'b3', enabled: true, filterType: 'peaking', frequency: 1850, gain: 1.2, Q: 1.40, rationale: 'Center vocal articulation' },
          { id: 'b4', enabled: true, filterType: 'peaking', frequency: 4650, gain: -3.4, Q: 3.10, rationale: 'Tame 4.65kHz upper-midrange glare' },
          { id: 'b5', enabled: true, filterType: 'peaking', frequency: 8200, gain: -2.6, Q: 4.00, rationale: 'Smooth 8.2kHz coupler peak' }
        ]
      };

      const stockIemSplArray = new Float32Array(NUM_FREQ_POINTS);
      const targetSplArray = new Float32Array(NUM_FREQ_POINTS);
      const compositeEqDbArray = new Float32Array(NUM_FREQ_POINTS);

      // ====================================================================
      // 3b. IEM-AS-TARGET HELPERS
      // Target keys: 'jm1' | 'ief2023' | 'harman2019' | 'df_5128' | 'none'
      //              'iem:<builtinKey>'  -> a built-in IEM profile used as the target
      //              'iem:custom'        -> an AutoEq model loaded via the "Target" button
      // ====================================================================
      const TARGET_DEFAULTS = {
        jm1: { tilt: -0.8, bass: 4.5 },
        ief2023: { tilt: -0.4, bass: 3.5 },
        harman2019: { tilt: -0.2, bass: 6.5 },
        df_5128: { tilt: 0.0, bass: 0.0 }
      };

      function isIemTarget(key) {
        return typeof key === 'string' && key.startsWith('iem:');
      }

      function getTargetLabel() {
        const k = state.targetCurveKey;
        if (k === 'iem:custom') return state.targetCustomName || 'Custom IEM';
        if (isIemTarget(k)) return BUILTIN_IEM_PROFILES[k.slice(4)]?.name || 'IEM';
        return k.toUpperCase();
      }

      function getTargetDefaults(key) {
        if (key === 'none') return null;
        if (isIemTarget(key)) return { tilt: 0.0, bass: 0.0 };
        return TARGET_DEFAULTS[key] || { tilt: 0.0, bass: 0.0 };
      }

      function evalIemTargetRaw(i) {
        const k = state.targetCurveKey;
        const f = LOG_FREQS[i];
        let base = 0;
        if (k === 'iem:custom') {
          base = state.targetCustomCurve ? state.targetCustomCurve[i] : 0;
        } else {
          base = BUILTIN_IEM_PROFILES[k.slice(4)]?.evalDb(f) ?? 0;
        }
        const bass = state.targetBassShelfDb / (1 + Math.pow(f / 95, 2.15));
        const tilt = state.targetTiltDbPerOct * Math.log2(f / 1000);
        return base + bass + tilt;
      }

      function syncTargetSlidersUi() {
        const t = state.targetTiltDbPerOct;
        const b = state.targetBassShelfDb;
        const tiltSlider = document.getElementById('tiltSlider');
        const tiltReadout = document.getElementById('tiltReadout');
        const bassSlider = document.getElementById('bassShelfSlider');
        const bassReadout = document.getElementById('bassShelfReadout');
        if (tiltSlider) tiltSlider.value = t;
        if (tiltReadout) tiltReadout.textContent = `${t > 0 ? '+' : ''}${t.toFixed(1)} dB/oct`;
        if (bassSlider) bassSlider.value = b;
        if (bassReadout) bassReadout.textContent = `${b > 0 ? '+' : ''}${b.toFixed(1)} dB`;
      }

      function populateIemTargetOptions() {
        const sel = document.getElementById('targetSelect');
        if (!sel || sel.querySelector('optgroup[data-iem-targets]')) return;
        const grp = document.createElement('optgroup');
        grp.label = 'IEM as target';
        grp.setAttribute('data-iem-targets', '1');
        Object.entries(BUILTIN_IEM_PROFILES).forEach(([key, p]) => {
          if (key === 'flat_none') return;
          const o = document.createElement('option');
          o.value = `iem:${key}`;
          o.textContent = `${p.name} (approx.)`;
          grp.appendChild(o);
        });
        sel.appendChild(grp);
      }

      // The built-in IEM profiles are smooth synthetic approximations of each model's measured
      // response, not measurements. Say so in the dropdown; real data comes from the AutoEq search.
      const APPROX_NOTE = 'Built-in curve is an approximation, not a measurement. Use the AutoEq search for real data.';
      function labelApproximateIemProfiles() {
        const sel = document.getElementById('iemSelect');
        if (!sel) return;
        Array.from(sel.options).forEach((opt) => {
          if (opt.value === 'flat_none' || !BUILTIN_IEM_PROFILES[opt.value]) return;
          if (!opt.textContent.includes('(approx.)')) opt.textContent = `${opt.textContent.trim()} (approx.)`;
        });
        sel.title = APPROX_NOTE;
      }

      function setCustomIemTarget(curve, name) {
        state.targetCustomCurve = curve;
        state.targetCustomName = name;
        state.targetCurveKey = 'iem:custom';
        state.targetTiltDbPerOct = 0.0;
        state.targetBassShelfDb = 0.0;

        const sel = document.getElementById('targetSelect');
        let opt = sel.querySelector('option[value="iem:custom"]');
        if (!opt) {
          opt = document.createElement('option');
          opt.value = 'iem:custom';
          sel.prepend(opt);
        }
        opt.textContent = `AutoEq target: ${name}`;
        sel.value = 'iem:custom';

        syncTargetSlidersUi();
        syncWebAudioBiquadNodes();
      }

      // ====================================================================
      // 4. ENTIRE AUTOEQ 6,000+ GITHUB LIBRARY INDEXER & FETCHER
      // ====================================================================
      const CURATED_FALLBACK_CATALOG = [
        { name: 'Simgot EM6L', relPath: 'oratory1990/in-ear/Simgot%20EM6L', source: 'oratory1990', rig: 'in-ear' },
        { name: 'Simgot EA500 LM', relPath: 'crinacle/711%20in-ear/Simgot%20EA500%20LM', source: 'crinacle', rig: '711 in-ear' },
        { name: 'Simgot SuperMix 4', relPath: 'crinacle/711%20in-ear/Simgot%20SuperMix%204', source: 'crinacle', rig: '711 in-ear' },
        { name: 'Truthear Hexa', relPath: 'crinacle/711%20in-ear/Truthear%20Hexa', source: 'crinacle', rig: '711 in-ear' },
        { name: 'Truthear Nova', relPath: 'crinacle/711%20in-ear/Truthear%20Nova', source: 'crinacle', rig: '711 in-ear' },
        { name: 'Truthear x Crinacle Zero:RED', relPath: 'crinacle/711%20in-ear/Truthear%20x%20Crinacle%20Zero%20RED', source: 'crinacle', rig: '711 in-ear' },
        { name: 'Moondrop Blessing 3', relPath: 'crinacle/711%20in-ear/Moondrop%20Blessing%203', source: 'crinacle', rig: '711 in-ear' },
        { name: 'Moondrop Variations', relPath: 'crinacle/711%20in-ear/Moondrop%20Variations', source: 'crinacle', rig: '711 in-ear' },
        { name: 'Moondrop Chu II', relPath: 'crinacle/711%20in-ear/Moondrop%20Chu%202', source: 'crinacle', rig: '711 in-ear' },
        { name: 'Moondrop Dusk', relPath: 'crinacle/711%20in-ear/Moondrop%20x%20Crinacle%20Dusk%20(Default)', source: 'crinacle', rig: '711 in-ear' },
        { name: '7Hz Salnotes Zero 2', relPath: 'crinacle/711%20in-ear/7Hz%20Salnotes%20Zero%202', source: 'crinacle', rig: '711 in-ear' },
        { name: '7Hz Timeless', relPath: 'crinacle/711%20in-ear/7Hz%20Timeless', source: 'crinacle', rig: '711 in-ear' },
        { name: 'Sennheiser IE 200', relPath: 'oratory1990/in-ear/Sennheiser%20IE%20200', source: 'oratory1990', rig: 'in-ear' },
        { name: 'Sennheiser IE 600', relPath: 'oratory1990/in-ear/Sennheiser%20IE%20600', source: 'oratory1990', rig: 'in-ear' },
        { name: 'Sennheiser HD 600', relPath: 'oratory1990/over-ear/Sennheiser%20HD%20600', source: 'oratory1990', rig: 'over-ear' },
        { name: 'Sennheiser HD 650', relPath: 'oratory1990/over-ear/Sennheiser%20HD%20650', source: 'oratory1990', rig: 'over-ear' },
        { name: 'Letshuoer S12 Pro', relPath: 'crinacle/711%20in-ear/Letshuoer%20S12%20Pro', source: 'crinacle', rig: '711 in-ear' },
        { name: 'Thieaudio Monarch MkIII', relPath: 'crinacle/711%20in-ear/ThieAudio%20Monarch%20Mk3', source: 'crinacle', rig: '711 in-ear' },
        { name: 'Etymotic ER2XR', relPath: 'oratory1990/in-ear/Etymotic%20ER2XR', source: 'oratory1990', rig: 'in-ear' },
        { name: 'Sony IER-M9', relPath: 'crinacle/711%20in-ear/Sony%20IER-M9', source: 'crinacle', rig: '711 in-ear' }
      ];

      async function fetchFullAutoEqMasterIndex() {
        const badge = document.getElementById('autoEqIndexBadge');
        state.autoEqCatalog = CURATED_FALLBACK_CATALOG.slice();
        renderAutoEqSearchResults();

        const indexUrls = [
          'https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/INDEX.md',
          'https://cdn.jsdelivr.net/gh/jaakkopasanen/AutoEq@master/results/INDEX.md'
        ];

        for (const url of indexUrls) {
          try {
            const resp = await fetch(url);
            if (!resp.ok) continue;
            const mdText = await resp.text();

            // Parse lines like: - [Model Name](./source/rig/Model%20Name) by source on rig
            const lines = mdText.split(/\r?\n/);
            const parsedCatalog = [];
            const linkRx = /^\s*-\s*\[([^\]]+)\]\(\.\/([^)]+)\)(?:\s+by\s+([^]+?))?$/;

            for (let i = 0; i < lines.length; i++) {
              const m = lines[i].match(linkRx);
              if (m) {
                const name = m[1].trim();
                const relPath = m[2].trim();
                const segs = relPath.split('/');
                const source = segs[0] ? decodeURIComponent(segs[0]) : 'AutoEq';
                const rig = segs.length > 2 ? decodeURIComponent(segs[1]) : 'in-ear';
                parsedCatalog.push({ name, relPath, source, rig });
              }
            }

            if (parsedCatalog.length > 100) {
              state.autoEqCatalog = parsedCatalog;
              state.autoEqLoaded = true;
              if (badge) {
                badge.textContent = `Search AutoEq (${parsedCatalog.length.toLocaleString()})`;
              }
              renderAutoEqSearchResults();
              return;
            }
          } catch (_) {
            // Try next mirror
          }
        }

        if (badge) {
          badge.textContent = 'Search AutoEq DB';
        }
      }

      // Escapes text before it goes into an innerHTML template. Needed for anything that can come
      // from outside the app: the AutoEq index, an AI model's band "rationale", imported files.
      function escapeHtml(value) {
        return String(value == null ? '' : value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function renderAutoEqSearchResults() {
        const box = document.getElementById('autoEqSearchResultsBox');
        if (!box) return;

        const query = (document.getElementById('autoEqLiveSearchInput')?.value || '').trim().toLowerCase();
        const sourceFilter = document.getElementById('sourceFilterSelect')?.value || 'all';

        const tokens = query ? query.split(/\s+/) : [];
        const matches = [];
        const catalog = state.autoEqCatalog;

        for (let i = 0; i < catalog.length; i++) {
          const item = catalog[i];
          if (sourceFilter !== 'all') {
            const sfLower = sourceFilter.toLowerCase();
            if (!item.source.toLowerCase().includes(sfLower) && !item.rig.toLowerCase().includes(sfLower)) {
              continue;
            }
          }

          if (tokens.length > 0) {
            const hay = `${item.name} ${item.source} ${item.rig}`.toLowerCase();
            let allMatch = true;
            for (let t = 0; t < tokens.length; t++) {
              if (!hay.includes(tokens[t])) {
                allMatch = false;
                break;
              }
            }
            if (!allMatch) continue;
          }

          matches.push(item);
          if (matches.length >= 50) break;
        }

        box.innerHTML = '';

        if (matches.length === 0) {
          box.innerHTML = `
            <div class="p-4 text-center text-xs font-semibold text-[#5C5852]">
              No matching models found. Try another keyword or switch filter to "All Rigs".
            </div>
          `;
          return;
        }

        matches.forEach((item) => {
          const row = document.createElement('div');
          row.className = 'px-3 py-2 flex items-center justify-between gap-2 hover:bg-[#F4F0EA] transition cursor-pointer';
          row.innerHTML = `
            <div class="min-w-0 flex-1">
              <div class="text-xs font-bold text-[#1E1D1A] truncate">${escapeHtml(item.name)}</div>
              <div class="text-[11px] text-[#5C5852] truncate">
                <strong class="text-[#2E644C]">${escapeHtml(item.source)}</strong> • <span class="font-mono-num">${escapeHtml(item.rig)}</span>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button type="button" class="load-fr-btn px-2.5 py-1 rounded-lg bg-[#C84B31] text-[#FBF9F5] text-[11px] font-bold cursor-pointer">
                FR Curve
              </button>
              <button type="button" class="load-both-btn px-2 py-1 rounded-lg bg-[#EFEAE1] hover:bg-[#DED8CC] text-[#1E1D1A] text-[11px] font-bold cursor-pointer" title="Load FR + AutoEq ParametricEQ.txt">
                +PEQ
              </button>
              <button type="button" class="load-target-btn px-2 py-1 rounded-lg bg-[#1D5B4C] text-[#FBF9F5] text-[11px] font-bold cursor-pointer" title="Use this model as the target curve">
                Target
              </button>
            </div>
          `;

          row.querySelector('.load-fr-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            loadModelFromAutoEqGitHub(item, false);
            document.getElementById('autoEqPopover')?.classList.add('hidden');
          });

          row.querySelector('.load-both-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            loadModelFromAutoEqGitHub(item, true);
            document.getElementById('autoEqPopover')?.classList.add('hidden');
          });

          row.querySelector('.load-target-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            loadModelFromAutoEqGitHub(item, false, true);
            document.getElementById('autoEqPopover')?.classList.add('hidden');
          });

          row.addEventListener('click', () => {
            loadModelFromAutoEqGitHub(item, false);
            document.getElementById('autoEqPopover')?.classList.add('hidden');
          });

          box.appendChild(row);
        });
      }

      async function loadModelFromAutoEqGitHub(entry, alsoLoadOfficialPeq = false, asTarget = false) {
        showToast(`Fetching ${entry.name} (${entry.source}) from AutoEq GitHub...`);
        const folderModelSegment = entry.relPath.split('/').pop(); // Already URL-encoded in INDEX.md
        const rawCsvUrls = [
          `https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/${entry.relPath}/${folderModelSegment}.csv`,
          `https://cdn.jsdelivr.net/gh/jaakkopasanen/AutoEq@master/results/${entry.relPath}/${folderModelSegment}.csv`
        ];

        let loadedCurve = null;
        for (const csvUrl of rawCsvUrls) {
          try {
            const resp = await fetch(csvUrl);
            if (!resp.ok) continue;
            const csvText = await resp.text();
            loadedCurve = parseMeasurementTextToCurve(csvText);
            if (loadedCurve) break;
          } catch (_) {}
        }

        if (loadedCurve) {
          if (asTarget) {
            setCustomIemTarget(loadedCurve, `${entry.name} (${entry.source})`);
            showToast(`Set ${entry.name} as target`);
            return;
          }

          state.customIemCurve = loadedCurve;
          state.customIemName = `${entry.name} (${entry.source})`;
          state.selectedIemKey = 'custom';
          state.activeAutoEqEntry = entry;

          const sel = document.getElementById('iemSelect');
          let customOpt = sel.querySelector('option[value="custom"]');
          if (!customOpt) {
            customOpt = document.createElement('option');
            customOpt.value = 'custom';
            sel.prepend(customOpt);
          }
          customOpt.textContent = `AutoEq: ${state.customIemName}`;
          sel.value = 'custom';

          document.getElementById('activeIemTitleBadge').textContent = state.customIemName;
          document.getElementById('btnLoadOfficialAutoEqPeq')?.classList.remove('hidden');

          syncWebAudioBiquadNodes();

          if (alsoLoadOfficialPeq) {
            await fetchOfficialAutoEqParametricTxt(entry);
          } else {
            showToast(`Loaded ${entry.name} measurement`);
          }
        } else {
          showToast(`Could not reach GitHub for ${entry.name}. Check connection.`);
        }
      }

      async function fetchOfficialAutoEqParametricTxt(entry) {
        if (!entry) return;
        const folderModelSegment = entry.relPath.split('/').pop();
        const peqUrls = [
          `https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/${entry.relPath}/${folderModelSegment}%20ParametricEQ.txt`,
          `https://cdn.jsdelivr.net/gh/jaakkopasanen/AutoEq@master/results/${entry.relPath}/${folderModelSegment}%20ParametricEQ.txt`
        ];

        for (const url of peqUrls) {
          try {
            const resp = await fetch(url);
            if (!resp.ok) continue;
            const txt = await resp.text();
            const count = applyEqualizerApoTextToState(txt, `Official AutoEq (${entry.source})`);
            if (count > 0) {
              showToast(`Loaded ${count} official AutoEq bands for ${entry.name}`);
              return;
            }
          } catch (_) {}
        }
        showToast('Official ParametricEQ.txt not found; running local AutoEQ solver instead.');
        runAutoEqSolverToCurrentTarget();
      }

      // ====================================================================
      // 5. MATHEMATICAL BIQUAD TRANSFER FUNCTION & NORMALIZATION
      // ====================================================================
      function freqToNormX(f) {
        const clamped = Math.max(MIN_FREQ, Math.min(MAX_FREQ, f));
        return (Math.log10(clamped) - MIN_LOG_F) / (MAX_LOG_F - MIN_LOG_F);
      }

      function normXToFreq(normX) {
        const clamped = Math.max(0, Math.min(1, normX));
        return Math.pow(10, MIN_LOG_F + clamped * (MAX_LOG_F - MIN_LOG_F));
      }

      // Left Y-Axis: Relative dB [-20 to +20 dB] (anchored at 0 dB = 60 dB SPL)
      function relDbToNormY(relDb) {
        const clamped = Math.max(-20, Math.min(20, relDb));
        return 0.5 - clamped / 40;
      }

      function normYToRelDb(normY) {
        const clamped = Math.max(0, Math.min(1, normY));
        return (0.5 - clamped) * 40;
      }

      // Right Y-Axis: Full-Scale Live FFT [-90 dBFS at bottom to 0 dBFS at top]
      function dbfsToNormY(dbfs) {
        const clamped = Math.max(-90, Math.min(0, dbfs));
        return 1.0 - (clamped + 90) / 90;
      }

      function normYToDbfs(normY) {
        const clamped = Math.max(0, Math.min(1, normY));
        return -clamped * 90;
      }

      // ====================================================================
      // BIQUAD MATH: single source of truth for the graph, the audio engine,
      // the AutoEQ solver and the curve cache.
      //   peaking          : RBJ, linear Q (same as BiquadFilterNode)
      //   lowshelf/highshelf: RBJ shelf in Q form, alpha = sin(w0) / (2Q)
      //                      (Q = 1/sqrt(2) is identical to the node's fixed S = 1 shelf)
      //   lowpass/highpass : RBJ, LINEAR Q (the native node wants dB; see linearQToNodeDb)
      // ====================================================================
      const EQ_MAX_BANDS = 10;
      const GAIN_LIMIT_DB = 40; // sanity bound only (DSP safety); see BAND_GAIN_LIMIT_DB for the real limit
      // The one band gain limit used by the sliders, graph dragging, AutoEQ solver and AI results.
      const BAND_GAIN_LIMIT_DB = 15;

      // True while the audio engine really applies shelf Q (AudioWorklet engine).
      // False only if we had to fall back to the native BiquadFilterNode, whose shelves
      // have a fixed slope and ignore Q. The graph follows whichever engine is live.
      let engineHonorsShelfQ = true;

      function clampQ(q) {
        return Math.max(0.1, Math.min(18.0, q));
      }

      // BiquadFilterNode reads Q as dB for lowpass/highpass: alpha = sin(w0) / (2 * 10^(Q/20)).
      function linearQToNodeDb(q) {
        return 20 * Math.log10(clampQ(q));
      }

      // NOTE: self-contained on purpose. Its source text is injected into the AudioWorklet,
      // so it must not reference anything outside its own body.
      // Writes normalized [b0, b1, b2, a1, a2] into `out` (allocated if omitted).
      function computeBiquadCoeffs(type, freq, gainDb, Q, sr, fixedShelf, out) {
        out = out || new Float64Array(5);
        const isShelf = type === 'lowshelf' || type === 'highshelf';
        const f0 = Math.max(20, Math.min(sr * 0.49, freq));
        const q = fixedShelf && isShelf ? Math.SQRT1_2 : Math.max(0.1, Math.min(18.0, Q));
        const A = Math.pow(10, Math.max(-40, Math.min(40, gainDb)) / 40);
        const w0 = (2 * Math.PI * f0) / sr;
        const cosW0 = Math.cos(w0);
        const sinW0 = Math.sin(w0);
        const alpha = sinW0 / (2 * q);

        let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

        switch (type) {
          case 'peaking':
            b0 = 1 + alpha * A;
            b1 = -2 * cosW0;
            b2 = 1 - alpha * A;
            a0 = 1 + alpha / A;
            a1 = -2 * cosW0;
            a2 = 1 - alpha / A;
            break;
          case 'lowshelf': {
            const k2 = 2 * Math.sqrt(A) * alpha;
            b0 = A * ((A + 1) - (A - 1) * cosW0 + k2);
            b1 = 2 * A * ((A - 1) - (A + 1) * cosW0);
            b2 = A * ((A + 1) - (A - 1) * cosW0 - k2);
            a0 = (A + 1) + (A - 1) * cosW0 + k2;
            a1 = -2 * ((A - 1) + (A + 1) * cosW0);
            a2 = (A + 1) + (A - 1) * cosW0 - k2;
            break;
          }
          case 'highshelf': {
            const k2 = 2 * Math.sqrt(A) * alpha;
            b0 = A * ((A + 1) + (A - 1) * cosW0 + k2);
            b1 = -2 * A * ((A - 1) + (A + 1) * cosW0);
            b2 = A * ((A + 1) + (A - 1) * cosW0 - k2);
            a0 = (A + 1) - (A - 1) * cosW0 + k2;
            a1 = 2 * ((A - 1) - (A + 1) * cosW0);
            a2 = (A + 1) - (A - 1) * cosW0 - k2;
            break;
          }
          case 'lowpass':
            b0 = (1 - cosW0) / 2;
            b1 = 1 - cosW0;
            b2 = (1 - cosW0) / 2;
            a0 = 1 + alpha;
            a1 = -2 * cosW0;
            a2 = 1 - alpha;
            break;
          case 'highpass':
            b0 = (1 + cosW0) / 2;
            b1 = -(1 + cosW0);
            b2 = (1 + cosW0) / 2;
            a0 = 1 + alpha;
            a1 = -2 * cosW0;
            a2 = 1 - alpha;
            break;
        }

        out[0] = b0 / a0;
        out[1] = b1 / a0;
        out[2] = b2 / a0;
        out[3] = a1 / a0;
        out[4] = a2 / a0;
        return out;
      }

      // cos(w) and cos(2w) for a frequency grid. |H|^2 only needs these two
      // (sin terms cancel), so there are two tables per sample rate, not four.
      function buildTrigTable(freqArray, sr) {
        const n = freqArray.length;
        const cosW = new Float64Array(n);
        const cos2W = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          const w = (2 * Math.PI * freqArray[i]) / sr;
          cosW[i] = Math.cos(w);
          cos2W[i] = Math.cos(2 * w);
        }
        return { cosW, cos2W };
      }

      const gridTrigCache = new Map();
      function getGridTrig(sr) {
        let tbl = gridTrigCache.get(sr);
        if (!tbl) {
          tbl = buildTrigTable(LOG_FREQS, sr);
          gridTrigCache.set(sr, tbl);
        }
        return tbl;
      }

      function writeBandMagnitudeDb(outDb, band, sr, tbl) {
        const c = computeBiquadCoeffs(band.filterType, band.frequency, band.gain, band.Q, sr, !engineHonorsShelfQ);
        const b0 = c[0], b1 = c[1], b2 = c[2], a1 = c[3], a2 = c[4];
        // |b0 + b1 z^-1 + b2 z^-2|^2 = b0^2+b1^2+b2^2 + 2(b0 b1 + b1 b2) cos w + 2 b0 b2 cos 2w
        const n0 = b0 * b0 + b1 * b1 + b2 * b2;
        const n1 = 2 * (b0 * b1 + b1 * b2);
        const n2 = 2 * b0 * b2;
        const d0 = 1 + a1 * a1 + a2 * a2;
        const d1 = 2 * (a1 + a1 * a2);
        const d2 = 2 * a2;
        const cosW = tbl.cosW;
        const cos2W = tbl.cos2W;
        for (let i = 0; i < outDb.length; i++) {
          const num = n0 + n1 * cosW[i] + n2 * cos2W[i];
          const den = d0 + d1 * cosW[i] + d2 * cos2W[i];
          outDb[i] = 10 * Math.log10(Math.max(1e-8, num / Math.max(1e-12, den)));
        }
        return outDb;
      }

      // Per-band curve cache. A WeakMap keeps the cache out of the band objects, which get
      // JSON-cloned for undo. The returned array is shared: callers must treat it as read-only.
      const bandCurveCache = new WeakMap();
      function getBandCurveDb(band, sr) {
        const fixed = !engineHonorsShelfQ;
        let e = bandCurveCache.get(band);
        if (e && e.type === band.filterType && e.f === band.frequency && e.g === band.gain &&
            e.q === band.Q && e.sr === sr && e.fixed === fixed) {
          return e.curve;
        }
        if (!e) {
          e = { curve: new Float32Array(NUM_FREQ_POINTS) };
          bandCurveCache.set(band, e);
        }
        writeBandMagnitudeDb(e.curve, band, sr, getGridTrig(sr));
        e.type = band.filterType;
        e.f = band.frequency;
        e.g = band.gain;
        e.q = band.Q;
        e.sr = sr;
        e.fixed = fixed;
        return e.curve;
      }

      // Uncached, allocating variant with the original signature (disabled band -> flat 0 dB).
      function computeBandMagnitudeDb(band, freqArray, sampleRate = 48000) {
        const outDb = new Float32Array(freqArray.length);
        if (!band.enabled) return outDb;
        const tbl = freqArray === LOG_FREQS ? getGridTrig(sampleRate) : buildTrigTable(freqArray, sampleRate);
        return writeBandMagnitudeDb(outDb, band, sampleRate, tbl);
      }

      function currentSampleRate() {
        return audioCtx ? audioCtx.sampleRate : 48000;
      }

      function recomputeAcousticCurves() {
        let normIdx = 0;
        let minDiff = Infinity;
        for (let i = 0; i < NUM_FREQ_POINTS; i++) {
          const d = Math.abs(LOG_FREQS[i] - state.normFreqHz);
          if (d < minDiff) {
            minDiff = d;
            normIdx = i;
          }
        }

        // 1. Stock IEM Curve normalized at normFreqHz
        if (state.selectedIemKey === 'custom' && state.customIemCurve) {
          const refVal = state.customIemCurve[normIdx];
          for (let i = 0; i < NUM_FREQ_POINTS; i++) {
            stockIemSplArray[i] = state.customIemCurve[i] - refVal;
          }
        } else {
          const profile = BUILTIN_IEM_PROFILES[state.selectedIemKey] || BUILTIN_IEM_PROFILES.simgot_em6l;
          const refVal = profile.evalDb(LOG_FREQS[normIdx]);
          for (let i = 0; i < NUM_FREQ_POINTS; i++) {
            stockIemSplArray[i] = profile.evalDb(LOG_FREQS[i]) - refVal;
          }
        }

        // 2. Target Curve (built-in target OR an IEM used as target), normalized at normFreqHz
        if (state.targetCurveKey === 'none') {
          targetSplArray.fill(0);
        } else if (isIemTarget(state.targetCurveKey)) {
          const refTarget = evalIemTargetRaw(normIdx);
          for (let i = 0; i < NUM_FREQ_POINTS; i++) {
            targetSplArray[i] = evalIemTargetRaw(i) - refTarget;
          }
        } else {
          const refTarget = evaluateRawTargetDb(
            state.targetCurveKey,
            LOG_FREQS[normIdx],
            state.targetTiltDbPerOct,
            state.targetBassShelfDb
          );
          for (let i = 0; i < NUM_FREQ_POINTS; i++) {
            targetSplArray[i] =
              evaluateRawTargetDb(
                state.targetCurveKey,
                LOG_FREQS[i],
                state.targetTiltDbPerOct,
                state.targetBassShelfDb
              ) - refTarget;
          }
        }

        // 3. Composite EQ Filter Transfer Curve
        compositeEqDbArray.fill(0);
        const sr = audioCtx ? audioCtx.sampleRate : 48000;
        state.bands.forEach((band) => {
          if (!band.enabled) return;
          const bDb = getBandCurveDb(band, sr);
          for (let i = 0; i < NUM_FREQ_POINTS; i++) {
            compositeEqDbArray[i] += bDb[i];
          }
        });

        // 4. Auto-Preamp Anti-Clipping Headroom
        if (state.autoPreamp) {
          let maxPeak = 0;
          for (let i = 0; i < NUM_FREQ_POINTS; i++) {
            if (compositeEqDbArray[i] > maxPeak) maxPeak = compositeEqDbArray[i];
          }
          state.preampDb = maxPeak > 0.1 ? Number((-(maxPeak + 0.3)).toFixed(1)) : 0.0;
          const slider = document.getElementById('preampSlider');
          const readout = document.getElementById('preampReadout');
          if (slider) slider.value = state.preampDb;
          if (readout) readout.textContent = `${state.preampDb > 0 ? '+' : ''}${state.preampDb.toFixed(1)} dB`;
        }
      }

      // ====================================================================
      // 6. WEB AUDIO API DSP ENGINE & FULL-RANGE FLOAT FFT ANALYSER
      // ====================================================================
      let audioCtx = null;
      let audioBuffer = null;
      let sourceNode = null;
      let preampGainNode = null;
      let biquadNodePool = [];
      let eqWorkletNode = null;          // AudioWorklet EQ engine (null while on the native fallback)
      let eqWorkletInitStarted = false;
      let preAnalyser = null;
      let postAnalyser = null;
      let pauseOffset = 0;
      // Playback anchor: buffer position `anchorPos` was playing at audioCtx time `anchorCtxTime`
      let anchorPos = 0;
      let anchorCtxTime = 0;
      // A-B loop (seconds into the current buffer)
      const abLoop = { a: null, b: null, enabled: false };

      let floatFftPre = null;
      let floatFftPost = null;

      function ensureAudioEngine() {
        if (!audioCtx) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          audioCtx = new AudioContextClass();

          preAnalyser = audioCtx.createAnalyser();
          preAnalyser.fftSize = 8192;
          preAnalyser.smoothingTimeConstant = 0.82;

          postAnalyser = audioCtx.createAnalyser();
          postAnalyser.fftSize = 8192;
          postAnalyser.smoothingTimeConstant = 0.82;

          floatFftPre = new Float32Array(preAnalyser.frequencyBinCount);
          floatFftPost = new Float32Array(postAnalyser.frequencyBinCount);

          preampGainNode = audioCtx.createGain();

          biquadNodePool = [];
          for (let i = 0; i < 10; i++) {
            const fNode = audioCtx.createBiquadFilter();
            fNode.type = 'peaking';
            fNode.frequency.value = 1000;
            fNode.gain.value = 0;
            fNode.Q.value = 1.0;
            biquadNodePool.push(fNode);
          }

          preAnalyser.connect(preampGainNode);
          let prev = preampGainNode;
          for (let i = 0; i < biquadNodePool.length; i++) {
            prev.connect(biquadNodePool[i]);
            prev = biquadNodePool[i];
          }
          prev.connect(postAnalyser);
          postAnalyser.connect(audioCtx.destination);

          audioBuffer = createSynthesizedAudioBuffer(audioCtx, 'synth');
          state.duration = audioBuffer.duration;
          state.ltasBands = computeBufferLTAS(audioBuffer);
          updateTransportDurationUi();
          renderTelemetryMatrix();
          syncWebAudioBiquadNodes();
          initEqWorklet();
          renderGeneratedAudioMetadataUi('Generated audio \u00b7 Reference groove');
        }

        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
        return audioCtx;
      }

      function buildEqWorkletParams() {
        const list = [];
        for (let i = 0; i < EQ_MAX_BANDS; i++) {
          const b = state.bands[i];
          list.push(b ? {
            t: b.filterType,
            a: !!(b.enabled && state.isEqActive),
            f: Math.max(20, Math.min(20000, b.frequency)),
            g: Math.max(-GAIN_LIMIT_DB, Math.min(GAIN_LIMIT_DB, b.gain)),
            q: clampQ(b.Q)
          } : null);
        }
        return list;
      }

      function syncWebAudioBiquadNodes() {
        recomputeAcousticCurves();
        updateApoPreviewUi();
        updateActiveBandPillUi();
        renderTelemetryMatrix();
        if (typeof scheduleSaveSession === 'function') scheduleSaveSession();

        if (!audioCtx || !preampGainNode || biquadNodePool.length === 0) return;
        const now = audioCtx.currentTime;
        const tau = 0.016;

        const linearPreamp = state.isEqActive ? Math.pow(10, state.preampDb / 20) : 1.0;
        preampGainNode.gain.setTargetAtTime(linearPreamp, now, tau);

        // AudioWorklet engine: runs computeBiquadCoeffs, the same math the graph plots.
        if (eqWorkletNode) {
          eqWorkletNode.port.postMessage({ bands: buildEqWorkletParams() });
          return;
        }

        // Fallback engine: native BiquadFilterNode chain.
        for (let i = 0; i < biquadNodePool.length; i++) {
          const node = biquadNodePool[i];
          const band = state.bands[i];
          if (band && band.enabled && state.isEqActive) {
            const isPass = band.filterType === 'lowpass' || band.filterType === 'highpass';
            if (node.type !== band.filterType) node.type = band.filterType;
            node.frequency.setTargetAtTime(Math.max(20, Math.min(20000, band.frequency)), now, tau);
            // Native LP/HP read Q in dB; convert so the node matches the linear-Q graph.
            node.Q.setTargetAtTime(isPass ? linearQToNodeDb(band.Q) : clampQ(band.Q), now, tau);
            node.gain.setTargetAtTime(Math.max(-GAIN_LIMIT_DB, Math.min(GAIN_LIMIT_DB, band.gain)), now, tau);
          } else {
            node.type = 'peaking';
            if (band) {
              node.frequency.setTargetAtTime(Math.max(20, Math.min(20000, band.frequency)), now, tau);
              node.Q.setTargetAtTime(clampQ(band.Q), now, tau);
            }
            node.gain.setTargetAtTime(0, now, tau);
          }
        }
      }

      // --------------------------------------------------------------------
      // AudioWorklet EQ engine. Its body is stringified into the worklet module,
      // so it must stay self-contained (computeBiquadCoeffs is prepended to it).
      // --------------------------------------------------------------------
      function sonaEqWorkletBody() {
        const N = 10;
        const TAU = 0.016;

        class SonaEqProcessor extends AudioWorkletProcessor {
          constructor(options) {
            super();
            this.bands = [];
            for (let i = 0; i < N; i++) {
              this.bands.push({
                type: 'peaking',
                active: false,
                tlf: Math.log(1000), tlq: 0, tg: 0, // targets: ln(freq), ln(Q), gain dB
                clf: Math.log(1000), clq: 0, cg: 0, // smoothed current values
                z: new Float64Array(4)              // TDF-II state, 2 channels x (z1, z2)
              });
            }
            this.coef = new Float64Array(5);
            const init = options && options.processorOptions;
            if (init && init.bands) this.applyParams(init.bands, true);
            this.port.onmessage = (ev) => {
              const m = ev.data;
              if (m && m.bands) this.applyParams(m.bands, false);
            };
          }

          applyParams(list, snap) {
            for (let i = 0; i < N; i++) {
              const p = list[i];
              const b = this.bands[i];
              if (!p) { b.active = false; b.tg = 0; continue; }
              const pass = p.t === 'lowpass' || p.t === 'highpass';
              const wasActive = b.active;
              const typeChanged = b.type !== p.t;
              b.type = p.t;
              b.active = !!p.a;
              b.tlf = Math.log(p.f);
              b.tlq = Math.log(p.q);
              b.tg = p.a && !pass ? p.g : 0;
              // Sweep frequency/Q only while a band is audible; otherwise jump straight there.
              if (snap || typeChanged || !wasActive) { b.clf = b.tlf; b.clq = b.tlq; }
              if (snap) b.cg = b.tg;
            }
          }

          process(inputs, outputs) {
            const input = inputs[0];
            const output = outputs[0];
            if (!input || input.length === 0 || !output || output.length === 0) return true;

            const len = output[0].length;
            const nch = Math.min(output.length, 2);
            for (let c = 0; c < output.length; c++) {
              output[c].set(input[Math.min(c, input.length - 1)]);
            }

            const k = 1 - Math.exp(-len / (sampleRate * TAU));
            const co = this.coef;
            for (let i = 0; i < N; i++) {
              const b = this.bands[i];
              const pass = b.type === 'lowpass' || b.type === 'highpass';

              b.clf += (b.tlf - b.clf) * k;
              b.clq += (b.tlq - b.clq) * k;
              b.cg += (b.tg - b.cg) * k;
              if (Math.abs(b.tg - b.cg) < 1e-4) b.cg = b.tg;

              const idle = pass ? !b.active : (b.tg === 0 && b.cg === 0);
              if (idle) { b.z.fill(0); continue; }

              computeBiquadCoeffs(b.type, Math.exp(b.clf), b.cg, Math.exp(b.clq), sampleRate, false, co);
              const b0 = co[0], b1 = co[1], b2 = co[2], a1 = co[3], a2 = co[4];
              if (!(Number.isFinite(b0) && Number.isFinite(b1) && Number.isFinite(b2) &&
                    Number.isFinite(a1) && Number.isFinite(a2))) continue;

              for (let ch = 0; ch < nch; ch++) {
                const x = output[ch];
                let z1 = b.z[ch * 2];
                let z2 = b.z[ch * 2 + 1];
                for (let n = 0; n < len; n++) {
                  const xn = x[n];
                  const y = b0 * xn + z1;
                  z1 = b1 * xn - a1 * y + z2;
                  z2 = b2 * xn - a2 * y;
                  x[n] = y;
                }
                if (!Number.isFinite(z1) || Math.abs(z1) < 1e-20) z1 = 0;
                if (!Number.isFinite(z2) || Math.abs(z2) < 1e-20) z2 = 0;
                b.z[ch * 2] = z1;
                b.z[ch * 2 + 1] = z2;
              }
            }
            return true;
          }
        }

        registerProcessor('sona-eq', SonaEqProcessor);
      }

      function useNativeBiquadFallback(reason) {
        // Route back through the native BiquadFilterNode chain. The graph then plots the fixed
        // shelf slope those nodes actually apply, so it still matches what you hear.
        if (eqWorkletNode) {
          try { preampGainNode.disconnect(eqWorkletNode); } catch (e) { /* already detached */ }
          try { eqWorkletNode.disconnect(); } catch (e) { /* already detached */ }
          eqWorkletNode.onprocessorerror = null;
          eqWorkletNode = null;
          try {
            preampGainNode.connect(biquadNodePool[0]);
            biquadNodePool[biquadNodePool.length - 1].connect(postAnalyser);
          } catch (e) { /* ignore */ }
        }
        engineHonorsShelfQ = false;
        console.warn('SonaDSP: using native BiquadFilterNode fallback (' + reason + ')');
        syncWebAudioBiquadNodes();
        showToast('Preview uses the browser\u2019s built-in filters: shelf Q is not applied to the sound (the graph shows the fixed shelf slope).');
      }

      function initEqWorklet() {
        if (eqWorkletInitStarted || !audioCtx) return;
        eqWorkletInitStarted = true;

        if (!audioCtx.audioWorklet || typeof AudioWorkletNode === 'undefined' ||
            typeof Blob === 'undefined' || !window.URL || !URL.createObjectURL) {
          useNativeBiquadFallback('AudioWorklet unavailable');
          return;
        }

        let url = null;
        try {
          const src = computeBiquadCoeffs.toString() + '\n(' + sonaEqWorkletBody.toString() + ')();';
          url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
        } catch (err) {
          useNativeBiquadFallback('could not build worklet module');
          return;
        }

        audioCtx.audioWorklet.addModule(url).then(() => {
          URL.revokeObjectURL(url);
          const node = new AudioWorkletNode(audioCtx, 'sona-eq', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
            channelCount: 2,
            channelCountMode: 'explicit',
            channelInterpretation: 'speakers',
            processorOptions: { bands: buildEqWorkletParams() }
          });
          node.onprocessorerror = () => useNativeBiquadFallback('worklet processor error');

          // Swap the native chain out for the worklet in one step.
          try { preampGainNode.disconnect(biquadNodePool[0]); } catch (e) { /* ignore */ }
          try { biquadNodePool[biquadNodePool.length - 1].disconnect(postAnalyser); } catch (e) { /* ignore */ }
          preampGainNode.connect(node);
          node.connect(postAnalyser);
          eqWorkletNode = node;
          engineHonorsShelfQ = true;
          syncWebAudioBiquadNodes();
        }).catch((err) => {
          if (url) URL.revokeObjectURL(url);
          useNativeBiquadFallback(err && err.message ? err.message : 'worklet load failed');
        });
      }

      function createSynthesizedAudioBuffer(ctx, mode) {
        const sr = ctx.sampleRate;
        const duration = 8.0;
        const len = Math.floor(sr * duration);
        const buf = ctx.createBuffer(2, len, sr);
        const left = buf.getChannelData(0);
        const right = buf.getChannelData(1);

        if (mode === 'pink') {
          let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
          for (let i = 0; i < len; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.075;
            b6 = white * 0.115926;
            left[i] = Math.max(-0.95, Math.min(0.95, pink));
            right[i] = Math.max(-0.95, Math.min(0.95, pink * 0.98 + (Math.random() * 2 - 1) * 0.01));
          }
          return buf;
        }

        const progressions = [
          [55.0, 110.0, 220.0, 277.18, 329.63, 440.0, 659.25],
          [43.65, 87.31, 174.61, 220.0, 261.63, 349.23, 523.25],
          [49.0, 98.0, 196.0, 246.94, 293.66, 392.0, 587.33],
          [41.2, 82.41, 164.81, 207.65, 246.94, 329.63, 659.25]
        ];

        for (let i = 0; i < len; i++) {
          const t = i / sr;
          const chord = progressions[Math.floor((t / 2.0) % progressions.length)];
          const beat = t % 0.5;
          const sixteenth = t % 0.125;

          const kickPitch = 46 + 115 * Math.exp(-beat * 30);
          const kick = Math.sin(2 * Math.PI * kickPitch * beat) * Math.exp(-beat * 8.0) * 0.42;

          let padL = 0, padR = 0;
          for (let n = 0; n < chord.length; n++) {
            const f = chord[n];
            const sig =
              Math.sin(2 * Math.PI * f * t) +
              0.55 * Math.sin(2 * Math.PI * f * 2 * t + 0.2) +
              0.32 * Math.sin(2 * Math.PI * f * 3 * t) +
              0.18 * Math.sin(2 * Math.PI * f * 5 * t) +
              0.10 * Math.sin(2 * Math.PI * f * 8 * t);
            const w = n === 0 ? 0.22 : 0.08;
            padL += sig * w * (n % 2 === 0 ? 1.0 : 0.82);
            padR += sig * w * (n % 2 === 1 ? 1.0 : 0.82);
          }

          const pluckEnv = Math.exp(-(t % 0.25) * 18);
          const pluck = (Math.sin(2 * Math.PI * 2200 * t) + 0.6 * Math.sin(2 * Math.PI * 4400 * t)) * pluckEnv * 0.08;

          const hatEnv = Math.exp(-sixteenth * 42);
          const hat = (Math.random() * 2 - 1) * hatEnv * 0.22;

          left[i] = Math.max(-0.96, Math.min(0.96, kick + padL + pluck + hat));
          right[i] = Math.max(-0.96, Math.min(0.96, kick + padR + pluck * 0.9 + hat * 0.92));
        }

        return buf;
      }

      function computeBufferLTAS(buf) {
        const ch = buf.getChannelData(0);
        const sr = buf.sampleRate;
        const winSize = 1024;
        const numWins = Math.min(20, Math.max(1, Math.floor(ch.length / winSize)));
        const step = Math.floor((ch.length - winSize) / Math.max(1, numWins));
        const energies = new Float64Array(ISO_OCTAVES.length);

        for (let b = 0; b < ISO_OCTAVES.length; b++) {
          const fc = ISO_OCTAVES[b].freq;
          let sumP = 0;
          for (let w = 0; w < numWins; w++) {
            const offset = w * step;
            const omega = (2 * Math.PI * Math.min(fc, sr * 0.46)) / sr;
            const coeff = 2 * Math.cos(omega);
            let s1 = 0, s2 = 0;
            for (let n = 0; n < winSize; n++) {
              const hann = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (winSize - 1)));
              const s0 = ch[offset + n] * hann + coeff * s1 - s2;
              s2 = s1;
              s1 = s0;
            }
            const p = s1 * s1 + s2 * s2 - coeff * s1 * s2;
            sumP += Math.max(0, p) / (winSize * winSize);
          }
          energies[b] = 10 * Math.log10(Math.max(1e-9, sumP / numWins));
        }

        const maxE = Math.max(...energies);
        return ISO_OCTAVES.map((oct, i) => ({
          ...oct,
          db: Number(Math.max(-24, Math.min(0, energies[i] - maxE)).toFixed(1))
        }));
      }

      function stopAudioPlayback() {
        if (sourceNode) {
          try {
            sourceNode.onended = null;
            sourceNode.stop();
            sourceNode.disconnect();
          } catch (_) {}
          sourceNode = null;
        }
      }

      // Effective loop region: the A-B region when active, otherwise the whole buffer.
      function getLoopRegion() {
        const dur = audioBuffer ? audioBuffer.duration : 0;
        if (abLoop.enabled && abLoop.a !== null && abLoop.b !== null && abLoop.b > abLoop.a) {
          return { start: abLoop.a, end: Math.min(abLoop.b, dur), active: true };
        }
        return { start: 0, end: dur, active: false };
      }

      // Current playhead position in seconds (accounts for A-B looping).
      function getPlaybackPosition() {
        if (!audioCtx || !audioBuffer || !state.isPlaying) return pauseOffset;
        const r = getLoopRegion();
        let pos = anchorPos + (audioCtx.currentTime - anchorCtxTime);
        const span = r.end - r.start;
        if (span > 0 && pos >= r.end) pos = r.start + ((pos - r.start) % span);
        return pos;
      }

      function startAudioPlayback(offsetSec = 0) {
        const ctx = ensureAudioEngine();
        if (!audioBuffer) return;

        stopAudioPlayback();
        const r = getLoopRegion();
        const src = ctx.createBufferSource();
        src.buffer = audioBuffer;
        src.loop = true;
        src.loopStart = r.start;
        src.loopEnd = r.end;
        src.connect(preAnalyser);

        let safeOffset = offsetSec % audioBuffer.duration;
        if (r.active && safeOffset >= r.end) safeOffset = r.start;
        src.start(0, safeOffset);
        anchorPos = safeOffset;
        anchorCtxTime = ctx.currentTime;
        pauseOffset = safeOffset;
        sourceNode = src;
        state.isPlaying = true;
        updatePlayButtonUi();
      }

      function togglePlayPause() {
        ensureAudioEngine();
        if (state.isPlaying) {
          pauseOffset = getPlaybackPosition();
          stopAudioPlayback();
          state.isPlaying = false;
          updatePlayButtonUi();
        } else {
          startAudioPlayback(pauseOffset);
        }
      }

      // ---------------- A-B loop controls ----------------
      const LOOP_BTN_OFF = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-[#FBF9F5] text-[#5C5852] hover:text-[#1E1D1A] border border-[#DED8CC] transition cursor-pointer';
      const LOOP_BTN_SET = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-[#C97026] text-[#FBF9F5] border border-[#A85A1A] transition cursor-pointer';
      const LOOP_TOGGLE_BASE = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ';
      const LOOP_TOGGLE_ON = LOOP_TOGGLE_BASE + 'bg-[#2E644C] text-[#FBF9F5] border-[#214B38]';
      const LOOP_TOGGLE_OFF = LOOP_TOGGLE_BASE + 'bg-[#FBF9F5] text-[#5C5852] hover:text-[#1E1D1A] border-[#DED8CC]';
      const LOOP_CLEAR_BASE = 'px-2 py-1.5 rounded-lg text-xs font-bold bg-[#FBF9F5] text-[#5C5852] hover:text-[#C84B31] border border-[#DED8CC] transition cursor-pointer';

      function formatTimeFine(sec) {
        if (sec === null || !Number.isFinite(sec) || sec < 0) return '--:--';
        const m = Math.floor(sec / 60);
        const s = sec - m * 60;
        return `${m}:${s.toFixed(1).padStart(4, '0')}`;
      }

      function updateAbLoopUi() {
        const btnA = document.getElementById('btnLoopA');
        const btnB = document.getElementById('btnLoopB');
        const btnT = document.getElementById('btnLoopToggle');
        const btnC = document.getElementById('btnLoopClear');
        const readout = document.getElementById('loopReadout');
        const seekEl = document.getElementById('seekSlider');
        if (!btnA || !btnB || !btnT || !btnC || !readout) return;

        const hasA = abLoop.a !== null;
        const hasB = abLoop.b !== null;
        const hasRegion = hasA && hasB;

        btnA.className = hasA ? LOOP_BTN_SET : LOOP_BTN_OFF;
        btnB.className = hasB ? LOOP_BTN_SET : LOOP_BTN_OFF;
        btnT.className = (abLoop.enabled && hasRegion ? LOOP_TOGGLE_ON : LOOP_TOGGLE_OFF) + (hasRegion ? '' : ' opacity-50');
        btnC.className = LOOP_CLEAR_BASE + (hasA || hasB ? '' : ' opacity-50');

        if (hasA || hasB) {
          readout.classList.remove('hidden');
          readout.textContent = `${formatTimeFine(abLoop.a)} \u2192 ${formatTimeFine(abLoop.b)}`;
        } else {
          readout.classList.add('hidden');
        }

        // Paint the loop region on the seek bar
        if (seekEl) {
          const dur = audioBuffer ? audioBuffer.duration : state.duration || 1;
          const pct = (t) => `${Math.max(0, Math.min(100, (t / dur) * 100)).toFixed(2)}%`;
          let from = 0;
          let to = 0;
          if (hasRegion) {
            from = abLoop.a;
            to = abLoop.b;
          } else if (hasA) {
            from = abLoop.a;
            to = abLoop.a + dur * 0.015;
          } else if (hasB) {
            from = Math.max(0, abLoop.b - dur * 0.015);
            to = abLoop.b;
          }
          seekEl.style.setProperty('--loop-a', pct(from));
          seekEl.style.setProperty('--loop-b', pct(to));
          seekEl.style.setProperty('--loop-color', hasA || hasB ? (abLoop.enabled || !hasRegion ? '#C97026' : '#E3C3A3') : 'transparent');
        }
      }

      // Applies a change to the loop settings without interrupting playback unless the
      // playhead ends up outside the new loop region (then it jumps to A).
      function mutateLoop(mutator) {
        const wasPlaying = state.isPlaying && !!sourceNode;
        const pos = getPlaybackPosition(); // position under the *old* loop settings
        mutator();
        const r = getLoopRegion();

        let target = pos;
        if (r.active && (pos < r.start || pos >= r.end)) target = r.start;

        if (wasPlaying) {
          if (target !== pos) {
            startAudioPlayback(target);
          } else {
            sourceNode.loopStart = r.start;
            sourceNode.loopEnd = r.end;
            anchorPos = pos;
            anchorCtxTime = audioCtx.currentTime;
          }
        } else {
          pauseOffset = target;
          const seekEl = document.getElementById('seekSlider');
          if (seekEl) seekEl.value = target;
          document.getElementById('timeCurrent').textContent = formatTime(target);
        }
        updateAbLoopUi();
      }

      function setLoopPoint(which) {
        ensureAudioEngine();
        const pos = getPlaybackPosition();
        let a = abLoop.a;
        let b = abLoop.b;
        if (which === 'a') a = pos;
        else b = pos;

        if (a !== null && b !== null) {
          if (a > b) [a, b] = [b, a];
          if (b - a < 0.05) {
            showToast('Loop too short \u2014 move the playhead and try again');
            return;
          }
        }

        mutateLoop(() => {
          abLoop.a = a;
          abLoop.b = b;
          if (a !== null && b !== null) abLoop.enabled = true;
        });

        if (a !== null && b !== null) {
          showToast(`Looping ${formatTimeFine(a)} \u2192 ${formatTimeFine(b)}`);
        } else {
          showToast(which === 'a' ? 'Loop start (A) set \u2014 now set B' : 'Loop end (B) set \u2014 now set A');
        }
      }

      function toggleLoop() {
        if (abLoop.a === null || abLoop.b === null) {
          showToast('Set both A and B first');
          return;
        }
        mutateLoop(() => {
          abLoop.enabled = !abLoop.enabled;
        });
        showToast(abLoop.enabled ? 'A-B loop on' : 'A-B loop off');
      }

      function clearLoop() {
        if (abLoop.a === null && abLoop.b === null) return;
        mutateLoop(() => {
          abLoop.a = null;
          abLoop.b = null;
          abLoop.enabled = false;
        });
        showToast('A-B loop cleared');
      }

      // Used when the audio source changes: positions no longer mean anything.
      function resetAbLoop() {
        abLoop.a = null;
        abLoop.b = null;
        abLoop.enabled = false;
        updateAbLoopUi();
      }

      // ====================================================================

      // AUDIO FILE METADATA (container header parsing)

      // decodeAudioData() cannot tell us the source format: it always resamples to the

      // AudioContext rate and returns 32-bit float, and it DETACHES the ArrayBuffer you pass

      // in. So the header has to be read from the raw bytes BEFORE decoding.

      // @@audio-meta-start

      const MPEG_SAMPLE_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

      const MP3_BITRATES_KBPS = {

        // [version class][layer] -> index 1..14. MPEG-1 = 3, MPEG-2/2.5 = 2 (shared table).

        '3-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],

        '3-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],

        '3-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],

        '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],

        '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],

        '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]

      };

      const AAC_SAMPLE_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];



      function fourcc(dv, off) {

        if (off + 4 > dv.byteLength) return '';

        return String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));

      }



      // Length of a leading ID3v2 tag (0 if none). MP3 and FLAC files are often prefixed with one.

      function id3v2Length(dv) {

        if (dv.byteLength >= 10 && fourcc(dv, 0).slice(0, 3) === 'ID3') {

          const size = ((dv.getUint8(6) & 0x7f) << 21) | ((dv.getUint8(7) & 0x7f) << 14) |

                       ((dv.getUint8(8) & 0x7f) << 7) | (dv.getUint8(9) & 0x7f);

          return 10 + size + ((dv.getUint8(5) & 0x10) ? 10 : 0);

        }

        return 0;

      }



      function parseWavInfo(dv) {

        let p = 12;

        while (p + 8 <= dv.byteLength) {

          const id = fourcc(dv, p);

          const size = dv.getUint32(p + 4, true);

          if (id === 'fmt ' && p + 8 + 16 <= dv.byteLength) {

            const d = p + 8;

            let tag = dv.getUint16(d, true);

            const channels = dv.getUint16(d + 2, true);

            const sampleRate = dv.getUint32(d + 4, true);

            const byteRate = dv.getUint32(d + 8, true);

            const bits = dv.getUint16(d + 14, true);

            let validBits = bits;

            if (tag === 0xfffe && size >= 40 && d + 26 <= dv.byteLength) {

              validBits = dv.getUint16(d + 18, true) || bits;

              tag = dv.getUint16(d + 24, true); // first two bytes of the SubFormat GUID

            }

            const isPcm = tag === 1 || tag === 3;

            const names = { 1: 'PCM', 3: 'IEEE float', 2: 'MS ADPCM', 6: 'A-law', 7: '\u00b5-law', 0x11: 'IMA ADPCM', 0x55: 'MP3' };

            return {

              format: `WAV \u00b7 ${names[tag] || `format 0x${tag.toString(16)}`}`,

              codec: 'wav', lossless: isPcm, sampleRate, channels,

              bitDepth: isPcm ? (tag === 3 ? `${bits}-bit float` : (validBits !== bits ? `${validBits}-bit (in ${bits}-bit container)` : `${bits}-bit`)) : null,

              exactBitrateKbps: byteRate > 0 ? (byteRate * 8) / 1000 : null

            };

          }

          p += 8 + size + (size & 1);

        }

        return null;

      }



      function parseFlacInfo(dv) {

        let p = id3v2Length(dv);

        if (fourcc(dv, p) !== 'fLaC') return null;

        p += 4;

        // STREAMINFO is always the first metadata block (type 0, 34 bytes).

        if (p + 4 + 34 > dv.byteLength || (dv.getUint8(p) & 0x7f) !== 0) return null;

        const d = p + 4;

        const sampleRate = (dv.getUint8(d + 10) << 12) | (dv.getUint8(d + 11) << 4) | (dv.getUint8(d + 12) >> 4);

        const channels = ((dv.getUint8(d + 12) >> 1) & 7) + 1;

        const bits = (((dv.getUint8(d + 12) & 1) << 4) | (dv.getUint8(d + 13) >> 4)) + 1;

        return { format: 'FLAC', codec: 'flac', lossless: true, sampleRate, channels, bitDepth: `${bits}-bit` };

      }



      function parseMp3Info(dv) {

        const start = id3v2Length(dv);

        const limit = Math.min(dv.byteLength - 4, start + 64 * 1024);

        for (let p = start; p < limit; p++) {

          if (dv.getUint8(p) !== 0xff || (dv.getUint8(p + 1) & 0xe0) !== 0xe0) continue;

          const b1 = dv.getUint8(p + 1), b2 = dv.getUint8(p + 2), b3 = dv.getUint8(p + 3);

          const verBits = (b1 >> 3) & 3;     // 0 = MPEG-2.5, 2 = MPEG-2, 3 = MPEG-1, 1 = reserved

          const layerBits = (b1 >> 1) & 3;   // 1 = Layer III, 2 = Layer II, 3 = Layer I, 0 = ADTS (not MP3)

          const brIdx = b2 >> 4, srIdx = (b2 >> 2) & 3;

          if (verBits === 1 || layerBits === 0 || brIdx === 0 || brIdx === 15 || srIdx === 3) continue;

          const layer = 4 - layerBits;

          const sampleRate = MPEG_SAMPLE_RATES[verBits][srIdx];

          const kbps = MP3_BITRATES_KBPS[`${verBits === 3 ? 3 : 2}-${layer}`][brIdx];

          const pad = (b2 >> 1) & 1;

          const frameLen = layer === 1

            ? (Math.floor((12 * kbps * 1000) / sampleRate) + pad) * 4

            : Math.floor(((layer === 3 && verBits !== 3 ? 72 : 144) * kbps * 1000) / sampleRate) + pad;

          // Reject false syncs: a real frame is followed by another sync word.

          const next = p + frameLen;

          if (next + 2 <= dv.byteLength && !(dv.getUint8(next) === 0xff && (dv.getUint8(next + 1) & 0xe0) === 0xe0)) continue;

          const mono = (b3 >> 6) === 3;

          const sideInfo = verBits === 3 ? (mono ? 17 : 32) : (mono ? 9 : 17);

          const tag = fourcc(dv, p + 4 + sideInfo);

          const vbr = tag === 'Xing' || tag === 'VBRI' || fourcc(dv, p + 36) === 'VBRI';

          const verName = verBits === 3 ? 'MPEG-1' : (verBits === 2 ? 'MPEG-2' : 'MPEG-2.5');

          return {

            format: `MP${layer} \u00b7 ${verName} Layer ${'I'.repeat(layer)}`,

            codec: 'mp3', lossless: false, sampleRate, channels: mono ? 1 : 2, bitDepth: null,

            // A CBR header bitrate is exact. A VBR file's first frame says nothing about the average.

            exactBitrateKbps: tag === 'Xing' || vbr ? null : kbps,

            vbr: vbr && tag !== 'Info'

          };

        }

        return null;

      }



      function parseAdtsInfo(dv) {

        for (let p = 0; p < Math.min(dv.byteLength - 7, 4096); p++) {

          if (dv.getUint8(p) !== 0xff || (dv.getUint8(p + 1) & 0xf6) !== 0xf0) continue; // sync + layer 00

          const sfIdx = (dv.getUint8(p + 2) >> 2) & 15;

          if (sfIdx > 12) continue;

          const cfg = ((dv.getUint8(p + 2) & 1) << 2) | (dv.getUint8(p + 3) >> 6);

          const profile = ['AAC Main', 'AAC-LC', 'AAC SSR', 'AAC LTP'][dv.getUint8(p + 2) >> 6];

          return {

            format: `AAC (ADTS) \u00b7 ${profile}`, codec: 'aac', lossless: false, bitDepth: null,

            sampleRate: AAC_SAMPLE_RATES[sfIdx], channels: cfg === 7 ? 8 : cfg || null

          };

        }

        return null;

      }



      function parseOggInfo(dv) {

        // The first page carries the codec's identification header as its first packet.

        if (dv.byteLength < 28 || fourcc(dv, 0) !== 'OggS') return null;

        const p = 27 + dv.getUint8(26);

        if (p + 8 > dv.byteLength) return null;

        if (dv.getUint8(p) === 0x01 && fourcc(dv, p + 1) === 'vorb') { // "\x01vorbis"

          const nominal = dv.getInt32(p + 20, true);

          return {

            format: 'Ogg Vorbis', codec: 'vorbis', lossless: false, bitDepth: null,

            channels: dv.getUint8(p + 11), sampleRate: dv.getUint32(p + 12, true),

            nominalBitrateKbps: nominal > 0 ? nominal / 1000 : null

          };

        }

        if (fourcc(dv, p) === 'Opus' && fourcc(dv, p + 4) === 'Head') {

          // Opus always decodes at 48 kHz; the header only records the rate of the original input.

          return {

            format: 'Ogg Opus', codec: 'opus', lossless: false, bitDepth: null,

            channels: dv.getUint8(p + 9), sampleRate: dv.getUint32(p + 12, true) || 48000,

            opusAlways48k: true

          };

        }

        if (dv.getUint8(p) === 0x7f && fourcc(dv, p + 1) === 'FLAC') {

          // Ogg FLAC: 0x7F "FLAC", ver(2), header count(2), "fLaC", block header(4), STREAMINFO

          const d = p + 13 + 4;

          if (d + 18 > dv.byteLength) return null;

          const bits = (((dv.getUint8(d + 12) & 1) << 4) | (dv.getUint8(d + 13) >> 4)) + 1;

          return {

            format: 'Ogg FLAC', codec: 'flac', lossless: true, bitDepth: `${bits}-bit`,

            sampleRate: (dv.getUint8(d + 10) << 12) | (dv.getUint8(d + 11) << 4) | (dv.getUint8(d + 12) >> 4),

            channels: ((dv.getUint8(d + 12) >> 1) & 7) + 1

          };

        }

        return null;

      }



      function parseAiffInfo(dv) {

        const form = fourcc(dv, 8);

        if (form !== 'AIFF' && form !== 'AIFC') return null;

        let p = 12;

        const isAifc = form === 'AIFC';

        while (p + 8 <= dv.byteLength) {

          const id = fourcc(dv, p);

          const size = dv.getUint32(p + 4, false);

          if (id === 'COMM' && p + 8 + 18 <= dv.byteLength) {

            const d = p + 8;

            const expo = ((dv.getUint8(d + 8) & 0x7f) << 8) | dv.getUint8(d + 9);

            const mant = dv.getUint32(d + 10, false) * 4294967296 + dv.getUint32(d + 14, false);

            const comp = isAifc && size >= 22 ? fourcc(dv, d + 18) : 'NONE';

            const lossless = comp === 'NONE' || comp === 'sowt' || comp === 'fl32' || comp === 'fl64' || comp === 'in24' || comp === 'in32';

            const bits = dv.getUint16(d + 6, false);

            return {

              format: isAifc ? `AIFF-C${comp !== 'NONE' ? ' \u00b7 ' + comp : ''}` : 'AIFF',

              codec: 'aiff', lossless, channels: dv.getUint16(d, false),

              sampleRate: Math.round(mant * Math.pow(2, expo - 16383 - 63)),

              bitDepth: lossless ? (comp === 'fl32' || comp === 'fl64' ? `${bits}-bit float` : `${bits}-bit`) : null,

              exactBitrateKbps: lossless && bits ? (Math.round(mant * Math.pow(2, expo - 16383 - 63)) * dv.getUint16(d, false) * bits) / 1000 : null

            };

          }

          p += 8 + size + (size & 1);

        }

        return null;

      }



      // ISO base media (M4A / MP4 audio): walk the box tree to the first audio sample entry.

      function parseMp4Info(dv) {

        const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

        const AUDIO = new Set(['mp4a', 'alac', 'ac-3', 'ec-3', 'Opus', 'fLaC', 'sowt', 'twos', 'lpcm', 'ipcm', 'fpcm']);

        let found = null;



        function readEsdsObjectType(start, end) {

          // esds = full box (4 bytes) + ES_Descriptor(0x03) containing DecoderConfigDescriptor(0x04)

          const len = (q) => { let n = 0, i = 0; for (; i < 4 && q < end; i++) { const b = dv.getUint8(q++); n = (n << 7) | (b & 0x7f); if (!(b & 0x80)) break; } return [n, q]; };

          let q = start + 4;

          if (q >= end || dv.getUint8(q) !== 0x03) return null;

          [, q] = len(q + 1);

          q += 2;                                   // ES_ID

          const flags = dv.getUint8(q++);

          if (flags & 0x80) q += 2;

          if (flags & 0x40) q += 1 + dv.getUint8(q);

          if (flags & 0x20) q += 2;

          if (q >= end || dv.getUint8(q) !== 0x04) return null;

          [, q] = len(q + 1);

          return q < end ? dv.getUint8(q) : null;

        }



        function walk(start, end) {

          let p = start;

          while (p + 8 <= end && !found) {

            let size = dv.getUint32(p, false);

            const type = fourcc(dv, p + 4);

            let header = 8;

            if (size === 1) { size = dv.getUint32(p + 8, false) * 4294967296 + dv.getUint32(p + 12, false); header = 16; }

            else if (size === 0) size = end - p;

            if (size < header) size = header;          // malformed: always make progress

            if (p + size > end) size = end - p;        // truncated file: clamp to what exists

            const body = p + header, bodyEnd = p + size;



            if (CONTAINERS.has(type)) {

              walk(body, bodyEnd);

            } else if (type === 'stsd' && body + 8 <= bodyEnd) {

              // full box: version/flags(4) + entry_count(4), then sample entries as boxes

              let e = body + 8;

              while (e + 36 <= bodyEnd && !found) {

                const eSize = dv.getUint32(e, false);

                const eType = fourcc(dv, e + 4);

                if (AUDIO.has(eType)) {

                  const d = e + 8;

                  const info = {

                    codec: eType, lossless: ['alac', 'fLaC', 'sowt', 'twos', 'lpcm', 'ipcm', 'fpcm'].includes(eType),

                    channels: dv.getUint16(d + 16, false),

                    sampleRate: dv.getUint16(d + 24, false),   // 16.16 fixed point: integer part

                    bitDepth: null, format: eType

                  };

                  const sampleSize = dv.getUint16(d + 18, false);

                  // child boxes start after the 28-byte audio sample entry body

                  let c = d + 28;

                  const eEnd = Math.min(e + eSize, bodyEnd);

                  while (c + 8 <= eEnd) {

                    const cSize = dv.getUint32(c, false);

                    const cType = fourcc(dv, c + 4);

                    if (cSize < 8) break;

                    if (cType === 'esds') {

                      const ot = readEsdsObjectType(c + 8, Math.min(c + cSize, eEnd));

                      if (ot === 0x6b || ot === 0x69) { info.codec = 'mp3'; info.format = 'M4A \u00b7 MP3'; }

                      else if (ot === 0x40 || (ot >= 0x66 && ot <= 0x68)) { info.codec = 'aac'; info.format = 'M4A \u00b7 AAC'; }

                      else info.format = 'M4A \u00b7 MPEG-4 audio';

                    } else if (cType === 'alac' && c + 8 + 24 + 4 <= eEnd) {

                      const a = c + 8 + 4;               // skip box header and the version/flags word

                      info.bitDepth = `${dv.getUint8(a + 5)}-bit`;

                      info.channels = dv.getUint8(a + 9) || info.channels;

                      info.sampleRate = dv.getUint32(a + 20, false) || info.sampleRate;

                    } else if (cType === 'dOps') {

                      info.sampleRate = dv.getUint32(c + 8 + 4, false) || 48000;

                      info.opusAlways48k = true;

                    } else if (cType === 'dfLa') {

                      // fLaC in MP4: full box + metadata block header(4) + STREAMINFO

                      const s = c + 8 + 4 + 4;

                      if (s + 18 <= eEnd) {

                        info.sampleRate = (dv.getUint8(s + 10) << 12) | (dv.getUint8(s + 11) << 4) | (dv.getUint8(s + 12) >> 4);

                        info.channels = ((dv.getUint8(s + 12) >> 1) & 7) + 1;

                        info.bitDepth = `${(((dv.getUint8(s + 12) & 1) << 4) | (dv.getUint8(s + 13) >> 4)) + 1}-bit`;

                      }

                    }

                    c += cSize;

                  }

                  if (eType === 'alac') info.format = 'M4A \u00b7 ALAC';

                  else if (eType === 'ac-3') info.format = 'M4A \u00b7 AC-3';

                  else if (eType === 'ec-3') info.format = 'M4A \u00b7 E-AC-3';

                  else if (eType === 'Opus') info.format = 'MP4 \u00b7 Opus';

                  else if (eType === 'fLaC') info.format = 'MP4 \u00b7 FLAC';

                  else if (info.lossless && !info.bitDepth && sampleSize) info.bitDepth = `${sampleSize}-bit`;

                  if (info.lossless === false) info.bitDepth = null;

                  found = info;

                  return;

                }

                if (eSize < 8) break;

                e += eSize;

              }

            }

            p += size;

          }

        }



        const brand = fourcc(dv, 8);

        if (fourcc(dv, 4) !== 'ftyp') return null;

        walk(0, dv.byteLength);

        if (found && /^(qt|3gp)/.test(brand) && found.format.startsWith('M4A')) found.format = found.format.replace('M4A', 'MP4');

        return found;

      }



      // Returns null when nothing recognisable is found. Never throws.

      function parseAudioContainerInfo(arrayBuffer, fileName) {

        try {

          const dv = new DataView(arrayBuffer);

          if (dv.byteLength < 12) return null;

          const head = fourcc(dv, 0);

          const ext = (/\.([a-z0-9]+)$/i.exec(fileName || '') || [])[1]?.toLowerCase() || '';

          if (head === 'RIFF' && fourcc(dv, 8) === 'WAVE') return parseWavInfo(dv);

          if (head === 'FORM') return parseAiffInfo(dv);

          if (head === 'fLaC' || (head.slice(0, 3) === 'ID3' && fourcc(dv, id3v2Length(dv)) === 'fLaC')) return parseFlacInfo(dv);

          if (head === 'OggS') return parseOggInfo(dv);

          if (fourcc(dv, 4) === 'ftyp') return parseMp4Info(dv);

          // MP3 / ADTS AAC: sync-word sniffing, after any ID3v2 tag.

          if (head.slice(0, 3) === 'ID3' || dv.getUint8(0) === 0xff || ext === 'mp3' || ext === 'aac') {

            return parseMp3Info(dv) || parseAdtsInfo(dv);

          }

          return null;

        } catch (err) {

          console.warn('SonaDSP: could not parse audio header:', err);

          return null;

        }

      }



      function formatHz(hz) {

        if (!Number.isFinite(hz) || hz <= 0) return 'Unavailable';

        return `${Number((hz / 1000).toFixed(3))} kHz`;

      }



      function formatChannels(n) {

        if (!Number.isFinite(n) || n <= 0) return 'Unavailable';

        if (n === 1) return 'Mono';

        if (n === 2) return 'Stereo';

        return `${n} channels`;

      }



      // Turns parsed header info + decode results into the display strings. Pure (no DOM).

      function describeAudioMetadata(info, decoded, fileSize, ctxRate) {

        const dur = decoded ? decoded.duration : 0;

        const ch = (info && info.channels) || (decoded ? decoded.numberOfChannels : null);

        const out = {

          format: info ? info.format : 'Unrecognised container (decoded by the browser)',

          sourceRate: info && info.sampleRate ? formatHz(info.sampleRate) : 'Unavailable',

          bitDepth: 'Unavailable',

          bitrate: 'Unavailable',

          channels: formatChannels(ch),

          note: ''

        };

        const notes = [];



        if (info) {

          if (info.lossless) {

            out.format += ' (lossless)';

            out.bitDepth = info.bitDepth || 'Unavailable';

          } else if (info.codec !== 'wav') {

            out.format += ' (lossy)';

            out.bitDepth = 'N/A (lossy codec)';

          } else {

            out.bitDepth = 'N/A (compressed WAV)';

          }

        }



        if (info && info.exactBitrateKbps) {

          out.bitrate = `${Math.round(info.exactBitrateKbps)} kbps${info.codec === 'mp3' ? ' (CBR)' : ''}`;

        } else if (fileSize > 0 && dur > 0) {

          // Same estimate the tooltip in index.html describes: includes tags, artwork and overhead.

          out.bitrate = `\u2248 ${Math.round((fileSize * 8) / dur / 1000)} kbps (estimate)`;

          if (info && info.nominalBitrateKbps) out.bitrate += `, nominal ${Math.round(info.nominalBitrateKbps)}`;

          if (info && info.vbr) out.bitrate += ', VBR';

        }



        if (info && info.sampleRate && ctxRate && Math.round(info.sampleRate) !== Math.round(ctxRate) && !info.opusAlways48k) {

          notes.push(`The browser resampled this ${formatHz(info.sampleRate)} file to ${formatHz(ctxRate)} when decoding. ` +

            'The graph, FFT and EQ run at the playback rate.');

        }

        if (info && info.opusAlways48k) {

          notes.push('Opus always decodes at 48 kHz; the source rate shown is the rate recorded in the file header.');

        }

        if (!info) {

          notes.push('The file decoded, but its header was not recognised, so source rate and bit depth are unavailable.');

        }

        out.note = notes.join(' ');

        return out;

      }



      function setMetaText(id, text) {

        const el = document.getElementById(id);

        if (el) el.textContent = text;

      }



      function renderAudioMetadataUi(m) {

        setMetaText('metaFormat', m.format);

        setMetaText('metaSourceRate', m.sourceRate);

        setMetaText('metaBitDepth', m.bitDepth);

        setMetaText('metaBitrate', m.bitrate);

        setMetaText('metaChannels', m.channels);

        setMetaText('metaAudioNote', m.note || '');

        updatePlaybackRateMetaUi();

      }



      function updatePlaybackRateMetaUi() {

        setMetaText('metaPlaybackRate', audioCtx ? `${formatHz(audioCtx.sampleRate)} (AudioContext)` : 'Start playback to initialize');

      }



      // Built-in sources (reference groove / pink noise): there is no file, so nothing to parse.

      function renderGeneratedAudioMetadataUi(label) {

        renderAudioMetadataUi({

          format: label || 'Generated audio',

          sourceRate: audioCtx ? `${formatHz(audioCtx.sampleRate)} (generated)` : 'Unavailable',

          bitDepth: '32-bit float (generated)',

          bitrate: 'N/A (generated)',

          channels: 'Stereo',

          note: ''

        });

      }

      // @@audio-meta-end



      // ---------------- Audio file loading (file picker + drag & drop) ----------------
      let audioLoadSeq = 0; // guards against two quick drops finishing out of order

      async function loadAudioFile(file) {
        const ctx = ensureAudioEngine();
        const seq = ++audioLoadSeq;
        showToast(`Loading ${file.name}...`);
        try {
          const ab = await file.arrayBuffer();
          // Read the container header BEFORE decoding: decodeAudioData() detaches `ab`, and it
          // also hides the source rate (it resamples to the AudioContext rate) and bit depth.
          const info = parseAudioContainerInfo(ab, file.name);
          const decoded = await ctx.decodeAudioData(ab);
          if (seq !== audioLoadSeq) return; // a newer file was loaded while this one decoded
          audioBuffer = decoded;
          resetAbLoop();
          state.audioSourceType = 'file';
          state.fileName = file.name;
          state.duration = decoded.duration;
          state.ltasBands = computeBufferLTAS(decoded);
          document.getElementById('audioSourceLabel').textContent = file.name;
          document.getElementById('ltasStatusText').textContent = `LTAS: ${file.name.slice(0, 18)}`;
          document.getElementById('btnSourceSynth').className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-[#FBF9F5] text-[#5C5852] hover:text-[#1E1D1A] border border-[#DED8CC] transition cursor-pointer';
          document.getElementById('btnSourcePink').className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-[#FBF9F5] text-[#5C5852] hover:text-[#1E1D1A] border border-[#DED8CC] transition cursor-pointer';
          updateTransportDurationUi();
          renderAudioMetadataUi(describeAudioMetadata(info, decoded, file.size, ctx.sampleRate));
          startAudioPlayback(0);
          showToast(`Loaded ${file.name}`);
        } catch (err) {
          if (seq !== audioLoadSeq) return;
          const reason = err && err.message ? err.message : 'unsupported file';
          setMetaText('metaAudioNote', `Could not decode ${file.name}: ${reason}`);
          showToast(`Audio decode error: ${reason}`);
        }
      }

      // ====================================================================
      // 7. AUTOEQ SOLVER & CSV / TXT MEASUREMENT PARSERS
      // ====================================================================
      // Greedy residual placement followed by cyclic coordinate descent. Equal weight
      // per log-frequency sample gives each octave equal influence on the fit.
      // Keep full precision internally; only the final UI/export bands are rounded.
      function fitParametricEq(desiredDb, sr, maxBands = 8) {
        if (desiredDb.length !== LOG_FREQS.length ||
            !Array.from(desiredDb).every(Number.isFinite) || !Number.isFinite(sr) || sr < 1000) {
          throw new Error('Invalid frequency response or sample rate for EQ fitting');
        }
        const n = desiredDb.length;
        const maxFreq = Math.min(MAX_FREQ, sr * 0.49);
        const trig = getGridTrig(sr);
        const residual = Float64Array.from(desiredDb);
        const scratch = new Float64Array(n);
        const bands = [], curves = [];
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        // Samples above the usable Nyquist range must not influence the fit.
        const loss = (r, curve) => {
          let sum = 0, count = 0;
          for (let i = 0; i < n; i++) {
            if (LOG_FREQS[i] > maxFreq) continue;
            const e = r[i] - (curve ? curve[i] : 0);
            sum += e * e; count++;
          }
          return sum / Math.max(1, count);
        };
        function refine(seed, r, rounds = 40) {
          let band = { ...seed };
          const evaluate = b => {
            writeBandMagnitudeDb(scratch, b, sr, trig);
            return loss(r, scratch);
          };
          let score = evaluate(band);
          let steps = [0.5, 0.65, 2]; // octaves, log2(Q), dB
          for (let round = 0; round < rounds; round++) {
            let improved = false;
            for (let axis = 0; axis < 3; axis++) {
              if (axis === 1 && band.filterType !== 'peaking' && !engineHonorsShelfQ) continue;
              for (const direction of [-1, 1]) {
                const trial = { ...band };
                if (axis === 0) trial.frequency = clamp(band.frequency * 2 ** (direction * steps[0]), MIN_FREQ, maxFreq);
                if (axis === 1) trial.Q = clamp(band.Q * 2 ** (direction * steps[1]), 0.1, 18);
                if (axis === 2) trial.gain = clamp(band.gain + direction * steps[2], -BAND_GAIN_LIMIT_DB, BAND_GAIN_LIMIT_DB);
                const next = evaluate(trial);
                if (next < score - 1e-9) { band = trial; score = next; improved = true; }
              }
            }
            if (!improved) steps = steps.map(v => v * 0.5);
            if (steps[2] < 0.01) break;
          }
          return { band, score };
        }
        function polish(passes) {
          for (let pass = 0; pass < passes; pass++) {
            const before = loss(residual);
            for (let j = 0; j < bands.length; j++) {
              for (let i = 0; i < n; i++) residual[i] += curves[j][i];
              bands[j] = refine(bands[j], residual).band;
              writeBandMagnitudeDb(curves[j], bands[j], sr, trig);
              for (let i = 0; i < n; i++) residual[i] -= curves[j][i];
            }
            if (before - loss(residual) < 1e-5) break;
          }
        }
        const budget = clamp(Math.floor(maxBands) || 0, 0, EQ_MAX_BANDS);
        for (let k = 0; k < budget; k++) {
          if (Math.sqrt(loss(residual)) < 0.08) break;
          // Try the strongest residual extremum and two alternatives, so a
          // single uncorrectable spike cannot stall the entire fit.
          const peaks = [];
          for (let i = 0; i < n && LOG_FREQS[i] <= maxFreq; i++) {
            const v = Math.abs(residual[i]);
            if ((i === 0 || v >= Math.abs(residual[i - 1])) &&
                (i === n - 1 || LOG_FREQS[i + 1] > maxFreq || v >= Math.abs(residual[i + 1]))) peaks.push(i);
          }
          peaks.sort((a, b) => Math.abs(residual[b]) - Math.abs(residual[a]));
          let best = { score: loss(residual), band: null };
          for (const i of peaks.slice(0, 3)) {
            for (const Q of [0.7, 2, 6]) {
              const candidate = refine({ filterType: 'peaking', frequency: LOG_FREQS[i],
                gain: clamp(residual[i], -BAND_GAIN_LIMIT_DB, BAND_GAIN_LIMIT_DB), Q }, residual);
              if (candidate.score < best.score) best = candidate;
            }
          }
          // Shelves compete on the same full-grid loss as peaks.
          for (const [filterType, index] of [['lowshelf', 0], ['highshelf', n - 1]]) {
            let edge = index;
            while (LOG_FREQS[edge] > maxFreq) edge--;
            const candidate = refine({ filterType, frequency: filterType === 'lowshelf' ? 100 : Math.min(10000, maxFreq),
              gain: clamp(residual[edge], -BAND_GAIN_LIMIT_DB, BAND_GAIN_LIMIT_DB), Q: Math.SQRT1_2 }, residual);
            if (candidate.score < best.score) best = candidate;
          }
          if (!best.band || loss(residual) - best.score < 1e-4) break;
          bands.push(best.band);
          const curve = writeBandMagnitudeDb(new Float64Array(n), best.band, sr, trig);
          curves.push(curve);
          for (let i = 0; i < n; i++) residual[i] -= curve[i];
          polish(2);
        }
        polish(6);
        return bands.sort((a, b) => a.frequency - b.frequency).map((b, i) => ({
          ...b, id: `autoeq_${i + 1}_${Date.now()}`, enabled: true,
          frequency: Math.min(maxFreq, Math.round(b.frequency)), gain: Number(b.gain.toFixed(1)), Q: Number(b.Q.toFixed(2)),
          rationale: 'Iterative full-response target fit'
        }));
      }

      function computeAutoEqBandsForCurrentIem(shapingBands = []) {
        recomputeAcousticCurves();
        const desired = Float64Array.from(targetSplArray, (v, i) => v - stockIemSplArray[i]);
        const sr = currentSampleRate();
        for (const band of shapingBands) {
          const curve = computeBandMagnitudeDb(band, LOG_FREQS, sr);
          for (let i = 0; i < desired.length; i++) desired[i] += curve[i];
        }
        return fitParametricEq(desired, sr);
      }

      function runAutoEqSolverToCurrentTarget() {
        pushEqHistory();
        state.bands = computeAutoEqBandsForCurrentIem();
        state.selectedBandId = state.bands[0]?.id || 'b1';
        state.isEqActive = true;
        updateAbButtonUi();
        syncWebAudioBiquadNodes();
        renderBandsTable();
        showToast(
          `AutoEQ matched to ${getTargetLabel()} (Tilt: ${state.targetTiltDbPerOct} dB/oct, Bass: +${state.targetBassShelfDb} dB)`
        );
      }

      function parseMeasurementTextToCurve(rawText) {
        const lines = rawText.split(/\r?\n/);
        const pts = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line || line.startsWith('#') || line.startsWith('*') || line.toLowerCase().startsWith('freq')) continue;
          const parts = line.split(/[,;\t\s]+/);
          if (parts.length >= 2) {
            const f = parseFloat(parts[0]);
            const db = parseFloat(parts[1]);
            if (Number.isFinite(f) && Number.isFinite(db) && f >= 15 && f <= 24000) {
              pts.push({ f, db });
            }
          }
        }

        if (pts.length < 8) return null;
        pts.sort((a, b) => a.f - b.f);

        const out = new Float32Array(NUM_FREQ_POINTS);
        for (let i = 0; i < NUM_FREQ_POINTS; i++) {
          const targetF = LOG_FREQS[i];
          if (targetF <= pts[0].f) {
            out[i] = pts[0].db;
          } else if (targetF >= pts[pts.length - 1].f) {
            out[i] = pts[pts.length - 1].db;
          } else {
            let k = 0;
            while (k < pts.length - 2 && pts[k + 1].f < targetF) k++;
            const p0 = pts[k];
            const p1 = pts[k + 1];
            const ratio = (targetF - p0.f) / Math.max(1e-6, p1.f - p0.f);
            out[i] = p0.db + ratio * (p1.db - p0.db);
          }
        }
        return out;
      }

      function applyEqualizerApoTextToState(rawText, rationaleLabel = 'Imported from Equalizer APO') {
        const lines = rawText.split(/\r?\n/);
        const imported = [];
        const pRx = /Preamp:\s*([+-]?\d+(?:\.\d+)?)\s*dB/i;
        const fRx = /Filter\s*\d*:\s*(ON|OFF)\s+([A-Z]+)\s+Fc\s+(\d+(?:\.\d+)?)\s*Hz(?:\s+Gain\s+([+-]?\d+(?:\.\d+)?)\s*dB)?(?:\s+Q\s+(\d+(?:\.\d+)?))?/i;

        lines.forEach((line, idx) => {
          const pm = line.match(pRx);
          if (pm) {
            state.autoPreamp = false;
            state.preampDb = parseFloat(pm[1]);
          }
          const fm = line.match(fRx);
          if (fm) {
            const code = fm[2].toUpperCase();
            let ft = 'peaking';
            if (code.startsWith('LS')) ft = 'lowshelf';
            else if (code.startsWith('HS')) ft = 'highshelf';
            else if (code.startsWith('LP')) ft = 'lowpass';
            else if (code.startsWith('HP')) ft = 'highpass';

            imported.push({
              id: `imp_${idx}_${Date.now()}`,
              enabled: fm[1].toUpperCase() === 'ON',
              filterType: ft,
              frequency: Math.max(20, Math.min(20000, Math.round(parseFloat(fm[3])))),
              gain: fm[4] !== undefined ? parseFloat(fm[4]) : 0.0,
              Q: fm[5] !== undefined ? parseFloat(fm[5]) : 0.71,
              rationale: rationaleLabel
            });
          }
        });

        if (imported.length > 0) {
          pushEqHistory();
          state.bands = imported.slice(0, 10);
          state.selectedBandId = state.bands[0].id;
          syncWebAudioBiquadNodes();
          renderBandsTable();
        }
        return imported.length;
      }

      // ====================================================================
      // 8. HIGH-DPI 60FPS DUAL-AXIS HTML5 CANVAS RENDERER
      // ====================================================================
      const canvas = document.getElementById('acousticCanvas');
      const ctx2d = canvas.getContext('2d');
      let draggingBandId = null;
      let dragHistoryPushed = false; // one undo step per drag, taken on the first real movement
      let hoveredBandId = null;
      let hoverMouseCoords = null;

      function getPlotGeometry() {
        const rect = canvas.getBoundingClientRect();
        const padLeft = 64;   // Clean room for Left Y-Axis dB labels
        const padRight = 88;  // Generous 88px right margin so '-90 dBFS' & '20 kHz' never touch the border
        // Taller top margin on narrow screens so the legend can wrap onto 2-3 rows
        const padTop = rect.width >= 800 ? 34 : (rect.width >= 480 ? 52 : 70);
        const padBottom = 42;
        const plotW = Math.max(150, rect.width - padLeft - padRight);
        const plotH = Math.max(120, rect.height - padTop - padBottom);
        return { W: rect.width, H: rect.height, padLeft, padRight, padTop, padBottom, plotW, plotH };
      }

      // Legend drawn in the top margin: explains every curve on the graph
      function drawLegend(g) {
        const { padLeft, plotW } = g;
        const tgt = getTargetLabel();
        const items = [];
        if (state.selectedIemKey !== 'flat_none') {
          items.push({ label: 'Stock IEM', color: '#6E6A63', width: 2.2, dash: [7, 5] });
        }
        if (state.targetCurveKey !== 'none') {
          items.push({ label: `Target: ${tgt.length > 18 ? tgt.slice(0, 17) + '…' : tgt}`, color: '#1D5B4C', width: 2.6 });
        }
        items.push({
          label: state.isEqActive ? 'Post-EQ' : 'Response (EQ off)',
          color: state.isEqActive ? '#C83E2B' : '#57534E',
          width: 3.5
        });
        items.push({ label: 'EQ filter', color: 'rgba(35, 87, 137, 0.85)', width: 2.0 });
        if (state.showLiveFft) {
          items.push({ label: 'Live FFT', color: 'rgba(217, 119, 36, 0.9)', width: 1.8 });
        }

        ctx2d.font = '600 11.5px "JetBrains Mono", monospace';
        ctx2d.textAlign = 'left';
        const swatchW = 24, gap = 7, itemGap = 18, rowH = 17;
        let x = padLeft;
        let y = 12;

        items.forEach((it) => {
          const w = swatchW + gap + ctx2d.measureText(it.label).width;
          if (x > padLeft && x + w > padLeft + plotW) {
            x = padLeft;
            y += rowH;
          }
          ctx2d.beginPath();
          ctx2d.setLineDash(it.dash || []);
          ctx2d.strokeStyle = it.color;
          ctx2d.lineWidth = it.width;
          ctx2d.moveTo(x, y);
          ctx2d.lineTo(x + swatchW, y);
          ctx2d.stroke();
          ctx2d.setLineDash([]);
          ctx2d.fillStyle = '#4A463F';
          ctx2d.fillText(it.label, x + swatchW + gap, y + 4);
          x += w + itemGap;
        });
      }

      function renderCanvasLoop() {
        const geom = getPlotGeometry();
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== Math.floor(geom.W * dpr) || canvas.height !== Math.floor(geom.H * dpr)) {
          canvas.width = Math.floor(geom.W * dpr);
          canvas.height = Math.floor(geom.H * dpr);
        }

        ctx2d.save();
        ctx2d.scale(dpr, dpr);

        const { W, H, padLeft, padTop, plotW, plotH } = geom;

        // 1. Warm Parchment Plot Surface
        ctx2d.fillStyle = '#FCFBF8';
        ctx2d.fillRect(0, 0, W, H);
        ctx2d.fillStyle = '#FAF7F0';
        ctx2d.fillRect(padLeft, padTop, plotW, plotH);

        // 2. Logarithmic Frequency Grid (20 Hz to 20 kHz)
        const freqGrid = [
          { f: 20, label: '20Hz' },
          { f: 30, label: '' },
          { f: 50, label: '50Hz' },
          { f: 100, label: '100Hz' },
          { f: 200, label: '200Hz' },
          { f: 500, label: '500Hz' },
          { f: 1000, label: '1kHz' },
          { f: 2000, label: '2kHz' },
          { f: 5000, label: '5kHz' },
          { f: 10000, label: '10kHz' },
          { f: 20000, label: '20kHz' }
        ];

        ctx2d.font = '600 12.5px "JetBrains Mono", monospace';
        ctx2d.textAlign = 'center';

        freqGrid.forEach(({ f, label }) => {
          const x = padLeft + freqToNormX(f) * plotW;
          ctx2d.strokeStyle = label ? '#E2DDD2' : '#EFECE4';
          ctx2d.lineWidth = label ? 1.1 : 1.0;
          ctx2d.beginPath();
          ctx2d.moveTo(x, padTop);
          ctx2d.lineTo(x, padTop + plotH);
          ctx2d.stroke();

          if (label) {
            ctx2d.fillStyle = '#5C5852';
            ctx2d.fillText(label, x, padTop + plotH + 23);
          }
        });

        // 3. Left Y-Axis (Relative dB -20 to +20) & Right Y-Axis (Live FFT -90 to 0 dBFS)
        const relDbTicks = [-20, -15, -10, -5, 0, 5, 10, 15, 20];
        relDbTicks.forEach((relDb) => {
          const normY = relDbToNormY(relDb);
          const y = padTop + normY * plotH;

          ctx2d.strokeStyle = relDb === 0 ? '#B8B0A2' : '#E6E1D6';
          ctx2d.lineWidth = relDb === 0 ? 1.5 : 1.0;
          ctx2d.beginPath();
          ctx2d.moveTo(padLeft, y);
          ctx2d.lineTo(padLeft + plotW, y);
          ctx2d.stroke();

          // Left Axis Label (Relative dB)
          ctx2d.textAlign = 'right';
          ctx2d.fillStyle = relDb === 0 ? '#1E1D1A' : '#6E6A63';
          const sign = relDb > 0 ? '+' : '';
          ctx2d.fillText(`${sign}${relDb}dB`, padLeft - 10, y + 4);

          // Right Axis Label (Right-aligned at W - 16 so it never overflows the right card border)
          const dbfsVal = Math.round(normYToDbfs(normY));
          ctx2d.textAlign = 'right';
          ctx2d.fillStyle = '#B45309';
          ctx2d.fillText(`${dbfsVal} dBFS`, W - 16, y + 4);
        });

        // Clip Plot Region
        ctx2d.save();
        ctx2d.beginPath();
        ctx2d.rect(padLeft, padTop, plotW, plotH);
        ctx2d.clip();

        // 4. Full-Range Live FFT Spectrum (-90 dBFS to 0 dBFS)
        if (audioCtx && postAnalyser && state.isPlaying) {
          const elapsed = getPlaybackPosition();
          const timeCurEl = document.getElementById('timeCurrent');
          const seekEl = document.getElementById('seekSlider');
          if (timeCurEl) timeCurEl.textContent = formatTime(elapsed);
          if (seekEl && document.activeElement !== seekEl) seekEl.value = elapsed;

          if (state.showLiveFft && floatFftPost && floatFftPre) {
            postAnalyser.getFloatFrequencyData(floatFftPost);
            preAnalyser.getFloatFrequencyData(floatFftPre);

            const nyquist = audioCtx.sampleRate / 2;
            const binCount = postAnalyser.frequencyBinCount;

            // Pre-EQ FFT Trace
            ctx2d.beginPath();
            for (let i = 0; i < NUM_FREQ_POINTS; i++) {
              const f = LOG_FREQS[i];
              const exactBin = (f / nyquist) * binCount;
              const b0 = Math.max(0, Math.min(binCount - 1, Math.floor(exactBin)));
              const b1 = Math.min(binCount - 1, b0 + 1);
              const frac = exactBin - b0;
              const rawDbfs = floatFftPre[b0] + frac * (floatFftPre[b1] - floatFftPre[b0]);
              const boostedDbfs = (Number.isFinite(rawDbfs) ? rawDbfs : -100) + state.fftGainOffsetDb;

              const x = padLeft + (i / (NUM_FREQ_POINTS - 1)) * plotW;
              const y = padTop + dbfsToNormY(boostedDbfs) * plotH;
              if (i === 0) ctx2d.moveTo(x, y);
              else ctx2d.lineTo(x, y);
            }
            ctx2d.strokeStyle = 'rgba(110, 106, 99, 0.45)';
            ctx2d.lineWidth = 1.5;
            ctx2d.stroke();

            // Post-EQ Full-Scale FFT Spectrum Fill
            ctx2d.beginPath();
            ctx2d.moveTo(padLeft, padTop + plotH);
            for (let i = 0; i < NUM_FREQ_POINTS; i++) {
              const f = LOG_FREQS[i];
              const exactBin = (f / nyquist) * binCount;
              const b0 = Math.max(0, Math.min(binCount - 1, Math.floor(exactBin)));
              const b1 = Math.min(binCount - 1, b0 + 1);
              const frac = exactBin - b0;
              const rawDbfs = floatFftPost[b0] + frac * (floatFftPost[b1] - floatFftPost[b0]);
              const boostedDbfs = (Number.isFinite(rawDbfs) ? rawDbfs : -100) + state.fftGainOffsetDb;

              const x = padLeft + (i / (NUM_FREQ_POINTS - 1)) * plotW;
              const y = padTop + dbfsToNormY(boostedDbfs) * plotH;
              ctx2d.lineTo(x, y);
            }
            ctx2d.lineTo(padLeft + plotW, padTop + plotH);
            ctx2d.closePath();

            const grad = ctx2d.createLinearGradient(0, padTop, 0, padTop + plotH);
            grad.addColorStop(0.0, 'rgba(217, 119, 36, 0.36)');
            grad.addColorStop(0.65, 'rgba(217, 119, 36, 0.15)');
            grad.addColorStop(1.0, 'rgba(217, 119, 36, 0.02)');
            ctx2d.fillStyle = grad;
            ctx2d.fill();

            ctx2d.strokeStyle = 'rgba(217, 119, 36, 0.85)';
            ctx2d.lineWidth = 1.8;
            ctx2d.stroke();
          }
        }

        // 5. Individual Filter Band Shaded Regions + Composite Blue Filter Transfer Curve
        const zeroY = padTop + relDbToNormY(0) * plotH;
        const sr = audioCtx ? audioCtx.sampleRate : 48000;
        state.bands.forEach((band, idx) => {
          if (!band.enabled) return;
          const color = BAND_COLORS[idx % BAND_COLORS.length];
          const bDb = getBandCurveDb(band, sr);
          const isFocus = band.id === state.selectedBandId || band.id === hoveredBandId;

          ctx2d.beginPath();
          ctx2d.moveTo(padLeft, zeroY);
          for (let i = 0; i < NUM_FREQ_POINTS; i++) {
            const x = padLeft + (i / (NUM_FREQ_POINTS - 1)) * plotW;
            const y = padTop + relDbToNormY(bDb[i]) * plotH;
            ctx2d.lineTo(x, y);
          }
          ctx2d.lineTo(padLeft + plotW, zeroY);
          ctx2d.closePath();

          ctx2d.fillStyle = isFocus ? `${color}28` : `${color}10`;
          ctx2d.fill();
        });

        // Composite EQ Filter Transfer Line (Cobalt Blue)
        ctx2d.beginPath();
        for (let i = 0; i < NUM_FREQ_POINTS; i++) {
          const x = padLeft + (i / (NUM_FREQ_POINTS - 1)) * plotW;
          const y = padTop + relDbToNormY(state.isEqActive ? compositeEqDbArray[i] : 0) * plotH;
          if (i === 0) ctx2d.moveTo(x, y);
          else ctx2d.lineTo(x, y);
        }
        ctx2d.strokeStyle = 'rgba(35, 87, 137, 0.75)';
        ctx2d.lineWidth = 2.0;
        ctx2d.stroke();

        // 6. Custom Target Curve (Deep Forest Green)
        if (state.targetCurveKey !== 'none') {
          ctx2d.beginPath();
          for (let i = 0; i < NUM_FREQ_POINTS; i++) {
            const x = padLeft + (i / (NUM_FREQ_POINTS - 1)) * plotW;
            const y = padTop + relDbToNormY(targetSplArray[i]) * plotH;
            if (i === 0) ctx2d.moveTo(x, y);
            else ctx2d.lineTo(x, y);
          }
          ctx2d.strokeStyle = '#1D5B4C';
          ctx2d.lineWidth = 2.6;
          ctx2d.stroke();
        }

        // 7. Raw Stock IEM Measurement Curve (Dashed Charcoal Slate)
        if (state.selectedIemKey !== 'flat_none') {
          ctx2d.beginPath();
          for (let i = 0; i < NUM_FREQ_POINTS; i++) {
            const x = padLeft + (i / (NUM_FREQ_POINTS - 1)) * plotW;
            const y = padTop + relDbToNormY(stockIemSplArray[i]) * plotH;
            if (i === 0) ctx2d.moveTo(x, y);
            else ctx2d.lineTo(x, y);
          }
          ctx2d.setLineDash([7, 5]);
          ctx2d.strokeStyle = '#6E6A63';
          ctx2d.lineWidth = 2.2;
          ctx2d.stroke();
          ctx2d.setLineDash([]);
        }

        // 8. Post-EQ IEM Response Curve (Bold Acoustic Vermilion)
        ctx2d.beginPath();
        for (let i = 0; i < NUM_FREQ_POINTS; i++) {
          const x = padLeft + (i / (NUM_FREQ_POINTS - 1)) * plotW;
          const postDb = stockIemSplArray[i] + (state.isEqActive ? compositeEqDbArray[i] : 0);
          const y = padTop + relDbToNormY(postDb) * plotH;
          if (i === 0) ctx2d.moveTo(x, y);
          else ctx2d.lineTo(x, y);
        }
        ctx2d.strokeStyle = state.isEqActive ? '#C83E2B' : '#57534E';
        ctx2d.lineWidth = 3.5;
        ctx2d.stroke();

        // Hover Crosshair Guide
        if (hoverMouseCoords) {
          ctx2d.strokeStyle = 'rgba(24, 23, 21, 0.25)';
          ctx2d.lineWidth = 1.2;
          ctx2d.beginPath();
          ctx2d.moveTo(hoverMouseCoords.x, padTop);
          ctx2d.lineTo(hoverMouseCoords.x, padTop + plotH);
          ctx2d.stroke();
        }

        ctx2d.restore(); // End clip

        // 9. Large, High-Legibility Draggable Band Handles (Radius 11px, 12.5px Font)
        state.bands.forEach((band, idx) => {
          const color = BAND_COLORS[idx % BAND_COLORS.length];
          const x = padLeft + freqToNormX(band.frequency) * plotW;
          const handleRelDb = band.filterType === 'lowpass' || band.filterType === 'highpass' ? 0 : band.gain;
          const y = padTop + relDbToNormY(handleRelDb) * plotH;

          const isSelected = band.id === state.selectedBandId;
          const isHover = band.id === hoveredBandId || band.id === draggingBandId;

          if (isSelected || isHover) {
            ctx2d.beginPath();
            ctx2d.arc(x, y, 16, 0, Math.PI * 2);
            ctx2d.fillStyle = `${color}28`;
            ctx2d.fill();
            ctx2d.strokeStyle = color;
            ctx2d.lineWidth = 2;
            ctx2d.stroke();
          }

          ctx2d.beginPath();
          ctx2d.arc(x, y, 11, 0, Math.PI * 2);
          ctx2d.fillStyle = band.enabled ? color : '#9E9587';
          ctx2d.fill();
          ctx2d.strokeStyle = '#FFFDF9';
          ctx2d.lineWidth = 2.2;
          ctx2d.stroke();

          ctx2d.fillStyle = '#FFFDF9';
          ctx2d.font = '700 12.5px "JetBrains Mono", monospace';
          ctx2d.textAlign = 'center';
          ctx2d.fillText(String(idx + 1), x, y + 4.5);
        });

        // Outer Plot Border
        ctx2d.strokeStyle = '#B5ADA0';
        ctx2d.lineWidth = 1.5;
        ctx2d.strokeRect(padLeft, padTop, plotW, plotH);

        // Legend (top margin)
        drawLegend(geom);

        ctx2d.restore();
        requestAnimationFrame(renderCanvasLoop);
      }

      // ====================================================================
      // 9. CANVAS POINTER INTERACTION (DRAG FREQUENCY/GAIN, WHEEL Q)
      // ====================================================================
      function getPointerCanvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
      }

      function findBandNearPoint(pt) {
        const { padLeft, padTop, plotW, plotH } = getPlotGeometry();
        let best = null;
        let minDist = 22;
        state.bands.forEach((band) => {
          const bx = padLeft + freqToNormX(band.frequency) * plotW;
          const relDb = band.filterType === 'lowpass' || band.filterType === 'highpass' ? 0 : band.gain;
          const by = padTop + relDbToNormY(relDb) * plotH;
          const dist = Math.hypot(pt.x - bx, pt.y - by);
          if (dist < minDist) {
            minDist = dist;
            best = band;
          }
        });
        return best;
      }

      canvas.addEventListener('mousedown', (e) => {
        const pt = getPointerCanvasPos(e);
        const hit = findBandNearPoint(pt);
        if (hit) {
          state.selectedBandId = hit.id;
          draggingBandId = hit.id;
          dragHistoryPushed = false;
          renderBandsTable();
          updateActiveBandPillUi();
        }
      });

      canvas.addEventListener('mousemove', (e) => {
        const pt = getPointerCanvasPos(e);
        const { padLeft, padTop, plotW, plotH } = getPlotGeometry();

        if (pt.x >= padLeft && pt.x <= padLeft + plotW && pt.y >= padTop && pt.y <= padTop + plotH) {
          hoverMouseCoords = pt;
          const normX = (pt.x - padLeft) / plotW;
          const hoverF = Math.round(normXToFreq(normX));
          const idx = Math.min(NUM_FREQ_POINTS - 1, Math.max(0, Math.round(normX * (NUM_FREQ_POINTS - 1))));
          const stockSpl = (state.normRefSpl + stockIemSplArray[idx]).toFixed(1);
          const postSpl = (state.normRefSpl + stockIemSplArray[idx] + (state.isEqActive ? compositeEqDbArray[idx] : 0)).toFixed(1);
          const eqDelta = compositeEqDbArray[idx].toFixed(1);

          const cursorEl = document.getElementById('cursorReadout');
          if (cursorEl) {
            cursorEl.classList.remove('hidden');
            cursorEl.textContent = `${hoverF} Hz | Stock: ${stockSpl} dB | Post-EQ: ${postSpl} dB | Filter: ${eqDelta > 0 ? '+' : ''}${eqDelta} dB`;
          }
        } else {
          hoverMouseCoords = null;
          document.getElementById('cursorReadout')?.classList.add('hidden');
        }

        if (draggingBandId) {
          const normX = (pt.x - padLeft) / plotW;
          const normY = (pt.y - padTop) / plotH;
          const newFreq = Math.round(Math.max(20, Math.min(20000, normXToFreq(normX))));
          const newGain = Number(Math.max(-BAND_GAIN_LIMIT_DB, Math.min(BAND_GAIN_LIMIT_DB, normYToRelDb(normY))).toFixed(1));

          const band = state.bands.find((b) => b.id === draggingBandId);
          if (band) {
            if (!dragHistoryPushed) {
              pushEqHistory();
              dragHistoryPushed = true;
            }
            band.frequency = newFreq;
            if (band.filterType !== 'lowpass' && band.filterType !== 'highpass') {
              band.gain = newGain;
            }
            syncWebAudioBiquadNodes();
            updateBandRowInputsInPlace(band);
          }
        } else {
          const hit = findBandNearPoint(pt);
          hoveredBandId = hit ? hit.id : null;
        }
      });

      window.addEventListener('mouseup', () => {
        draggingBandId = null;
        dragHistoryPushed = false;
      });

      canvas.addEventListener('mouseleave', () => {
        hoverMouseCoords = null;
        document.getElementById('cursorReadout')?.classList.add('hidden');
      });

      canvas.addEventListener('wheel', (e) => {
        const pt = getPointerCanvasPos(e);
        const target = findBandNearPoint(pt) || state.bands.find((b) => b.id === state.selectedBandId);
        if (!target) return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.2 : -0.2;
        beginManualEdit();
        target.Q = Number(Math.max(0.1, Math.min(18.0, target.Q + delta)).toFixed(2));
        syncWebAudioBiquadNodes();
        updateBandRowInputsInPlace(target);
      }, { passive: false });

      // ====================================================================
      // 10. SPACIOUS DOM RENDERERS & EVENT HANDLERS
      // ====================================================================
      function showToast(msg) {
        const t = document.getElementById('toastBanner');
        if (!t) return;
        t.textContent = msg;
        t.classList.remove('opacity-0', 'translate-y-2');
        t.classList.add('opacity-100', 'translate-y-0');
        clearTimeout(t._timer);
        t._timer = setTimeout(() => {
          t.classList.remove('opacity-100', 'translate-y-0');
          t.classList.add('opacity-0', 'translate-y-2');
        }, 2600);
      }

      function formatTime(sec) {
        if (!Number.isFinite(sec) || sec < 0) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${String(s).padStart(2, '0')}`;
      }

      function updatePlayButtonUi() {
        const iconPlay = document.getElementById('iconPlay');
        const iconPause = document.getElementById('iconPause');
        const txt = document.getElementById('playBtnText');
        if (state.isPlaying) {
          iconPlay.classList.add('hidden');
          iconPause.classList.remove('hidden');
          txt.textContent = 'Pause';
        } else {
          iconPlay.classList.remove('hidden');
          iconPause.classList.add('hidden');
          txt.textContent = 'Play';
        }
      }

      function updateTransportDurationUi() {
        const durEl = document.getElementById('timeDuration');
        const seekEl = document.getElementById('seekSlider');
        if (durEl) durEl.textContent = formatTime(state.duration);
        if (seekEl) seekEl.max = state.duration;
      }

      function updateActiveBandPillUi() {
        const pill = document.getElementById('activeBandPill');
        if (!pill) return;
        const idx = state.bands.findIndex((b) => b.id === state.selectedBandId);
        const b = state.bands[idx] || state.bands[0];
        if (!b) return;
        const sign = b.gain > 0 ? '+' : '';
        pill.textContent = `Band ${idx + 1} (${b.filterType.toUpperCase()}): ${b.frequency} Hz | ${sign}${b.gain.toFixed(1)} dB | Q ${b.Q.toFixed(2)}`;
      }

      function updateBandRowInputsInPlace(band) {
        const row = document.querySelector(`[data-band-row="${band.id}"]`);
        if (!row) return;
        const fNum = row.querySelector('.band-freq-num');
        const fRng = row.querySelector('.band-freq-rng');
        const gNum = row.querySelector('.band-gain-num');
        const gRng = row.querySelector('.band-gain-rng');
        const qNum = row.querySelector('.band-q-num');
        const qRng = row.querySelector('.band-q-rng');

        if (fNum && document.activeElement !== fNum) fNum.value = band.frequency;
        if (fRng && document.activeElement !== fRng) fRng.value = Math.round(freqToNormX(band.frequency) * 1000);
        if (gNum && document.activeElement !== gNum) gNum.value = band.gain;
        if (gRng && document.activeElement !== gRng) gRng.value = band.gain;
        if (qNum && document.activeElement !== qNum) qNum.value = band.Q;
        if (qRng && document.activeElement !== qRng) qRng.value = band.Q;
      }

      function renderBandsTable() {
        const container = document.getElementById('bandsTableContainer');
        if (!container) return;
        container.innerHTML = '';

        state.bands.forEach((band, idx) => {
          const color = BAND_COLORS[idx % BAND_COLORS.length];
          const isSelected = band.id === state.selectedBandId;
          const isPass = band.filterType === 'lowpass' || band.filterType === 'highpass';

          const row = document.createElement('div');
          row.setAttribute('data-band-row', band.id);
          row.className = `rounded-xl p-3.5 border transition ${
            isSelected
              ? 'bg-[#F4F0EA] border-[#C84B31] shadow-2xs'
              : 'bg-[#FBF9F5] hover:bg-[#F4F0EA]/60 border-[#DED8CC]'
          }`;

          row.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              <!-- Band Toggle, Badge & Filter Type (3 cols) -->
              <div class="sm:col-span-3 flex items-center gap-2.5">
                <input type="checkbox" class="band-enable-chk accent-[#C84B31] w-4 h-4 cursor-pointer shrink-0" ${band.enabled ? 'checked' : ''} />
                <span class="w-6 h-6 rounded-full font-mono-num text-xs font-bold text-[#FBF9F5] flex items-center justify-center shrink-0" style="background-color: ${band.enabled ? color : '#9E9587'}">
                  ${idx + 1}
                </span>
                <select class="band-type-sel w-full bg-[#FBF9F5] border border-[#DED8CC] rounded-lg px-2 py-1.5 text-sm font-semibold text-[#1E1D1A] focus:outline-none focus:border-[#C84B31]">
                  ${FILTER_TYPES.map((ft) => `<option value="${ft.value}" ${ft.value === band.filterType ? 'selected' : ''}>${ft.short}</option>`).join('')}
                </select>
              </div>

              <!-- Frequency (3 cols) -->
              <div class="sm:col-span-3 flex flex-col gap-1">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-semibold text-[#5C5852]">Freq (Hz)</span>
                  <input type="number" min="20" max="20000" value="${band.frequency}" class="band-freq-num font-mono-num w-20 bg-[#FBF9F5] border border-[#DED8CC] rounded-md px-1.5 py-0.5 text-right text-sm font-bold text-[#1E1D1A]" />
                </div>
                <input type="range" min="0" max="1000" value="${Math.round(freqToNormX(band.frequency) * 1000)}" class="band-freq-rng w-full" />
              </div>

              <!-- Gain (3 cols) -->
              <div class="sm:col-span-3 flex flex-col gap-1">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-semibold text-[#5C5852]">Gain (dB)</span>
                  <input type="number" min="${-BAND_GAIN_LIMIT_DB}" max="${BAND_GAIN_LIMIT_DB}" step="0.1" value="${band.gain}" ${isPass ? 'disabled' : ''} class="band-gain-num font-mono-num w-16 bg-[#FBF9F5] border border-[#DED8CC] rounded-md px-1.5 py-0.5 text-right text-sm font-bold text-[#1E1D1A] disabled:opacity-40" />
                </div>
                <input type="range" min="${-BAND_GAIN_LIMIT_DB}" max="${BAND_GAIN_LIMIT_DB}" step="0.1" value="${band.gain}" ${isPass ? 'disabled' : ''} class="band-gain-rng w-full" />
              </div>

              <!-- Q Factor & Delete (3 cols) -->
              <div class="sm:col-span-3 flex items-center gap-2.5">
                <div class="flex-1 flex flex-col gap-1">
                  <div class="flex items-center justify-between text-xs">
                    <span class="font-semibold text-[#5C5852]">Q</span>
                    <input type="number" min="0.1" max="18" step="0.05" value="${band.Q}" class="band-q-num font-mono-num w-16 bg-[#FBF9F5] border border-[#DED8CC] rounded-md px-1.5 py-0.5 text-right text-sm font-bold text-[#1E1D1A]" />
                  </div>
                  <input type="range" min="0.1" max="12" step="0.05" value="${band.Q}" class="band-q-rng w-full" />
                </div>
                <button type="button" class="band-del-btn p-2 rounded-lg text-[#5C5852] hover:text-[#C84B31] hover:bg-[#EFEAE1] transition cursor-pointer shrink-0" title="Remove Filter Band">
                  ✕
                </button>
              </div>
            </div>
            ${band.rationale ? `<div class="mt-2 pt-2 border-t border-[#EFEAE1] text-xs font-medium text-[#5C5852]">${escapeHtml(band.rationale)}</div>` : ''}
          `;

          row.addEventListener('click', (ev) => {
            if (['INPUT', 'SELECT', 'BUTTON'].includes(ev.target.tagName)) return;
            state.selectedBandId = band.id;
            renderBandsTable();
            updateActiveBandPillUi();
          });

          row.querySelector('.band-enable-chk').addEventListener('change', (ev) => {
            pushEqHistory();
            band.enabled = ev.target.checked;
            syncWebAudioBiquadNodes();
            renderBandsTable();
          });

          row.querySelector('.band-type-sel').addEventListener('change', (ev) => {
            pushEqHistory();
            band.filterType = ev.target.value;
            if (band.filterType === 'lowpass' || band.filterType === 'highpass') band.gain = 0;
            syncWebAudioBiquadNodes();
            renderBandsTable();
          });

          const fNum = row.querySelector('.band-freq-num');
          const fRng = row.querySelector('.band-freq-rng');
          fNum.addEventListener('input', (ev) => {
            beginManualEdit();
            band.frequency = Math.max(20, Math.min(20000, Math.round(Number(ev.target.value) || 20)));
            fRng.value = Math.round(freqToNormX(band.frequency) * 1000);
            syncWebAudioBiquadNodes();
          });
          fRng.addEventListener('input', (ev) => {
            beginManualEdit();
            band.frequency = Math.round(normXToFreq(Number(ev.target.value) / 1000));
            fNum.value = band.frequency;
            syncWebAudioBiquadNodes();
          });

          const gNum = row.querySelector('.band-gain-num');
          const gRng = row.querySelector('.band-gain-rng');
          gNum.addEventListener('input', (ev) => {
            beginManualEdit();
            band.gain = Math.max(-BAND_GAIN_LIMIT_DB, Math.min(BAND_GAIN_LIMIT_DB, parseFloat(ev.target.value) || 0));
            gRng.value = band.gain;
            syncWebAudioBiquadNodes();
          });
          gRng.addEventListener('input', (ev) => {
            beginManualEdit();
            band.gain = parseFloat(ev.target.value);
            gNum.value = band.gain;
            syncWebAudioBiquadNodes();
          });

          const qNum = row.querySelector('.band-q-num');
          const qRng = row.querySelector('.band-q-rng');
          qNum.addEventListener('input', (ev) => {
            beginManualEdit();
            band.Q = Math.max(0.1, Math.min(18.0, parseFloat(ev.target.value) || 0.71));
            qRng.value = band.Q;
            syncWebAudioBiquadNodes();
          });
          qRng.addEventListener('input', (ev) => {
            beginManualEdit();
            band.Q = parseFloat(ev.target.value);
            qNum.value = band.Q;
            syncWebAudioBiquadNodes();
          });

          row.querySelector('.band-del-btn').addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (state.bands.length <= 1) return;
            pushEqHistory();
            state.bands = state.bands.filter((b) => b.id !== band.id);
            if (state.selectedBandId === band.id) state.selectedBandId = state.bands[0].id;
            syncWebAudioBiquadNodes();
            renderBandsTable();
          });

          container.appendChild(row);
        });
      }

      // Single error score shown above the octave bars. If index.html already has an element with
      // id="rmsScoreBox" it is used as-is; otherwise one is created just above the bars.
      function ensureRmsScoreBox() {
        let box = document.getElementById('rmsScoreBox');
        if (box) return box;
        const grid = document.getElementById('telemetryGrid');
        if (!grid || !grid.parentElement) return null;
        box = document.createElement('div');
        box.id = 'rmsScoreBox';
        box.className = 'w-full flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2';
        box.style.flex = '0 0 100%';
        grid.insertAdjacentElement('beforebegin', box);
        return box;
      }

      function renderRmsScore() {
        const box = ensureRmsScoreBox();
        if (!box) return;
        const label = 'RMS error vs target, 100 Hz\u201310 kHz';
        if (state.targetCurveKey === 'none') {
          box.innerHTML = `<span class="text-xs font-bold text-[#5C5852]">${label}</span><span class="text-xs font-semibold text-[#57534E]">Pick a target to see the score</span>`;
          box.title = '';
          return;
        }
        const r = rmsDeviationDb(LOG_FREQS, stockIemSplArray, compositeEqDbArray, targetSplArray);
        if (!r) { box.innerHTML = ''; return; }
        // Show one decimal and derive the change from the rounded numbers so the line always adds up.
        const b = Math.round(r.before * 10) / 10;
        const a = Math.round(r.after * 10) / 10;
        const d = Math.round((a - b) * 10) / 10;
        const color = d <= -0.1 ? '#1D5B4C' : (d >= 0.1 ? '#C83E2B' : '#57534E');
        const dTxt = d === 0 ? 'no change' : `${d > 0 ? '+' : '\u2212'}${Math.abs(d).toFixed(1)} dB`;
        box.innerHTML =
          `<span class="text-xs font-bold text-[#5C5852]">${label}</span>` +
          `<span class="font-mono-num text-lg font-bold" style="color:#57534E">${b.toFixed(1)}</span>` +
          `<span class="text-sm font-bold text-[#8A857B]">\u2192</span>` +
          `<span class="font-mono-num text-lg font-bold" style="color:${color}">${a.toFixed(1)} dB</span>` +
          `<span class="text-xs font-bold" style="color:${color}">${dTxt}</span>`;
        box.title =
          `Root-mean-square gap between the IEM and the target from 100 Hz to 10 kHz, before and after the EQ ` +
          `(${r.before.toFixed(2)} dB \u2192 ${r.after.toFixed(2)} dB). Every octave counts equally. ` +
          `Both curves are matched at ${state.normFreqHz === 1000 ? '1 kHz' : '500 Hz'}, so changing that switch changes the score. Lower is better; 0 is a perfect match.`;
      }

      function renderTelemetryMatrix() {
        const grid = document.getElementById('telemetryGrid');
        const sub = document.getElementById('telemetrySubtitle');
        if (!grid) return;
        renderRmsScore();

        const iemName = state.selectedIemKey === 'custom'
          ? state.customIemName
          : (BUILTIN_IEM_PROFILES[state.selectedIemKey]?.name || 'IEM');
        if (sub) sub.textContent = `${iemName} vs ${getTargetLabel()}`;

        grid.innerHTML = '';
        ISO_OCTAVES.forEach((oct) => {
          let idx = 0;
          let minD = Infinity;
          for (let i = 0; i < NUM_FREQ_POINTS; i++) {
            const d = Math.abs(LOG_FREQS[i] - oct.freq);
            if (d < minD) { minD = d; idx = i; }
          }
          const errDb = (stockIemSplArray[idx] + compositeEqDbArray[idx]) - targetSplArray[idx];
          const pct = Math.min(100, Math.max(15, Math.abs(errDb) * 9 + 15));
          const color = Math.abs(errDb) < 1.2 ? '#1D5B4C' : (errDb > 0 ? '#C83E2B' : '#235789');

          const col = document.createElement('div');
          col.className = 'flex flex-col items-center justify-end h-full gap-1';
          col.title = `${oct.label} Hz: ${errDb > 0 ? '+' : ''}${errDb.toFixed(1)} dB vs Target`;
          col.innerHTML = `
            <div class="w-full rounded-t transition-all duration-200" style="height:${pct}%; background-color:${color}"></div>
            <span class="font-mono-num text-[12px] font-bold text-[#57534E] leading-none">${oct.label}</span>
          `;
          grid.appendChild(col);
        });
      }

      function getEqualizerApoString() {
        const iemName = state.selectedIemKey === 'custom'
          ? state.customIemName
          : (BUILTIN_IEM_PROFILES[state.selectedIemKey]?.name || 'Custom');
        const lines = [
          `# SonaDSP Parametric EQ Profile`,
          `# Model: ${iemName} | Target: ${getTargetLabel()} (Tilt ${state.targetTiltDbPerOct} dB/oct, Bass +${state.targetBassShelfDb} dB)`,
          `Preamp: ${state.preampDb.toFixed(1)} dB`
        ];
        state.bands.forEach((b, i) => {
          const ft = FILTER_TYPES.find((t) => t.value === b.filterType) || FILTER_TYPES[0];
          const onOff = b.enabled ? 'ON' : 'OFF';
          lines.push(`Filter ${i + 1}: ${onOff} ${ft.apo} Fc ${Math.round(b.frequency)} Hz Gain ${b.gain.toFixed(1)} dB Q ${b.Q.toFixed(2)}`);
        });
        return lines.join('\n');
      }

      function updateApoPreviewUi() {
        const pre = document.getElementById('apoLivePreview');
        if (pre) pre.textContent = getEqualizerApoString();
      }

      // ====================================================================
      // 11. AI CONTROLLER EXECUTION
      // ====================================================================
      async function runAiController() {
        const btn = document.getElementById('btnRunAiController');
        const label = document.getElementById('aiBtnLabel');
        const promptText = document.getElementById('aiPromptInput').value.trim();

        btn.disabled = true;
        label.textContent = 'Computing Parametric Biquad Filters...';

        const octaveDeltas = ISO_OCTAVES.map((oct) => {
          let idx = 0, minD = Infinity;
          for (let i = 0; i < NUM_FREQ_POINTS; i++) {
            const d = Math.abs(LOG_FREQS[i] - oct.freq);
            if (d < minD) { minD = d; idx = i; }
          }
          const delta = Number((stockIemSplArray[idx] - targetSplArray[idx]).toFixed(1));
          return `${oct.label}Hz:${delta > 0 ? '+' : ''}${delta}dB`;
        }).join(', ');

        const ltasSummary = state.ltasBands.map((b) => `${b.label}Hz:${b.db}dB`).join(', ');
        let aiResult = null;

        if (state.apiKey.trim()) {
          try {
            const messages = [
              {
                role: 'system',
                content: 'You are an expert acoustic DSP engineer. Return ONLY valid JSON with keys: {"acousticAnalysis": string, "recommendedPreampDb": number, "bands": [{"frequency": number, "gain": number, "Q": number, "filterType": "peaking"|"lowshelf"|"highshelf"|"lowpass"|"highpass", "rationale": string}]}.'
              },
              {
                role: 'user',
                content: `User Prompt: "${promptText}"\nTarget: ${getTargetLabel()} (Tilt: ${state.targetTiltDbPerOct} dB/oct, Bass Shelf: +${state.targetBassShelfDb} dB)\nIEM vs Target Error by Octave: [${octaveDeltas}]\nLoaded Track LTAS: [${ltasSummary}]`
              }
            ];

            const resp = await fetch(state.apiEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.apiKey.trim()}`
              },
              body: JSON.stringify({
                model: state.modelId,
                messages,
                temperature: 0.2,
                max_tokens: 4096
              })
            });

            if (!resp.ok) {
              const errText = await resp.text();
              throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200)}`);
            }
            const data = await resp.json();
            let raw = data.choices?.[0]?.message?.content || '';
            raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '')
                     .replace(/```json|```/g, '').trim();
            const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
            aiResult = JSON.parse(raw.slice(start, end + 1));
          } catch (err) {
            if (!state.useFallback) {
              document.getElementById('aiSummaryText').textContent = `API Error: ${err.message}. Enable Built-In Acoustic Target Solver Fallback in AI Config.`;
              btn.disabled = false;
              label.textContent = 'Generate & Apply Parametric EQ';
              return;
            }
          }
        }

        if (!aiResult) {
          await new Promise((r) => setTimeout(r, 280));
          const lower = promptText.toLowerCase();
          const shaping = [];
          const shape = (filterType, frequency, gain, Q) => shaping.push({ filterType, frequency,
            gain: Math.max(-BAND_GAIN_LIMIT_DB, Math.min(BAND_GAIN_LIMIT_DB, gain)), Q });
          if (lower.includes('sub-bass') || lower.includes('warm')) {
            const match = lower.match(/([+-]?\d+(?:\.\d+)?)\s*db/);
            shape('lowshelf', 75, (match ? parseFloat(match[1]) : 2.5) * 0.5, 0.71);
          }
          if (lower.includes('mud') || lower.includes('bloat') || lower.includes('240') || lower.includes('250')) shape('peaking', 235, -1.8, 1.3);
          if (lower.includes('sibilan') || lower.includes('glare') || lower.includes('4.5k') || lower.includes('4k') || lower.includes('harsh')) shape('peaking', 4550, -3.2, 3.2);
          if (lower.includes('vocal') || lower.includes('forward')) shape('peaking', 2050, 1.8, 1.5);
          if (lower.includes('air') || lower.includes('11k')) shape('highshelf', 11200, 2.4, 0.71);
          const baseBands = computeAutoEqBandsForCurrentIem(shaping);

          const iemTitle = state.selectedIemKey === 'custom'
            ? state.customIemName
            : (BUILTIN_IEM_PROFILES[state.selectedIemKey]?.name || 'Selected IEM');

          aiResult = {
            acousticAnalysis: `Generated ${baseBands.length}-band profile for ${iemTitle} matched to ${getTargetLabel()} (Tilt: ${state.targetTiltDbPerOct} dB/oct, Bass Shelf: +${state.targetBassShelfDb} dB). Applied ${shaping.length} recognized prompt adjustment(s).`,
            bands: baseBands
          };
        }

        if (aiResult && Array.isArray(aiResult.bands)) {
          pushEqHistory();

          state.bands = aiResult.bands.slice(0, 10).map((b, i) => ({
            id: `ai_${i + 1}_${Date.now()}`,
            enabled: true,
            filterType: FILTER_TYPES.some((t) => t.value === b.filterType) ? b.filterType : 'peaking',
            frequency: Math.round(Math.max(20, Math.min(20000, Number(b.frequency) || 1000))),
            gain: Number(Math.max(-BAND_GAIN_LIMIT_DB, Math.min(BAND_GAIN_LIMIT_DB, Number(b.gain) || 0)).toFixed(1)),
            Q: Number(Math.max(0.1, Math.min(18, Number(b.Q) || 1.0)).toFixed(2)),
            rationale: b.rationale || 'AI parametric filter'
          }));

          state.selectedBandId = state.bands[0]?.id || 'b1';
          state.isEqActive = true;
          updateAbButtonUi();
          syncWebAudioBiquadNodes();
          renderBandsTable();
          document.getElementById('aiSummaryText').textContent = aiResult.acousticAnalysis;
          showToast('Applied new AI parametric EQ curve');
        }

        btn.disabled = false;
        label.textContent = 'Generate & Apply Parametric EQ';
      }

      // ====================================================================
      // 11b. UNDO HISTORY
      // pushEqHistory(): snapshot the bands before a discrete action (AI/AutoEQ/import/add/invert/...).
      // beginManualEdit(): same, but coalesces a burst of slider/number/wheel edits into one undo step.
      // ====================================================================
      const EQ_HISTORY_MAX = 30;
      const MANUAL_EDIT_COALESCE_MS = 700;
      let lastManualEditTs = 0;

      function updateUndoButtonUi() {
        document.getElementById('btnUndoAiEq')?.classList.toggle('hidden', state.history.length === 0);
      }

      function pushEqHistory() {
        state.history.push(JSON.parse(JSON.stringify(state.bands)));
        if (state.history.length > EQ_HISTORY_MAX) state.history.shift();
        lastManualEditTs = 0; // the next manual tweak starts a fresh undo step
        updateUndoButtonUi();
      }

      function beginManualEdit() {
        const now = Date.now();
        if (now - lastManualEditTs > MANUAL_EDIT_COALESCE_MS) pushEqHistory();
        lastManualEditTs = now;
      }

      function undoEq() {
        if (state.history.length === 0) {
          showToast('Nothing to undo');
          return;
        }
        state.bands = state.history.pop();
        if (!state.bands.some((b) => b.id === state.selectedBandId)) {
          state.selectedBandId = state.bands[0]?.id || '';
        }
        lastManualEditTs = 0;
        updateUndoButtonUi();
        syncWebAudioBiquadNodes();
        renderBandsTable();
        const left = state.history.length;
        showToast(left > 0 ? `Undid last change (${left} more available)` : 'Undid last change');
      }

      // ====================================================================
      // 12. UI EVENT LISTENERS & INITIALIZATION
      // ====================================================================
      function updateAbButtonUi() {
        const btn = document.getElementById('btnAbToggle');
        const dot = document.getElementById('abDot');
        const txt = document.getElementById('abText');
        if (state.isEqActive) {
          btn.className = 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-[#2E644C] text-[#FBF9F5] border border-[#214B38] shadow-2xs transition cursor-pointer';
          dot.className = 'w-2.5 h-2.5 rounded-full bg-[#A7F3D0]';
          txt.textContent = 'EQ Active [A]';
        } else {
          btn.className = 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-[#EFEAE1] text-[#5C5852] border border-[#DED8CC] transition cursor-pointer';
          dot.className = 'w-2.5 h-2.5 rounded-full bg-[#857F75]';
          txt.textContent = 'Bypass Flat [B]';
        }
      }

      // AutoEq Searchable Combobox Popover Toggle
      document.getElementById('btnToggleAutoEqPopover')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const pop = document.getElementById('autoEqPopover');
        pop.classList.toggle('hidden');
        if (!pop.classList.contains('hidden')) {
          document.getElementById('autoEqLiveSearchInput')?.focus();
        }
      });

      document.getElementById('btnCloseAutoEqPopover')?.addEventListener('click', () => {
        document.getElementById('autoEqPopover')?.classList.add('hidden');
      });

      document.addEventListener('click', (e) => {
        const pop = document.getElementById('autoEqPopover');
        const trigger = document.getElementById('btnToggleAutoEqPopover');
        if (pop && !pop.classList.contains('hidden') && !pop.contains(e.target) && !trigger.contains(e.target)) {
          pop.classList.add('hidden');
        }
      });

      document.getElementById('btnPlayPause').addEventListener('click', togglePlayPause);

      document.getElementById('seekSlider').addEventListener('input', (e) => {
        const t = parseFloat(e.target.value);
        pauseOffset = t;
        document.getElementById('timeCurrent').textContent = formatTime(t);
        if (state.isPlaying) startAudioPlayback(t);
      });

      document.getElementById('btnSourceSynth').addEventListener('click', () => {
        const ctx = ensureAudioEngine();
        audioBuffer = createSynthesizedAudioBuffer(ctx, 'synth');
        state.audioSourceType = 'synth';
        state.fileName = 'Reference Groove (Built-in)';
        resetAbLoop();
        state.duration = audioBuffer.duration;
        state.ltasBands = computeBufferLTAS(audioBuffer);
        document.getElementById('audioSourceLabel').textContent = state.fileName;
        document.getElementById('btnSourceSynth').className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1E1D1A] text-[#FBF9F5] transition cursor-pointer';
        document.getElementById('btnSourcePink').className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-[#FBF9F5] text-[#5C5852] hover:text-[#1E1D1A] border border-[#DED8CC] transition cursor-pointer';
        updateTransportDurationUi();
        if (state.isPlaying) startAudioPlayback(0);
        renderGeneratedAudioMetadataUi('Generated audio \u00b7 Reference groove');
        showToast('Switched to Reference Synth Groove');
      });

      document.getElementById('btnSourcePink').addEventListener('click', () => {
        const ctx = ensureAudioEngine();
        audioBuffer = createSynthesizedAudioBuffer(ctx, 'pink');
        state.audioSourceType = 'pink';
        state.fileName = 'Pink Noise (Calibrated)';
        resetAbLoop();
        state.duration = audioBuffer.duration;
        state.ltasBands = computeBufferLTAS(audioBuffer);
        document.getElementById('audioSourceLabel').textContent = state.fileName;
        document.getElementById('btnSourcePink').className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1E1D1A] text-[#FBF9F5] transition cursor-pointer';
        document.getElementById('btnSourceSynth').className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-[#FBF9F5] text-[#5C5852] hover:text-[#1E1D1A] border border-[#DED8CC] transition cursor-pointer';
        updateTransportDurationUi();
        if (state.isPlaying) startAudioPlayback(0);
        renderGeneratedAudioMetadataUi('Generated audio \u00b7 Pink noise');
        showToast('Switched to Calibrated Pink Noise');
      });

      document.getElementById('btnLoadAudioFile').addEventListener('click', () => {
        document.getElementById('audioFileInput').click();
      });

      document.getElementById('audioFileInput').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await loadAudioFile(file);
        e.target.value = ''; // allow re-selecting the same file
      });

      // ---- A-B loop buttons ----
      document.getElementById('btnLoopA').addEventListener('click', () => setLoopPoint('a'));
      document.getElementById('btnLoopB').addEventListener('click', () => setLoopPoint('b'));
      document.getElementById('btnLoopToggle').addEventListener('click', toggleLoop);
      document.getElementById('btnLoopClear').addEventListener('click', clearLoop);

      window.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
        if (e.key === '[') setLoopPoint('a');
        else if (e.key === ']') setLoopPoint('b');
        else if (e.key.toLowerCase() === 'l') toggleLoop();
      });

      // ---- Drag & drop audio anywhere on the page ----
      const AUDIO_EXT_RE = /\.(mp3|wav|flac|ogg|oga|opus|m4a|aac|aif|aiff|weba)$/i;
      const dropOverlay = document.getElementById('audioDropOverlay');
      let dragDepth = 0;

      function dragHasFiles(e) {
        return !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
      }
      function isAudioFile(f) {
        return (f.type && f.type.startsWith('audio/')) || AUDIO_EXT_RE.test(f.name);
      }
      function setDropOverlay(on) {
        dropOverlay.classList.toggle('active', on);
      }

      window.addEventListener('dragenter', (e) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        dragDepth++;
        setDropOverlay(true);
      });
      window.addEventListener('dragover', (e) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault(); // required so the browser allows the drop
        e.dataTransfer.dropEffect = 'copy';
      });
      window.addEventListener('dragleave', (e) => {
        if (!dragHasFiles(e)) return;
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) setDropOverlay(false);
      });
      window.addEventListener('drop', async (e) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault(); // stop the browser from navigating to the dropped file
        dragDepth = 0;
        setDropOverlay(false);
        const file = Array.from(e.dataTransfer.files).find(isAudioFile);
        if (!file) {
          showToast('Drop an audio file (MP3, WAV, FLAC, OGG, M4A, OPUS)');
          return;
        }
        await loadAudioFile(file);
      });

      // Preamp & A/B Toggle
      const AUTO_PREAMP_ON_CLASS = 'px-2.5 py-1 rounded-md text-[14px] font-bold bg-[#1D5B4C] text-[#FFFDF9] cursor-pointer';
      const AUTO_PREAMP_OFF_CLASS = 'px-2.5 py-1 rounded-md text-[14px] font-bold bg-[#E5E0D5] text-[#57534E] cursor-pointer';

      document.getElementById('preampSlider').addEventListener('input', (e) => {
        state.autoPreamp = false;
        state.preampDb = parseFloat(e.target.value);
        document.getElementById('btnAutoPreamp').className = AUTO_PREAMP_OFF_CLASS;
        document.getElementById('preampReadout').textContent = `${state.preampDb > 0 ? '+' : ''}${state.preampDb.toFixed(1)} dB`;
        syncWebAudioBiquadNodes();
      });

      document.getElementById('btnAutoPreamp').addEventListener('click', () => {
        state.autoPreamp = !state.autoPreamp;
        document.getElementById('btnAutoPreamp').className = state.autoPreamp
          ? AUTO_PREAMP_ON_CLASS
          : AUTO_PREAMP_OFF_CLASS;
        syncWebAudioBiquadNodes();
      });

      document.getElementById('btnAbToggle').addEventListener('click', () => {
        state.isEqActive = !state.isEqActive;
        updateAbButtonUi();
        syncWebAudioBiquadNodes();
      });

      window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
        if (e.key.toLowerCase() === 'b') {
          state.isEqActive = !state.isEqActive;
          updateAbButtonUi();
          syncWebAudioBiquadNodes();
        }
      });

      // Built-In IEM Selector & AutoEq Live Search Listeners
      document.getElementById('iemSelect').addEventListener('change', (e) => {
        state.selectedIemKey = e.target.value;
        if (state.selectedIemKey !== 'custom') {
          state.activeAutoEqEntry = null;
          document.getElementById('btnLoadOfficialAutoEqPeq')?.classList.add('hidden');
          const label = e.target.options[e.target.selectedIndex].text;
          document.getElementById('activeIemTitleBadge').textContent = label;
          showToast(
            BUILTIN_IEM_PROFILES[state.selectedIemKey] && state.selectedIemKey !== 'flat_none'
              ? `Selected ${label}. Approximate curve, not a measurement: use AutoEq search for real data.`
              : `Selected ${label}`
          );
        }
        syncWebAudioBiquadNodes();
      });

      document.getElementById('autoEqLiveSearchInput').addEventListener('input', () => {
        renderAutoEqSearchResults();
      });

      document.getElementById('sourceFilterSelect').addEventListener('change', () => {
        renderAutoEqSearchResults();
      });

      document.getElementById('btnLoadOfficialAutoEqPeq').addEventListener('click', () => {
        if (state.activeAutoEqEntry) {
          fetchOfficialAutoEqParametricTxt(state.activeAutoEqEntry);
        }
      });

      // Target Curve, Target Tilt (dB/oct), Bass Shelf (dB), and Normalization
      document.getElementById('targetSelect').addEventListener('change', (e) => {
        state.targetCurveKey = e.target.value;
        const defaults = getTargetDefaults(state.targetCurveKey);
        if (defaults) {
          state.targetTiltDbPerOct = defaults.tilt;
          state.targetBassShelfDb = defaults.bass;
        }
        syncTargetSlidersUi();
        syncWebAudioBiquadNodes();
      });

      document.getElementById('tiltSlider').addEventListener('input', (e) => {
        state.targetTiltDbPerOct = parseFloat(e.target.value);
        syncTargetSlidersUi();
        syncWebAudioBiquadNodes();
      });

      document.getElementById('bassShelfSlider').addEventListener('input', (e) => {
        state.targetBassShelfDb = parseFloat(e.target.value);
        syncTargetSlidersUi();
        syncWebAudioBiquadNodes();
      });

      // Resets tilt & bass shelf to the defaults of whichever target is currently selected
      document.getElementById('btnResetTargetMods').addEventListener('click', () => {
        const defaults = getTargetDefaults(state.targetCurveKey);
        if (!defaults) return;
        state.targetTiltDbPerOct = defaults.tilt;
        state.targetBassShelfDb = defaults.bass;
        syncTargetSlidersUi();
        syncWebAudioBiquadNodes();
        showToast(`Reset tilt (${defaults.tilt} dB/oct) & bass shelf (${defaults.bass} dB) to ${getTargetLabel()} defaults`);
      });

      const NORM_ACTIVE_CLASS = 'px-3 py-1.5 rounded-lg font-mono-num text-[14px] font-bold bg-[#181715] text-[#FFFDF9] cursor-pointer';
      const NORM_INACTIVE_CLASS = 'px-3 py-1.5 rounded-lg font-mono-num text-[14px] font-bold text-[#57534E] hover:text-[#181715] cursor-pointer';

      function setNormalizationFreq(hz) {
        state.normFreqHz = hz;
        document.getElementById('btnNorm500').className = hz === 500 ? NORM_ACTIVE_CLASS : NORM_INACTIVE_CLASS;
        document.getElementById('btnNorm1000').className = hz === 1000 ? NORM_ACTIVE_CLASS : NORM_INACTIVE_CLASS;
        syncWebAudioBiquadNodes();
      }

      document.getElementById('btnNorm500').addEventListener('click', () => setNormalizationFreq(500));
      document.getElementById('btnNorm1000').addEventListener('click', () => setNormalizationFreq(1000));

      document.getElementById('btnAutoEqToTarget').addEventListener('click', runAutoEqSolverToCurrentTarget);

      // Live FFT Controls
      document.getElementById('chkShowFft').addEventListener('change', (e) => {
        state.showLiveFft = e.target.checked;
      });

      document.getElementById('fftGainSlider').addEventListener('input', (e) => {
        state.fftGainOffsetDb = Number(e.target.value);
        document.getElementById('fftGainReadout').textContent = `+${state.fftGainOffsetDb}dB`;
      });

      // Import Custom FR (.txt / .csv)
      document.getElementById('btnImportFrFile').addEventListener('click', () => {
        document.getElementById('frFileInput').click();
      });

      document.getElementById('frFileInput').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const curve = parseMeasurementTextToCurve(text);
        if (!curve) {
          showToast('Could not parse FR file (expected freq, dB rows)');
          return;
        }
        state.customIemCurve = curve;
        state.customIemName = file.name.replace(/\.(txt|csv)$/i, '');
        state.selectedIemKey = 'custom';
        state.activeAutoEqEntry = null;
        document.getElementById('btnLoadOfficialAutoEqPeq')?.classList.add('hidden');

        const sel = document.getElementById('iemSelect');
        let customOpt = sel.querySelector('option[value="custom"]');
        if (!customOpt) {
          customOpt = document.createElement('option');
          customOpt.value = 'custom';
          sel.prepend(customOpt);
        }
        customOpt.textContent = `Imported: ${state.customIemName}`;
        sel.value = 'custom';
        document.getElementById('activeIemTitleBadge').textContent = state.customIemName;
        syncWebAudioBiquadNodes();
        showToast(`Imported FR curve: ${state.customIemName}`);
      });

      // Band Table Action Buttons
      document.getElementById('btnAddBand').addEventListener('click', () => {
        if (state.bands.length >= 10) return;
        const defaultFreqs = [60, 150, 350, 800, 1600, 3000, 4800, 7500, 10500, 14000];
        const newBand = {
          id: `b_${Date.now()}`,
          enabled: true,
          filterType: 'peaking',
          frequency: defaultFreqs[state.bands.length] || 1000,
          gain: 0.0,
          Q: 1.41,
          rationale: 'Manual parametric filter band'
        };
        pushEqHistory();
        state.bands.push(newBand);
        state.selectedBandId = newBand.id;
        syncWebAudioBiquadNodes();
        renderBandsTable();
      });

      document.getElementById('btnInvertBands').addEventListener('click', () => {
        pushEqHistory();
        state.bands.forEach((b) => { b.gain = Number((-b.gain).toFixed(1)); });
        syncWebAudioBiquadNodes();
        renderBandsTable();
        showToast('Inverted all filter gains');
      });

      document.getElementById('btnResetBands').addEventListener('click', () => {
        pushEqHistory();
        state.bands.forEach((b) => { b.gain = 0.0; });
        syncWebAudioBiquadNodes();
        renderBandsTable();
        showToast('Reset all filter gains to 0.0 dB');
      });

      // AI Controller & Quick Prompts
      document.querySelectorAll('.quick-prompt-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.getElementById('aiPromptInput').value = btn.getAttribute('data-prompt');
        });
      });

      document.getElementById('btnRunAiController').addEventListener('click', runAiController);

      document.getElementById('btnUndoAiEq').addEventListener('click', undoEq);

      // Ctrl/Cmd+Z undoes the last EQ change (ignored while typing in a text/number field,
      // where it should keep its normal text-undo meaning).
      window.addEventListener('keydown', (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
        if (e.key.toLowerCase() !== 'z') return;
        const el = document.activeElement;
        const tag = el?.tagName;
        // Sliders and checkboxes keep focus after use, so only real text entry is excluded.
        const typing = tag === 'TEXTAREA' || tag === 'SELECT' ||
          (tag === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type));
        if (typing || state.history.length === 0) return;
        e.preventDefault();
        undoEq();
      });

      // Optional FR Graph Screenshot Upload
      document.getElementById('graphDropzone').addEventListener('click', () => {
        document.getElementById('graphImgInput').click();
      });

      document.getElementById('graphImgInput').addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          state.uploadedGraphDataUrl = ev.target.result;
          const img = document.getElementById('graphPreviewImg');
          img.src = state.uploadedGraphDataUrl;
          img.classList.remove('hidden');
          document.getElementById('graphDropPrompt').classList.add('hidden');
          document.getElementById('btnClearGraphImg').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
      });

      document.getElementById('btnClearGraphImg').addEventListener('click', () => {
        state.uploadedGraphDataUrl = null;
        document.getElementById('graphPreviewImg').classList.add('hidden');
        document.getElementById('graphDropPrompt').classList.remove('hidden');
        document.getElementById('btnClearGraphImg').classList.add('hidden');
      });

      // Export & Import Actions
      function copyTextToClipboard(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }

      document.getElementById('btnCopyApoInline').addEventListener('click', () => {
        copyTextToClipboard(getEqualizerApoString());
        showToast('Copied Equalizer APO config to clipboard');
      });

      document.getElementById('btnDownloadApoInline').addEventListener('click', () => {
        const blob = new Blob([getEqualizerApoString()], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SonaDSP_${state.selectedIemKey}_EQ.txt`;
        a.click();
        URL.revokeObjectURL(url);
      });

      document.getElementById('btnDownloadPowerampInline').addEventListener('click', () => {
        const iemName = state.selectedIemKey === 'custom'
          ? state.customIemName
          : (BUILTIN_IEM_PROFILES[state.selectedIemKey]?.name || 'SonaDSP');
        const { preset, skipped } = buildPowerampPreset(state.bands, state.preampDb, `SonaDSP - ${iemName}`, BAND_COLORS);
        const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SonaDSP_${state.selectedIemKey}_Poweramp.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(
          skipped.length > 0
            ? `Downloaded Poweramp .json. Left out ${skipped.length} band${skipped.length > 1 ? 's' : ''} it can't represent: ${skipped.join(', ')}`
            : 'Downloaded Poweramp Parametric EQ .json'
        );
      });

      // APO Import Modal
      document.getElementById('btnOpenApoModal').addEventListener('click', () => {
        const m = document.getElementById('modalApo');
        m.classList.remove('hidden');
        m.classList.add('flex');
      });

      document.getElementById('btnCloseApoModal').addEventListener('click', () => {
        const m = document.getElementById('modalApo');
        m.classList.add('hidden');
        m.classList.remove('flex');
      });

      document.getElementById('btnApplyApoImport').addEventListener('click', () => {
        const raw = document.getElementById('apoImportTextarea').value;
        const count = applyEqualizerApoTextToState(raw, 'Imported from Equalizer APO');
        if (count > 0) {
          document.getElementById('modalApo').classList.add('hidden');
          document.getElementById('modalApo').classList.remove('flex');
          showToast(`Imported ${count} Equalizer APO bands`);
        } else {
          showToast('No valid Filter lines found in text');
        }
      });

      // AI Config Modal
      document.getElementById('btnOpenAiConfig').addEventListener('click', () => {
        const m = document.getElementById('modalAiConfig');
        m.classList.remove('hidden');
        m.classList.add('flex');
      });

      document.getElementById('btnCloseAiConfig').addEventListener('click', () => {
        const m = document.getElementById('modalAiConfig');
        m.classList.add('hidden');
        m.classList.remove('flex');
      });

      document.getElementById('btnSaveAiConfig').addEventListener('click', () => {
        state.apiEndpoint = document.getElementById('cfgEndpoint').value.trim();
        state.modelId = document.getElementById('cfgModel').value.trim();
        state.apiKey = document.getElementById('cfgApiKey').value.trim();
        state.useFallback = document.getElementById('cfgFallback').checked;
        document.getElementById('modalAiConfig').classList.add('hidden');
        document.getElementById('modalAiConfig').classList.remove('flex');
        showToast('Saved AI Controller configuration');
      });

      // ====================================================================
      // 13. ADVANCED EXPORTS: CONVOLUTION IR (.wav), CAMILLADSP (.yml), DSP JSON
      // All three are rendered from the SAME computeBiquadCoeffs() the graph and the
      // AudioWorklet use, so shelf Q and linear-Q low/high-pass match what you see and hear.
      // (A native OfflineAudioContext + BiquadFilterNode chain would NOT: its shelves ignore Q
      // and its LP/HP read Q in dB.)
      // ====================================================================
      const EXPORT_SAMPLE_RATES = [44100, 48000, 96000];
      let exportSampleRate = 48000;

      // @@export-pure-start
      function exportIrLength(sr) {
        return sr > 48000 ? 32768 : 16384; // ~340 ms: long enough for 20 Hz / low-Q filters to decay
      }

      // Pushes a unit impulse (scaled by the preamp) through every enabled band in series.
      // Returns a minimum-phase IR as Float64Array. Band enabled flags are honoured; the
      // global A/B bypass is deliberately ignored so an export always contains the profile.
      function renderImpulseResponse(bands, preampDb, sr, length) {
        const ir = new Float64Array(length);
        ir[0] = Math.pow(10, preampDb / 20);
        const co = new Float64Array(5);

        bands.forEach((band) => {
          if (!band.enabled) return;
          computeBiquadCoeffs(band.filterType, band.frequency, band.gain, band.Q, sr, false, co);
          const b0 = co[0], b1 = co[1], b2 = co[2], a1 = co[3], a2 = co[4];
          let z1 = 0, z2 = 0;
          for (let n = 0; n < length; n++) {
            const x = ir[n];
            const y = b0 * x + z1;
            z1 = b1 * x - a1 * y + z2;
            z2 = b2 * x - a2 * y;
            ir[n] = y;
          }
        });

        // Short raised-cosine fade on the tail so the truncated IR never clicks.
        const fade = Math.min(1024, length >> 2);
        for (let i = 0; i < fade; i++) {
          ir[length - fade + i] *= 0.5 * (1 + Math.cos(Math.PI * (i + 1) / fade));
        }
        return ir;
      }

      // Mono, 32-bit IEEE float WAV (format tag 3, with the fact chunk non-PCM files should carry).
      // Equalizer APO's Convolution command applies a mono IR to every channel.
      function encodeWavFloat32Mono(samples, sr) {
        const n = samples.length;
        const dataBytes = n * 4;
        const buf = new ArrayBuffer(12 + 26 + 12 + 8 + dataBytes);
        const dv = new DataView(buf);
        let p = 0;
        const str = (s) => { for (let i = 0; i < s.length; i++) dv.setUint8(p++, s.charCodeAt(i)); };
        const u32 = (v) => { dv.setUint32(p, v, true); p += 4; };
        const u16 = (v) => { dv.setUint16(p, v, true); p += 2; };

        str('RIFF'); u32(buf.byteLength - 8); str('WAVE');
        str('fmt '); u32(18);
        u16(3);          // IEEE float
        u16(1);          // channels
        u32(sr);
        u32(sr * 4);     // byte rate
        u16(4);          // block align
        u16(32);         // bits per sample
        u16(0);          // cbSize
        str('fact'); u32(4); u32(n);
        str('data'); u32(dataBytes);
        for (let i = 0; i < n; i++) { dv.setFloat32(p, samples[i], true); p += 4; }
        return buf;
      }

      function fmtNum(v, digits) {
        return String(Number(Number(v).toFixed(digits)));
      }

      function camillaBiquadType(t) {
        return { peaking: 'Peaking', lowshelf: 'Lowshelf', highshelf: 'Highshelf', lowpass: 'Lowpass', highpass: 'Highpass' }[t] || 'Peaking';
      }

      // CamillaDSP v1+ configuration. Filters use Q (not slope/bandwidth) so they match the graph.
      function buildCamillaYaml(bands, preampDb, sr, meta) {
        const active = bands.filter((b) => b.enabled);
        const L = [];
        L.push('# SonaDSP -> CamillaDSP config (CamillaDSP v1.0 or newer)');
        L.push(`# Model: ${meta.model}`);
        L.push(`# Target: ${meta.target}`);
        L.push('# EDIT the capture/playback devices below for your own setup.');
        L.push('');
        L.push('devices:');
        L.push(`  samplerate: ${sr}`);
        L.push('  chunksize: 2048');
        L.push('  capture:');
        L.push('    type: Alsa');
        L.push('    channels: 2');
        L.push('    device: "hw:Loopback,1"   # <- EDIT: your capture device');
        L.push('    format: S32LE');
        L.push('  playback:');
        L.push('    type: Alsa');
        L.push('    channels: 2');
        L.push('    device: "hw:0,0"          # <- EDIT: your DAC / output device');
        L.push('    format: S32LE');
        L.push('');
        L.push('filters:');
        L.push('  sona_preamp:');
        L.push('    type: Gain');
        L.push('    parameters:');
        L.push(`      gain: ${fmtNum(preampDb, 1)}`);
        active.forEach((b, i) => {
          const pass = b.filterType === 'lowpass' || b.filterType === 'highpass';
          L.push(`  sona_eq_${i + 1}:`);
          L.push('    type: Biquad');
          L.push('    parameters:');
          L.push(`      type: ${camillaBiquadType(b.filterType)}`);
          L.push(`      freq: ${fmtNum(b.frequency, 1)}`);
          if (!pass) L.push(`      gain: ${fmtNum(b.gain, 1)}`);
          L.push(`      q: ${fmtNum(b.Q, 3)}`);
        });
        L.push('');
        L.push('pipeline:');
        L.push('  - type: Filter');
        L.push('    channels: [0, 1]');
        L.push('    names:');
        L.push('      - sona_preamp');
        active.forEach((_, i) => L.push(`      - sona_eq_${i + 1}`));
        L.push('');
        return L.join('\n');
      }

      // Structured, tool-agnostic JSON: parameters plus ready-to-use biquad coefficients.
      // Sign convention: y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]  (a0 = 1)
      function buildDspJson(bands, preampDb, sr, meta) {
        const co = new Float64Array(5);
        return {
          format: 'SonaDSP-parametric-eq',
          version: 1,
          model: meta.model,
          target: meta.target,
          sampleRate: sr,
          preampDb: Number(Number(preampDb).toFixed(1)),
          applyTo: 'all-channels',
          coefficientConvention: 'normalized (a0 = 1); y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]',
          bands: bands.map((b, i) => {
            computeBiquadCoeffs(b.filterType, b.frequency, b.gain, b.Q, sr, false, co);
            const pass = b.filterType === 'lowpass' || b.filterType === 'highpass';
            return {
              index: i + 1,
              enabled: !!b.enabled,
              type: b.filterType,
              frequencyHz: Math.round(b.frequency * 10) / 10,
              gainDb: pass ? 0 : Number(Number(b.gain).toFixed(1)),
              q: Number(Number(b.Q).toFixed(3)),
              coefficients: { b0: co[0], b1: co[1], b2: co[2], a1: co[3], a2: co[4] }
            };
          })
        };
      }
      // Poweramp parametric preset. Only peaking / low shelf / high shelf map to a Poweramp band type
      // (3 / 4 / 5). Low-pass and high-pass used to be written out as peaking filters, which is wrong,
      // and disabled bands used to be exported as if they were active. Both are now left out,
      // and `skipped` lists them (e.g. "band 6 (high-pass)", "band 3 (disabled)") for a warning.
      function buildPowerampPreset(bands, preampDb, name, colors) {
        const typeMap = { peaking: 3, lowshelf: 4, highshelf: 5 };
        const skipped = [];
        const out = [];
        bands.forEach((b, idx) => {
          if (!b.enabled) { skipped.push(`band ${idx + 1} (disabled)`); return; }
          const t = typeMap[b.filterType];
          if (t === undefined) {
            skipped.push(`band ${idx + 1} (${b.filterType === 'lowpass' ? 'low-pass' : 'high-pass'})`);
            return;
          }
          out.push({
            type: t,
            channels: 0,
            frequency: Math.round(b.frequency),
            q: Number(Number(b.Q).toFixed(2)),
            gain: Number(Number(b.gain).toFixed(1)),
            color: colors ? colors[idx % colors.length] : undefined
          });
        });
        return {
          preset: [{ name, preamp: preampDb, parametric: true, bands: out }],
          skipped
        };
      }

      // ------------------------------------------------------------------
      // Error score: RMS deviation from target.
      // Every point on the 512-point grid is log-spaced, so a plain mean over the points in
      // the band weights each octave equally. Both curves are already matched at the
      // normalization frequency (500 Hz / 1 kHz), which is what makes the number comparable.
      //   before = RMS(stock - target)
      //   after  = RMS(stock + EQ - target)
      // Returns null when no grid point falls inside the band.
      // Function declaration + default params on purpose: it is called from the telemetry
      // renderer, which can run before this section's consts are initialised.
      // ------------------------------------------------------------------
      function rmsDeviationDb(freqs, stockDb, eqDb, targetDb, loHz = 100, hiHz = 10000) {
        let n = 0, sumBefore = 0, sumAfter = 0;
        for (let i = 0; i < freqs.length; i++) {
          const f = freqs[i];
          if (f < loHz || f > hiHz) continue;
          const eb = stockDb[i] - targetDb[i];
          const ea = eb + eqDb[i];
          sumBefore += eb * eb;
          sumAfter += ea * ea;
          n++;
        }
        if (n === 0) return null;
        return { before: Math.sqrt(sumBefore / n), after: Math.sqrt(sumAfter / n), points: n, loHz, hiHz };
      }

      // Net magnitude response (dB) of the enabled bands at arbitrary frequencies. Same RBJ
      // coefficients and the same |H|^2 expansion as writeBandMagnitudeDb(), with shelf Q honoured
      // (like every other exporter here).
      function bandsResponseDb(bands, freqsHz, sr) {
        const out = new Float64Array(freqsHz.length);
        const co = new Float64Array(5);
        bands.forEach((band) => {
          if (!band.enabled) return;
          computeBiquadCoeffs(band.filterType, band.frequency, band.gain, band.Q, sr, false, co);
          const b0 = co[0], b1 = co[1], b2 = co[2], a1 = co[3], a2 = co[4];
          const n0 = b0 * b0 + b1 * b1 + b2 * b2;
          const n1 = 2 * (b0 * b1 + b1 * b2);
          const n2 = 2 * b0 * b2;
          const d0 = 1 + a1 * a1 + a2 * a2;
          const d1 = 2 * (a1 + a1 * a2);
          const d2 = 2 * a2;
          for (let i = 0; i < freqsHz.length; i++) {
            const w = (2 * Math.PI * freqsHz[i]) / sr;
            const c1 = Math.cos(w), c2 = Math.cos(2 * w);
            const num = n0 + n1 * c1 + n2 * c2;
            const den = d0 + d1 * c1 + d2 * c2;
            out[i] += 10 * Math.log10(Math.max(1e-12, num / Math.max(1e-12, den)));
          }
        });
        return out;
      }

      // Wavelet (Android) only accepts its own fixed 127-frequency GraphicEQ grid, copied verbatim
      // from https://pittvandewitt.github.io/Wavelet/Import/. Its docs warn that adding, changing or
      // removing a frequency makes the file incompatible, so do not "tidy" this list.
      const WAVELET_GRAPHICEQ_FREQS = [
        20, 21, 22, 23, 24, 26, 27, 29, 30, 32, 34, 36, 38, 40, 43, 45, 48, 50, 53, 56, 59, 63, 66, 70, 74, 78,
        83, 87, 92, 97, 103, 109, 115, 121, 128, 136, 143, 151, 160, 169, 178, 188, 199, 210, 222, 235, 248, 262,
        277, 292, 309, 326, 345, 364, 385, 406, 429, 453, 479, 506, 534, 565, 596, 630, 665, 703, 743, 784, 829,
        875, 924, 977, 1032, 1090, 1151, 1216, 1284, 1357, 1433, 1514, 1599, 1689, 1784, 1885, 1991, 2103, 2221,
        2347, 2479, 2618, 2766, 2921, 3086, 3260, 3443, 3637, 3842, 4058, 4287, 4528, 4783, 5052, 5337, 5637, 5955,
        6290, 6644, 7018, 7414, 7831, 8272, 8738, 9230, 9749, 10298, 10878, 11490, 12137, 12821, 13543, 14305,
        15110, 15961, 16860, 17809, 18812, 19871
      ];

      // One "GraphicEQ: f g; f g; ..." line: the parametric profile sampled on Wavelet's grid.
      // The preamp is folded into the gains (the AutoEq convention for GraphicEQ files); Wavelet
      // normalises imported files anyway. Wavelet shows the file name as the profile name.
      function buildWaveletGraphicEq(bands, preampDb, sr) {
        const rate = sr || 48000;
        const resp = bandsResponseDb(bands, WAVELET_GRAPHICEQ_FREQS, rate);
        const parts = WAVELET_GRAPHICEQ_FREQS.map((f, i) => `${f} ${fmtNum(resp[i] + preampDb, 1)}`);
        return `GraphicEQ: ${parts.join('; ')}`;
      }

      // Easy Effects (Linux / PipeWire) output preset: one equalizer#0 plugin in IIR mode.
      // Every band uses the "APO (DR)" mode, which is Easy Effects' Equalizer APO-compatible biquad,
      // so Fc / Gain / Q mean what they mean in the APO export and on the graph. The preamp goes to
      // the equalizer's input-gain. Disabled bands are kept but muted so nothing is lost on a round trip.
      const EASY_EFFECTS_TYPES = { peaking: 'Bell', lowshelf: 'Lo-shelf', highshelf: 'Hi-shelf', lowpass: 'Lo-pass', highpass: 'Hi-pass' };

      function buildEasyEffectsPreset(bands, preampDb) {
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        const makeChannel = () => {
          const ch = {};
          bands.forEach((b, i) => {
            const pass = b.filterType === 'lowpass' || b.filterType === 'highpass';
            ch[`band${i}`] = {
              frequency: Number(clamp(b.frequency, 20, 20000).toFixed(1)),
              gain: pass ? 0 : Number(Number(b.gain).toFixed(2)),
              mode: 'APO (DR)',
              mute: !b.enabled,
              q: Number(clamp(b.Q, 0.1, 18).toFixed(3)),
              slope: 'x1',
              solo: false,
              type: EASY_EFFECTS_TYPES[b.filterType] || 'Bell',
              width: 4.0
            };
          });
          return ch;
        };
        return {
          output: {
            blocklist: [],
            'equalizer#0': {
              balance: 0.0,
              bypass: false,
              'input-gain': Number(Number(preampDb).toFixed(1)),
              left: makeChannel(),
              mode: 'IIR',
              'num-bands': bands.length,
              'output-gain': 0.0,
              'pitch-left': 0.0,
              'pitch-right': 0.0,
              right: makeChannel(),
              'split-channels': false
            },
            plugins_order: ['equalizer#0']
          }
        };
      }
      // @@export-pure-end

      function exportMeta() {
        const model = state.selectedIemKey === 'custom'
          ? state.customIemName
          : (BUILTIN_IEM_PROFILES[state.selectedIemKey]?.name || 'Custom');
        return { model, target: getTargetLabel() };
      }

      function exportFileStem() {
        const m = exportMeta();
        const raw = `SonaDSP_${m.model}`.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        return raw.slice(0, 60) || 'SonaDSP_EQ';
      }

      function downloadBlobFile(data, mime, filename) {
        const blob = new Blob([data], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      function exportConvolutionWav() {
        const sr = exportSampleRate;
        const len = exportIrLength(sr);
        const ir = renderImpulseResponse(state.bands, state.preampDb, sr, len);
        const f32 = new Float32Array(len);
        for (let i = 0; i < len; i++) f32[i] = ir[i];
        const name = `${exportFileStem()}_${sr / 1000}k_IR.wav`;
        downloadBlobFile(encodeWavFloat32Mono(f32, sr), 'audio/wav', name);
        showToast(`Exported ${name} (${(len * 4 / 1024).toFixed(0)} KB, mono 32-bit float)`);
      }

      function exportCamillaYaml() {
        const name = `${exportFileStem()}_CamillaDSP.yml`;
        downloadBlobFile(buildCamillaYaml(state.bands, state.preampDb, exportSampleRate, exportMeta()), 'text/yaml;charset=utf-8', name);
        showToast(`Exported ${name}`);
      }

      function exportDspJson() {
        const name = `${exportFileStem()}_DSP.json`;
        const obj = buildDspJson(state.bands, state.preampDb, exportSampleRate, exportMeta());
        downloadBlobFile(JSON.stringify(obj, null, 2), 'application/json', name);
        showToast(`Exported ${name}`);
      }

      function exportEasyEffectsPreset() {
        const name = `${exportFileStem()}_EasyEffects.json`;
        const obj = buildEasyEffectsPreset(state.bands, state.preampDb);
        downloadBlobFile(JSON.stringify(obj, null, 2), 'application/json', name);
        showToast(`Exported ${name}. In Easy Effects, import it from the Presets menu.`);
      }

      // Wavelet names the imported profile after the file, so keep the name short and readable.
      function exportWaveletGraphicEq() {
        const name = `${exportFileStem()}_Wavelet.txt`;
        downloadBlobFile(buildWaveletGraphicEq(state.bands, state.preampDb, 48000), 'text/plain;charset=utf-8', name);
        showToast(`Exported ${name}. In Wavelet, open AutoEq and use Import.`);
      }

      // The export panel builds itself next to the existing export buttons, so no HTML change is needed.
      function injectAdvancedExportUi() {
        if (document.getElementById('advancedExportPanel')) return;
        const anchor = document.getElementById('btnDownloadPowerampInline')
          || document.getElementById('btnDownloadApoInline');
        const host = anchor ? anchor.parentElement : document.getElementById('apoLivePreview')?.parentElement;
        if (!host) return;

        const btn = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-[#EFEAE1] hover:bg-[#DED8CC] text-[#1E1D1A] border border-[#DED8CC] transition cursor-pointer';
        const panel = document.createElement('div');
        panel.id = 'advancedExportPanel';
        panel.className = 'w-full mt-3 pt-3 border-t border-[#DED8CC] flex flex-wrap items-center gap-2';
        panel.innerHTML = `
          <span class="text-xs font-bold text-[#5C5852] mr-1">Advanced export</span>
          <label class="flex items-center gap-1.5 text-xs font-semibold text-[#5C5852]">
            Sample rate
            <select id="exportSrSelect" class="bg-[#FBF9F5] border border-[#DED8CC] rounded-lg px-2 py-1 text-xs font-bold text-[#1E1D1A]">
              ${EXPORT_SAMPLE_RATES.map((r) => `<option value="${r}" ${r === exportSampleRate ? 'selected' : ''}>${r / 1000} kHz</option>`).join('')}
            </select>
          </label>
          <button type="button" id="btnExportIrWav" class="${btn}" title="Mono 32-bit float impulse response for Equalizer APO, CamillaDSP, Easy Effects and other convolvers">Convolution IR (.wav)</button>
          <button type="button" id="btnExportCamilla" class="${btn}" title="CamillaDSP v1+ config (edit the audio devices)">CamillaDSP (.yml)</button>
          <button type="button" id="btnExportDspJson" class="${btn}" title="Parameters + biquad coefficients as JSON">DSP JSON</button>
          <button type="button" id="btnExportEasyEffects" class="${btn}" title="Easy Effects (Linux / PipeWire) output preset. Import it from the Presets menu.">Easy Effects (.json)</button>
          <button type="button" id="btnExportWavelet" class="${btn}" title="127-band GraphicEQ line for Wavelet on Android (AutoEq tab, Import)">Wavelet GraphicEQ (.txt)</button>
        `;
        host.insertAdjacentElement('afterend', panel);

        document.getElementById('exportSrSelect').addEventListener('change', (e) => {
          exportSampleRate = parseInt(e.target.value, 10) || 48000;
        });
        document.getElementById('btnExportIrWav').addEventListener('click', exportConvolutionWav);
        document.getElementById('btnExportCamilla').addEventListener('click', exportCamillaYaml);
        document.getElementById('btnExportDspJson').addEventListener('click', exportDspJson);
        document.getElementById('btnExportEasyEffects').addEventListener('click', exportEasyEffectsPreset);
        document.getElementById('btnExportWavelet').addEventListener('click', exportWaveletGraphicEq);
      }


      // ====================================================================
      // 14. LOCALSTORAGE PERSISTENCE, NAMED PRESETS & URL HASH SHARING
      // ====================================================================
      const STORAGE_SESSION_KEY = 'sonadsp_session_v1';
      const STORAGE_PRESETS_KEY = 'sonadsp_presets_v1';
      let saveSessionTimer = null;
      let suppressAutoSave = false;

      const SHORT_TO_FILTER = {
        PK: 'peaking',
        LSQ: 'lowshelf',
        HSQ: 'highshelf',
        LP: 'lowpass',
        HP: 'highpass'
      };

      const FILTER_TO_SHORT = {
        peaking: 'PK',
        lowshelf: 'LSQ',
        highshelf: 'HSQ',
        lowpass: 'LP',
        highpass: 'HP'
      };

      // UTF-8 safe Base64URL encoder/decoder (forum-safe: only A-Z, a-z, 0-9, -, _)
      function encodeBase64Url(str) {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      }

      function decodeBase64Url(b64url) {
        const cleaned = b64url.trim().replace(/-/g, '+').replace(/_/g, '/');
        const pad = cleaned.length % 4 === 0 ? '' : '='.repeat(4 - (cleaned.length % 4));
        const bin = atob(cleaned + pad);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
      }

      // ---- Compact URL Hash Serializer / Deserializer ----
      function packStateToHashPayload() {
        const payload = {
          v: 1,
          i: state.selectedIemKey,
          t: state.targetCurveKey,
          tl: Number(state.targetTiltDbPerOct.toFixed(2)),
          bs: Number(state.targetBassShelfDb.toFixed(2)),
          nf: state.normFreqHz,
          pa: Number(state.preampDb.toFixed(1)),
          ap: state.autoPreamp ? 1 : 0,
          eq: state.isEqActive ? 1 : 0,
          b: state.bands.map((b) => [
            b.enabled ? 1 : 0,
            FILTER_TO_SHORT[b.filterType] || 'PK',
            Math.round(b.frequency),
            Number(b.gain.toFixed(1)),
            Number(b.Q.toFixed(2)),
            b.rationale || ''
          ])
        };

        // Include AutoEq GitHub metadata so opening the link auto-fetches the FR curve
        if (state.selectedIemKey === 'custom' && state.activeAutoEqEntry) {
          const e = state.activeAutoEqEntry;
          payload.ae = [e.name, e.relPath, e.source, e.rig];
        } else if (state.selectedIemKey === 'custom' && state.customIemName) {
          payload.cn = state.customIemName;
        }

        return encodeBase64Url(JSON.stringify(payload));
      }

      function unpackHashPayloadToState(encodedStr, pushHistory = false) {
        try {
          const data = JSON.parse(decodeBase64Url(encodedStr));
          if (!data || typeof data !== 'object' || !Array.isArray(data.b)) return false;

          if (pushHistory && state.bands.length > 0) pushEqHistory();
          suppressAutoSave = true;

          if (typeof data.t === 'string') state.targetCurveKey = data.t;
          if (Number.isFinite(data.tl)) state.targetTiltDbPerOct = Math.max(-1.8, Math.min(1.0, Number(data.tl)));
          if (Number.isFinite(data.bs)) state.targetBassShelfDb = Math.max(0, Math.min(12, Number(data.bs)));
          if (data.nf === 500 || data.nf === 1000) state.normFreqHz = data.nf;
          if (Number.isFinite(data.pa)) state.preampDb = Math.max(-15, Math.min(12, Number(data.pa)));
          if (data.ap !== undefined) state.autoPreamp = Boolean(data.ap);
          if (data.eq !== undefined) state.isEqActive = Boolean(data.eq);

          state.bands = data.b.slice(0, EQ_MAX_BANDS).map((Tuple, idx) => {
            const [en, shortType, freq, gain, q, rationale] = Tuple;
            const filterType = SHORT_TO_FILTER[shortType] || 'peaking';
            const isPass = filterType === 'lowpass' || filterType === 'highpass';
            return {
              id: `sh_${idx + 1}_${Date.now()}`,
              enabled: Boolean(en),
              filterType,
              frequency: Math.round(Math.max(20, Math.min(20000, Number(freq) || 1000))),
              gain: isPass ? 0 : Number(Math.max(-BAND_GAIN_LIMIT_DB, Math.min(BAND_GAIN_LIMIT_DB, Number(gain) || 0)).toFixed(1)),
              Q: Number(clampQ(Number(q) || 1.0).toFixed(2)),
              rationale: typeof rationale === 'string' && rationale ? rationale : 'Shared preset band'
            };
          });
          state.selectedBandId = state.bands[0]?.id || 'b1';

          // Restore IEM selection or trigger AutoEq GitHub fetch
          if (data.i === 'custom' && Array.isArray(data.ae) && data.ae.length >= 2) {
            const entry = {
              name: data.ae[0],
              relPath: data.ae[1],
              source: data.ae[2] || 'AutoEq',
              rig: data.ae[3] || 'in-ear'
            };
            state.activeAutoEqEntry = entry;
            state.customIemName = `${entry.name} (${entry.source})`;
            state.selectedIemKey = 'custom';
            // Fetch FR curve asynchronously without overwriting the unpacked bands
            loadModelFromAutoEqGitHub(entry, false, false);
          } else if (typeof data.i === 'string' && BUILTIN_IEM_PROFILES[data.i]) {
            state.selectedIemKey = data.i;
            state.activeAutoEqEntry = null;
          }
          
          syncAllUiControlsFromState();
          suppressAutoSave = false;
          saveSessionNow();
          setSessionStatusBadge('Loaded from Share Link');
          return true;
        } catch (err) {
          suppressAutoSave = false;
          console.warn('SonaDSP: Could not parse URL share hash:', err);
          return false;
        }
      }

      function tryRestoreFromUrlHash(pushHistory = false) {
        const hash = window.location.hash.replace(/^#/, '');
        if (!hash) return false;
        const params = new URLSearchParams(hash);
        const packed = params.get('s') || (hash.startsWith('s=') ? hash.slice(2) : null);
        if (!packed) return false;
        return unpackHashPayloadToState(packed, pushHistory);
      }

      async function copyShareLinkToClipboard() {
        const code = packStateToHashPayload();
        const newHash = `#s=${code}`;
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', newHash);
        } else {
          window.location.hash = newHash;
        }
        const shareUrl = window.location.href;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(shareUrl);
          } else {
            copyTextToClipboard(shareUrl);
          }
        } catch (_) {
          copyTextToClipboard(shareUrl);
        }
        setSessionStatusBadge('Share Link Active');
        showToast('Copied shareable preset link to clipboard!');
      }

      // ---- LocalStorage Session Persistence ----
      function serializeCurveArray(floatArr) {
        if (!floatArr || !floatArr.length) return null;
        const out = new Array(floatArr.length);
        for (let i = 0; i < floatArr.length; i++) {
          out[i] = Number(floatArr[i].toFixed(2));
        }
        return out;
      }

      function buildSessionSnapshot() {
        return {
          v: 1,
          ts: Date.now(),
          selectedIemKey: state.selectedIemKey,
          customIemName: state.customIemName,
          customIemCurve: state.selectedIemKey === 'custom' ? serializeCurveArray(state.customIemCurve) : null,
          activeAutoEqEntry: state.activeAutoEqEntry,
          targetCurveKey: state.targetCurveKey,
          targetCustomName: state.targetCustomName,
          targetCustomCurve: state.targetCurveKey === 'iem:custom' ? serializeCurveArray(state.targetCustomCurve) : null,
          targetTiltDbPerOct: state.targetTiltDbPerOct,
          targetBassShelfDb: state.targetBassShelfDb,
          normFreqHz: state.normFreqHz,
          isEqActive: state.isEqActive,
          preampDb: state.preampDb,
          autoPreamp: state.autoPreamp,
          selectedBandId: state.selectedBandId,
          showLiveFft: state.showLiveFft,
          fftGainOffsetDb: state.fftGainOffsetDb,
          bands: state.bands,
          aiPrompt: document.getElementById('aiPromptInput')?.value || '',
          apiEndpoint: state.apiEndpoint,
          modelId: state.modelId,
          useFallback: state.useFallback
        };
      }

      function saveSessionNow() {
        if (suppressAutoSave) return;
        try {
          localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(buildSessionSnapshot()));
          setSessionStatusBadge('Saved locally');
        } catch (err) {
          console.warn('SonaDSP: Failed to save session to localStorage:', err);
        }
      }

      function scheduleSaveSession() {
        if (suppressAutoSave) return;
        clearTimeout(saveSessionTimer);
        saveSessionTimer = setTimeout(saveSessionNow, 150);
      }

      function applySnapshotToState(snap, pushHistory = false) {
        if (!snap || typeof snap !== 'object') return false;
        if (pushHistory && state.bands.length > 0) pushEqHistory();

        suppressAutoSave = true;

        if (typeof snap.selectedIemKey === 'string') state.selectedIemKey = snap.selectedIemKey;
        if (typeof snap.customIemName === 'string') state.customIemName = snap.customIemName;
        if (Array.isArray(snap.customIemCurve) && snap.customIemCurve.length === NUM_FREQ_POINTS) {
          state.customIemCurve = new Float32Array(snap.customIemCurve);
        }
        state.activeAutoEqEntry = snap.activeAutoEqEntry || null;

        if (typeof snap.targetCurveKey === 'string') state.targetCurveKey = snap.targetCurveKey;
        if (typeof snap.targetCustomName === 'string') state.targetCustomName = snap.targetCustomName;
        if (Array.isArray(snap.targetCustomCurve) && snap.targetCustomCurve.length === NUM_FREQ_POINTS) {
          state.targetCustomCurve = new Float32Array(snap.targetCustomCurve);
        }

        if (Number.isFinite(snap.targetTiltDbPerOct)) state.targetTiltDbPerOct = snap.targetTiltDbPerOct;
        if (Number.isFinite(snap.targetBassShelfDb)) state.targetBassShelfDb = snap.targetBassShelfDb;
        if (snap.normFreqHz === 500 || snap.normFreqHz === 1000) state.normFreqHz = snap.normFreqHz;
        if ( typeof snap.isEqActive === 'boolean') state.isEqActive = snap.isEqActive;
        if (Number.isFinite(snap.preampDb)) state.preampDb = snap.preampDb;
        if (typeof snap.autoPreamp === 'boolean') state.autoPreamp = snap.autoPreamp;
        if (typeof snap.showLiveFft === 'boolean') state.showLiveFft = snap.showLiveFft;
        if (Number.isFinite(snap.fftGainOffsetDb)) state.fftGainOffsetDb = snap.fftGainOffsetDb;

        if (Array.isArray(snap.bands) && snap.bands.length > 0) {
          state.bands = snap.bands.slice(0, EQ_MAX_BANDS).map((b, i) => ({
            id: b.id || `b_${i + 1}_${Date.now()}`,
            enabled: b.enabled !== false,
            filterType: FILTER_TYPES.some((t) => t.value === b.filterType) ? b.filterType : 'peaking',
            frequency: Math.round(Math.max(20, Math.min(20000, Number(b.frequency) || 1000))),
            gain: Number(Math.max(-BAND_GAIN_LIMIT_DB, Math.min(BAND_GAIN_LIMIT_DB, Number(b.gain) || 0)).toFixed(1)),
            Q: Number(clampQ(Number(b.Q) || 1.0).toFixed(2)),
            rationale: b.rationale || ''
          }));
          state.selectedBandId = snap.selectedBandId && state.bands.some((b) => b.id === snap.selectedBandId)
            ? snap.selectedBandId
            : state.bands[0].id;
        }

        if (typeof snap.aiPrompt === 'string') {
          const promptEl = document.getElementById('aiPromptInput');
          if (promptEl) promptEl.value = snap.aiPrompt;
        }
        if (typeof snap.apiEndpoint === 'string' && snap.apiEndpoint) state.apiEndpoint = snap.apiEndpoint;
        if (typeof snap.modelId === 'string' && snap.modelId) state.modelId = snap.modelId;
        if (typeof snap.useFallback === 'boolean') state.useFallback = snap.useFallback;

        suppressAutoSave = false;
        syncAllUiControlsFromState();

        // If custom AutoEq entry was saved without cached curve array, fetch it from GitHub
        if (state.selectedIemKey === 'custom' && !state.customIemCurve && state.activeAutoEqEntry) {
          loadModelFromAutoEqGitHub(state.activeAutoEqEntry, false, false);
        }
        return true;
      }

      function tryRestoreSessionFromLocalStorage() {
        try {
          const raw = localStorage.getItem(STORAGE_SESSION_KEY);
          if (!raw) return false;
          const snap = JSON.parse(raw);
          const ok = applySnapshotToState(snap, false);
          if (ok) setSessionStatusBadge('Restored session');
          return ok;
        } catch (err) {
          console.warn('SonaDSP: Could not restore session from localStorage:', err);
          return false;
        }
      }

      // Synchronizes all DOM dropdowns, sliders, and badges after state is loaded
      function syncAllUiControlsFromState() {
        // 1. IEM Select & Title Badge
        const iemSel = document.getElementById('iemSelect');
        if (iemSel) {
          if (state.selectedIemKey === 'custom') {
            let customOpt = iemSel.querySelector('option[value="custom"]');
            if (!customOpt) {
              customOpt = document.createElement('option');
              customOpt.value = 'custom';
              iemSel.prepend(customOpt);
            }
            const prefix = state.activeAutoEqEntry ? 'AutoEq' : 'Imported';
            customOpt.textContent = `${prefix}: ${state.customIemName || 'Custom IEM'}`;
            iemSel.value = 'custom';
            document.getElementById('activeIemTitleBadge').textContent = state.customIemName || 'Custom IEM';
            document.getElementById('btnLoadOfficialAutoEqPeq')?.classList.toggle('hidden', !state.activeAutoEqEntry);
          } else {
            if (BUILTIN_IEM_PROFILES[state.selectedIemKey]) {
              iemSel.value = state.selectedIemKey;
            } else {
              state.selectedIemKey = 'simgot_em6l';
              iemSel.value = 'simgot_em6l';
            }
            const optText = iemSel.options[iemSel.selectedIndex]?.text || BUILTIN_IEM_PROFILES[state.selectedIemKey].name;
            document.getElementById('activeIemTitleBadge').textContent = optText;
            document.getElementById('btnLoadOfficialAutoEqPeq')?.classList.add('hidden');
          }
        }

        // 2. Target Select & Modifiers
        const targetSel = document.getElementById('targetSelect');
        if (targetSel) {
          if (state.targetCurveKey === 'iem:custom' && state.targetCustomCurve) {
            let opt = targetSel.querySelector('option[value="iem:custom"]');
            if (!opt) {
              opt = document.createElement('option');
              opt.value = 'iem:custom';
              targetSel.prepend(opt);
            }
            opt.textContent = `AutoEq target: ${state.targetCustomName || 'Custom'}`;
          }
          targetSel.value = state.targetCurveKey;
        }
        syncTargetSlidersUi();

        // 3. Normalization Frequency Pills
        document.getElementById('btnNorm500').className = state.normFreqHz === 500 ? NORM_ACTIVE_CLASS : NORM_INACTIVE_CLASS;
        document.getElementById('btnNorm1000').className = state.normFreqHz === 1000 ? NORM_ACTIVE_CLASS : NORM_INACTIVE_CLASS;

        // 4. Preamp & Auto-Preamp
        const preampSlider = document.getElementById('preampSlider');
        const preampReadout = document.getElementById('preampReadout');
        const btnAutoPre = document.getElementById('btnAutoPreamp');
        if (preampSlider) preampSlider.value = state.preampDb;
        if (preampReadout) preampReadout.textContent = `${state.preampDb > 0 ? '+' : ''}${state.preampDb.toFixed(1)} dB`;
        if (btnAutoPre) btnAutoPre.className = state.autoPreamp ? AUTO_PREAMP_ON_CLASS : AUTO_PREAMP_OFF_CLASS;

        // 5. A/B Bypass & Live FFT
        updateAbButtonUi();
        const chkFft = document.getElementById('chkShowFft');
        const fftSlider = document.getElementById('fftGainSlider');
        const fftReadout = document.getElementById('fftGainReadout');
        if (chkFft) chkFft.checked = state.showLiveFft;
        if (fftSlider) fftSlider.value = state.fftGainOffsetDb;
        if (fftReadout) fftReadout.textContent = `+${state.fftGainOffsetDb}dB`;

        // 6. AI Config Modal Fields
        const cfgEnd = document.getElementById('cfgEndpoint');
        const cfgMod = document.getElementById('cfgModel');
        const cfgFall = document.getElementById('cfgFallback');
        if (cfgEnd) cfgEnd.value = state.apiEndpoint;
        if (cfgMod) cfgMod.value = state.modelId;
        if (cfgFall) cfgFall.checked = state.useFallback;

        // 7. Recompute curves, sync DSP nodes & re-render table
        syncWebAudioBiquadNodes();
        renderBandsTable();
      }

      // ---- Named User Presets in LocalStorage ----
      function loadUserPresetsMap() {
        try {
          const raw = localStorage.getItem(STORAGE_PRESETS_KEY);
          return raw ? JSON.parse(raw) : {};
        } catch (_) {
          return {};
        }
      }

      function saveUserPresetsMap(map) {
        try {
          localStorage.setItem(STORAGE_PRESETS_KEY, JSON.stringify(map));
        } catch (err) {
          showToast('Storage quota exceeded while saving preset');
        }
      }

      function defaultSuggestedPresetName() {
        const iemName = state.selectedIemKey === 'custom'
          ? (state.customIemName || 'Custom IEM')
          : (BUILTIN_IEM_PROFILES[state.selectedIemKey]?.name.replace(/\s*\(approx\.\)\s*$/i, '') || 'IEM');
        return `${iemName} — ${getTargetLabel()}`;
      }

      function renderPresetDropdownUi(selectedName = '') {
        const sel = document.getElementById('userPresetSelect');
        const delBtn = document.getElementById('btnDeleteUserPreset');
        if (!sel) return;

        const map = loadUserPresetsMap();
        const names = Object.keys(map).sort((a, b) => (map[b].ts || 0) - (map[a].ts || 0));

        sel.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = names.length > 0 ? `Saved Presets (${names.length})...` : 'No saved presets yet';
        sel.appendChild(placeholder);

        names.forEach((name) => {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          if (name === selectedName) opt.selected = true;
          sel.appendChild(opt);
        });

        if (delBtn) {
          delBtn.disabled = !sel.value;
          delBtn.classList.toggle('opacity-40', !sel.value);
        }
      }

      function setSessionStatusBadge(text) {
        const badge = document.getElementById('sessionStatusBadge');
        if (badge) badge.textContent = text;
      }

      function injectPresetsAndShareUi() {
        if (document.getElementById('sonaPresetToolbar')) return;

        // 1. Add "Share Link" button to Top Studio Header (next to Export / Import APO)
        const apoBtn = document.getElementById('btnOpenApoModal');
        if (apoBtn && apoBtn.parentElement) {
          const shareHeaderBtn = document.createElement('button');
          shareHeaderBtn.id = 'btnCopyShareLinkHeader';
          shareHeaderBtn.type = 'button';
          shareHeaderBtn.title = 'Pack current EQ & IEM state into the URL hash and copy link';
          shareHeaderBtn.className = 'flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FBF9F5] hover:bg-[#EFEAE1] text-[#1E1D1A] border border-[#DED8CC] text-sm font-semibold transition cursor-pointer';
          shareHeaderBtn.innerHTML = `
            <svg class="w-4 h-4 text-[#2E644C]" fill="none" stroke="currentColor" stroke-width="2.1" viewBox="0 0 24 24">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Copy Share Link</span>
          `;
          shareHeaderBtn.addEventListener('click', copyShareLinkToClipboard);
          apoBtn.insertAdjacentElement('beforebegin', shareHeaderBtn);
        }

        // 2. Inject Preset & Session Bar above the Parametric Equalizer Bands Table
        const bandsContainer = document.getElementById('bandsTableContainer');
        if (!bandsContainer) return;

        const bar = document.createElement('div');
        bar.id = 'sonaPresetToolbar';
        bar.className = 'studio-well p-3 flex flex-wrap items-center justify-between gap-2.5';
        bar.innerHTML = `
          <div class="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
            <span class="text-xs font-bold uppercase tracking-wider text-[#5C5852] mr-1">Presets:</span>
            <select id="userPresetSelect" class="bg-[#FBF9F5] border border-[#DED8CC] rounded-xl px-3 py-1.5 text-xs font-bold text-[#1E1D1A] focus:outline-none focus:border-[#C84B31] cursor-pointer max-w-[220px] truncate">
            </select>
            <input
              id="userPresetNameInput"
              type="text"
              placeholder="Preset name (optional)..."
              class="bg-[#FBF9F5] border border-[#DED8CC] rounded-xl px-3 py-1.5 text-xs font-semibold text-[#1E1D1A] placeholder-[#857F75] focus:outline-none focus:border-[#C84B31] w-44 sm:w-52"
            />
            <button id="btnSaveUserPreset" type="button" class="px-3 py-1.5 rounded-xl bg-[#2E644C] hover:bg-[#214B38] text-[#FBF9F5] text-xs font-bold transition cursor-pointer">
              Save Preset
            </button>
            <button id="btnDeleteUserPreset" type="button" disabled class="px-2.5 py-1.5 rounded-xl bg-[#FBF9F5] hover:bg-[#EFEAE1] text-[#5C5852] hover:text-[#C84B31] border border-[#DED8CC] text-xs font-bold transition cursor-pointer opacity-40" title="Delete selected preset">
              Delete
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span id="sessionStatusBadge" class="font-mono-num text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#FBF9F5] text-[#5C5852] border border-[#DED8CC]">
              Auto-Save Ready
            </span>
            <button id="btnCopyShareLinkBar" type="button" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#C84B31] hover:bg-[#AD3B23] text-[#FBF9F5] text-xs font-bold transition cursor-pointer shadow-2xs">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>Copy Share Link</span>
            </button>
          </div>
        `;

        bandsContainer.insertAdjacentElement('beforebegin', bar);
        renderPresetDropdownUi();

        // Event Listeners for Preset Bar
        const presetSel = document.getElementById('userPresetSelect');
        const nameInput = document.getElementById('userPresetNameInput');

        presetSel.addEventListener('change', () => {
          const name = presetSel.value;
          document.getElementById('btnDeleteUserPreset').disabled = !name;
          document.getElementById('btnDeleteUserPreset').classList.toggle('opacity-40', !name);
          if (!name) return;

          const map = loadUserPresetsMap();
          const preset = map[name];
          if (preset && applySnapshotToState(preset, true)) {
            nameInput.value = name;
            saveSessionNow();
            showToast(`Loaded preset: ${name}`);
          }
        });

        document.getElementById('btnSaveUserPreset').addEventListener('click', () => {
          const rawName = nameInput.value.trim() || defaultSuggestedPresetName();
          const map = loadUserPresetsMap();
          map[rawName] = buildSessionSnapshot();
          saveUserPresetsMap(map);
          nameInput.value = rawName;
          renderPresetDropdownUi(rawName);
          showToast(`Saved preset "${rawName}"`);
        });

        nameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('btnSaveUserPreset').click();
          }
        });

        document.getElementById('btnDeleteUserPreset').addEventListener('click', () => {
          const name = presetSel.value;
          if (!name) return;
          const map = loadUserPresetsMap();
          delete map[name];
          saveUserPresetsMap(map);
          if (nameInput.value.trim() === name) nameInput.value = '';
          renderPresetDropdownUi('');
          showToast(`Deleted preset "${name}"`);
        });

        document.getElementById('btnCopyShareLinkBar').addEventListener('click', copyShareLinkToClipboard);

        // Save when AI prompt or FFT controls change
        document.getElementById('aiPromptInput')?.addEventListener('input', scheduleSaveSession);
        document.getElementById('chkShowFft')?.addEventListener('change', scheduleSaveSession);
        document.getElementById('fftGainSlider')?.addEventListener('input', scheduleSaveSession);
        document.getElementById('btnSaveAiConfig')?.addEventListener('click', scheduleSaveSession);

        // Flush pending debounced save on tab close / refresh
        window.addEventListener('beforeunload', () => {
          if (saveSessionTimer) {
            clearTimeout(saveSessionTimer);
            saveSessionNow();
          }
        });

        // Live-update if the user pastes a new #s=... share link into the URL bar
        window.addEventListener('hashchange', () => {
          if (tryRestoreFromUrlHash(true)) {
            showToast('Loaded preset from URL hash');
          }
        });
      }


      // Initial Boot
      window.addEventListener('load', () => {
        injectAdvancedExportUi();
        injectPresetsAndShareUi();
        labelApproximateIemProfiles();
        populateIemTargetOptions();

        // Priority 1: Shared URL hash (#s=...) | Priority 2: Previous localStorage session
        const loadedFromHash = tryRestoreFromUrlHash(false);
        if (!loadedFromHash) {
          tryRestoreSessionFromLocalStorage();
        }

        recomputeAcousticCurves();
        renderBandsTable();
        renderTelemetryMatrix();
        updateApoPreviewUi();
        updateActiveBandPillUi();
        fetchFullAutoEqMasterIndex();
        requestAnimationFrame(renderCanvasLoop);
      });