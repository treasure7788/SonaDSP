(function () {
      'use strict';

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
        previousBands: null,

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
          o.textContent = p.name;
          grp.appendChild(o);
        });
        sel.appendChild(grp);
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
              <div class="text-xs font-bold text-[#1E1D1A] truncate">${item.name}</div>
              <div class="text-[11px] text-[#5C5852] truncate">
                <strong class="text-[#2E644C]">${item.source}</strong> • <span class="font-mono-num">${item.rig}</span>
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

      function computeBandMagnitudeDb(band, freqArray, sampleRate = 48000) {
        const outDb = new Float32Array(freqArray.length);
        if (!band.enabled) return outDb;

        const f0 = Math.max(20, Math.min(sampleRate * 0.49, band.frequency));
        const gainDb = band.gain;
        const Q = Math.max(0.1, Math.min(18.0, band.Q));
        const A = Math.pow(10, gainDb / 40);
        const w0 = (2 * Math.PI * f0) / sampleRate;
        const cosW0 = Math.cos(w0);
        const sinW0 = Math.sin(w0);
        const alpha = sinW0 / (2 * Q);

        let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

        switch (band.filterType) {
          case 'peaking':
            b0 = 1 + alpha * A;
            b1 = -2 * cosW0;
            b2 = 1 - alpha * A;
            a0 = 1 + alpha / A;
            a1 = -2 * cosW0;
            a2 = 1 - alpha / A;
            break;
          case 'lowshelf': {
            const sqrtA = Math.sqrt(A);
            const shelfTerm = (A + 1 / A) * (1 / Q - 1) + 2;
            const alphaS = (sinW0 / 2) * Math.sqrt(Math.max(0.001, shelfTerm));
            b0 = A * ((A + 1) - (A - 1) * cosW0 + 2 * sqrtA * alphaS);
            b1 = 2 * A * ((A - 1) - (A + 1) * cosW0);
            b2 = A * ((A + 1) - (A - 1) * cosW0 - 2 * sqrtA * alphaS);
            a0 = (A + 1) + (A - 1) * cosW0 + 2 * sqrtA * alphaS;
            a1 = -2 * ((A - 1) + (A + 1) * cosW0);
            a2 = (A + 1) + (A - 1) * cosW0 - 2 * sqrtA * alphaS;
            break;
          }
          case 'highshelf': {
            const sqrtA = Math.sqrt(A);
            const shelfTerm = (A + 1 / A) * (1 / Q - 1) + 2;
            const alphaS = (sinW0 / 2) * Math.sqrt(Math.max(0.001, shelfTerm));
            b0 = A * ((A + 1) + (A - 1) * cosW0 + 2 * sqrtA * alphaS);
            b1 = -2 * A * ((A - 1) + (A + 1) * cosW0);
            b2 = A * ((A + 1) + (A - 1) * cosW0 - 2 * sqrtA * alphaS);
            a0 = (A + 1) - (A - 1) * cosW0 + 2 * sqrtA * alphaS;
            a1 = 2 * ((A - 1) - (A + 1) * cosW0);
            a2 = (A + 1) - (A - 1) * cosW0 - 2 * sqrtA * alphaS;
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

        b0 /= a0; b1 /= a0; b2 /= a0;
        a1 /= a0; a2 /= a0;

        for (let i = 0; i < freqArray.length; i++) {
          const w = (2 * Math.PI * freqArray[i]) / sampleRate;
          const cosW = Math.cos(w);
          const cos2W = Math.cos(2 * w);
          const sinW = Math.sin(w);
          const sin2W = Math.sin(2 * w);

          const numR = b0 + b1 * cosW + b2 * cos2W;
          const numI = -b1 * sinW - b2 * sin2W;
          const denR = 1 + a1 * cosW + a2 * cos2W;
          const denI = -a1 * sinW - a2 * sin2W;

          const magSq = (numR * numR + numI * numI) / Math.max(1e-12, denR * denR + denI * denI);
          outDb[i] = 10 * Math.log10(Math.max(1e-8, magSq));
        }
        return outDb;
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
          const bDb = computeBandMagnitudeDb(band, LOG_FREQS, sr);
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
      let preAnalyser = null;
      let postAnalyser = null;
      let startTime = 0;
      let pauseOffset = 0;

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
        }

        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
        return audioCtx;
      }

      function syncWebAudioBiquadNodes() {
        recomputeAcousticCurves();
        updateApoPreviewUi();
        updateActiveBandPillUi();
        renderTelemetryMatrix();

        if (!audioCtx || !preampGainNode || biquadNodePool.length === 0) return;
        const now = audioCtx.currentTime;
        const tau = 0.016;

        const linearPreamp = state.isEqActive ? Math.pow(10, state.preampDb / 20) : 1.0;
        preampGainNode.gain.setTargetAtTime(linearPreamp, now, tau);

        for (let i = 0; i < biquadNodePool.length; i++) {
          const node = biquadNodePool[i];
          const band = state.bands[i];
          if (band && band.enabled && state.isEqActive) {
            if (node.type !== band.filterType) node.type = band.filterType;
            node.frequency.setTargetAtTime(Math.max(20, Math.min(20000, band.frequency)), now, tau);
            node.Q.setTargetAtTime(Math.max(0.1, Math.min(18.0, band.Q)), now, tau);
            node.gain.setTargetAtTime(Math.max(-15, Math.min(15, band.gain)), now, tau);
          } else {
            node.type = 'peaking';
            if (band) {
              node.frequency.setTargetAtTime(Math.max(20, Math.min(20000, band.frequency)), now, tau);
              node.Q.setTargetAtTime(Math.max(0.1, Math.min(18.0, band.Q)), now, tau);
            }
            node.gain.setTargetAtTime(0, now, tau);
          }
        }
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

      function startAudioPlayback(offsetSec = 0) {
        const ctx = ensureAudioEngine();
        if (!audioBuffer) return;

        stopAudioPlayback();
        const src = ctx.createBufferSource();
        src.buffer = audioBuffer;
        src.loop = true;
        src.connect(preAnalyser);

        const safeOffset = offsetSec % audioBuffer.duration;
        src.start(0, safeOffset);
        startTime = ctx.currentTime - safeOffset;
        pauseOffset = safeOffset;
        sourceNode = src;
        state.isPlaying = true;
        updatePlayButtonUi();
      }

      function togglePlayPause() {
        const ctx = ensureAudioEngine();
        if (state.isPlaying) {
          pauseOffset = (ctx.currentTime - startTime) % (audioBuffer ? audioBuffer.duration : 1);
          stopAudioPlayback();
          state.isPlaying = false;
          updatePlayButtonUi();
        } else {
          startAudioPlayback(pauseOffset);
        }
      }

      // ====================================================================
      // 7. AUTOEQ SOLVER & CSV / TXT MEASUREMENT PARSERS
      // ====================================================================
      function computeAutoEqBandsForCurrentIem() {
        recomputeAcousticCurves();

        const anchorDefs = [
          { freq: 68, filterType: 'lowshelf', Q: 0.71, label: 'Sub-bass target shelf alignment' },
          { freq: 205, filterType: 'peaking', Q: 1.30, label: 'Lower-midrange warmth balance' },
          { freq: 640, filterType: 'peaking', Q: 1.40, label: 'Center midrange linearity' },
          { freq: 1850, filterType: 'peaking', Q: 1.50, label: 'Upper-midrange pinna rise' },
          { freq: 3100, filterType: 'peaking', Q: 2.10, label: '3kHz ear-gain target match' },
          { freq: 4700, filterType: 'peaking', Q: 3.00, label: 'Presence & sibilance region control' },
          { freq: 8100, filterType: 'peaking', Q: 3.60, label: 'Mid-treble coupler peak correction' },
          { freq: 12000, filterType: 'highshelf', Q: 0.71, label: 'Upper-treble air alignment' }
        ];

        const fittedBands = [];
        const runningCorrection = new Float32Array(NUM_FREQ_POINTS);

        anchorDefs.forEach((anc, idx) => {
          let bestIdx = 0;
          let minD = Infinity;
          for (let i = 0; i < NUM_FREQ_POINTS; i++) {
            const d = Math.abs(LOG_FREQS[i] - anc.freq);
            if (d < minD) { minD = d; bestIdx = i; }
          }

          const rawError = targetSplArray[bestIdx] - (stockIemSplArray[bestIdx] + runningCorrection[bestIdx]);
          const clampedGain = Number(Math.max(-11.0, Math.min(11.0, rawError * 0.88)).toFixed(1));

          if (Math.abs(clampedGain) >= 0.3 || idx < 5) {
            const newBand = {
              id: `autoeq_${idx + 1}_${Date.now()}`,
              enabled: true,
              filterType: anc.filterType,
              frequency: anc.freq,
              gain: clampedGain,
              Q: anc.Q,
              rationale: anc.label
            };
            fittedBands.push(newBand);

            const bMag = computeBandMagnitudeDb(newBand, LOG_FREQS, 48000);
            for (let i = 0; i < NUM_FREQ_POINTS; i++) {
              runningCorrection[i] += bMag[i];
            }
          }
        });

        return fittedBands.slice(0, 8);
      }

      function runAutoEqSolverToCurrentTarget() {
        state.previousBands = JSON.parse(JSON.stringify(state.bands));
        document.getElementById('btnUndoAiEq')?.classList.remove('hidden');
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
          state.previousBands = JSON.parse(JSON.stringify(state.bands));
          document.getElementById('btnUndoAiEq')?.classList.remove('hidden');
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
          const elapsed = (audioCtx.currentTime - startTime) % (audioBuffer ? audioBuffer.duration : 1);
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
          const bDb = computeBandMagnitudeDb(band, LOG_FREQS, sr);
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
          const newGain = Number(Math.max(-15, Math.min(15, normYToRelDb(normY))).toFixed(1));

          const band = state.bands.find((b) => b.id === draggingBandId);
          if (band) {
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
                  <input type="number" min="-15" max="15" step="0.1" value="${band.gain}" ${isPass ? 'disabled' : ''} class="band-gain-num font-mono-num w-16 bg-[#FBF9F5] border border-[#DED8CC] rounded-md px-1.5 py-0.5 text-right text-sm font-bold text-[#1E1D1A] disabled:opacity-40" />
                </div>
                <input type="range" min="-15" max="15" step="0.1" value="${band.gain}" ${isPass ? 'disabled' : ''} class="band-gain-rng w-full" />
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
            ${band.rationale ? `<div class="mt-2 pt-2 border-t border-[#EFEAE1] text-xs font-medium text-[#5C5852]">${band.rationale}</div>` : ''}
          `;

          row.addEventListener('click', (ev) => {
            if (['INPUT', 'SELECT', 'BUTTON'].includes(ev.target.tagName)) return;
            state.selectedBandId = band.id;
            renderBandsTable();
            updateActiveBandPillUi();
          });

          row.querySelector('.band-enable-chk').addEventListener('change', (ev) => {
            band.enabled = ev.target.checked;
            syncWebAudioBiquadNodes();
            renderBandsTable();
          });

          row.querySelector('.band-type-sel').addEventListener('change', (ev) => {
            band.filterType = ev.target.value;
            if (band.filterType === 'lowpass' || band.filterType === 'highpass') band.gain = 0;
            syncWebAudioBiquadNodes();
            renderBandsTable();
          });

          const fNum = row.querySelector('.band-freq-num');
          const fRng = row.querySelector('.band-freq-rng');
          fNum.addEventListener('input', (ev) => {
            band.frequency = Math.max(20, Math.min(20000, Math.round(Number(ev.target.value) || 20)));
            fRng.value = Math.round(freqToNormX(band.frequency) * 1000);
            syncWebAudioBiquadNodes();
          });
          fRng.addEventListener('input', (ev) => {
            band.frequency = Math.round(normXToFreq(Number(ev.target.value) / 1000));
            fNum.value = band.frequency;
            syncWebAudioBiquadNodes();
          });

          const gNum = row.querySelector('.band-gain-num');
          const gRng = row.querySelector('.band-gain-rng');
          gNum.addEventListener('input', (ev) => {
            band.gain = Math.max(-15, Math.min(15, parseFloat(ev.target.value) || 0));
            gRng.value = band.gain;
            syncWebAudioBiquadNodes();
          });
          gRng.addEventListener('input', (ev) => {
            band.gain = parseFloat(ev.target.value);
            gNum.value = band.gain;
            syncWebAudioBiquadNodes();
          });

          const qNum = row.querySelector('.band-q-num');
          const qRng = row.querySelector('.band-q-rng');
          qNum.addEventListener('input', (ev) => {
            band.Q = Math.max(0.1, Math.min(18.0, parseFloat(ev.target.value) || 0.71));
            qRng.value = band.Q;
            syncWebAudioBiquadNodes();
          });
          qRng.addEventListener('input', (ev) => {
            band.Q = parseFloat(ev.target.value);
            qNum.value = band.Q;
            syncWebAudioBiquadNodes();
          });

          row.querySelector('.band-del-btn').addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (state.bands.length <= 1) return;
            state.bands = state.bands.filter((b) => b.id !== band.id);
            if (state.selectedBandId === band.id) state.selectedBandId = state.bands[0].id;
            syncWebAudioBiquadNodes();
            renderBandsTable();
          });

          container.appendChild(row);
        });
      }

      function renderTelemetryMatrix() {
        const grid = document.getElementById('telemetryGrid');
        const sub = document.getElementById('telemetrySubtitle');
        if (!grid) return;

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
          const baseBands = computeAutoEqBandsForCurrentIem();
          const lower = promptText.toLowerCase();

          if (lower.includes('sub-bass') || lower.includes('warm')) {
            const gainMatch = lower.match(/([+-]?\d+(?:\.\d+)?)\s*db/);
            const boost = gainMatch ? parseFloat(gainMatch[1]) : 2.5;
            if (baseBands[0]) {
              baseBands[0].filterType = 'lowshelf';
              baseBands[0].frequency = 75;
              baseBands[0].gain = Number(Math.max(-12, Math.min(12, baseBands[0].gain + boost * 0.5)).toFixed(1));
              baseBands[0].rationale = 'Warm sub-bass low-shelf foundation';
            }
          }

          if (lower.includes('mud') || lower.includes('bloat') || lower.includes('240') || lower.includes('250')) {
            const mudBand = baseBands.find((b) => b.frequency >= 180 && b.frequency <= 320);
            if (mudBand) {
              mudBand.frequency = 235;
              mudBand.gain = Number(Math.min(-1.8, mudBand.gain - 1.4).toFixed(1));
              mudBand.rationale = 'Clean 235Hz lower-midrange bloat';
            }
          }

          if (lower.includes('sibilan') || lower.includes('glare') || lower.includes('4.5k') || lower.includes('4k') || lower.includes('harsh')) {
            const glareBand = baseBands.find((b) => b.frequency >= 4000 && b.frequency <= 6000);
            if (glareBand) {
              glareBand.frequency = 4550;
              glareBand.gain = Number(Math.min(-3.2, glareBand.gain - 1.8).toFixed(1));
              glareBand.Q = 3.2;
              glareBand.rationale = 'Surgical cut for 4.55kHz upper-midrange sibilance';
            }
          }

          if (lower.includes('vocal') || lower.includes('forward')) {
            const vocBand = baseBands.find((b) => b.frequency >= 1500 && b.frequency <= 2600);
            if (vocBand) {
              vocBand.frequency = 2050;
              vocBand.gain = Number(Math.max(1.8, vocBand.gain + 1.5).toFixed(1));
              vocBand.rationale = 'Forward vocal presence & articulation';
            }
          }

          if (lower.includes('air') || lower.includes('11k')) {
            const airBand = baseBands[baseBands.length - 1];
            if (airBand) {
              airBand.filterType = 'highshelf';
              airBand.frequency = 11200;
              airBand.gain = 2.4;
              airBand.Q = 0.71;
              airBand.rationale = '11.2kHz high-shelf air extension';
            }
          }

          const iemTitle = state.selectedIemKey === 'custom'
            ? state.customIemName
            : (BUILTIN_IEM_PROFILES[state.selectedIemKey]?.name || 'Selected IEM');

          aiResult = {
            acousticAnalysis: `Generated ${baseBands.length}-band profile for ${iemTitle} matched to ${getTargetLabel()} (Tilt: ${state.targetTiltDbPerOct} dB/oct, Bass Shelf: +${state.targetBassShelfDb} dB). Applied prompt shaping: "${promptText}".`,
            bands: baseBands
          };
        }

        if (aiResult && Array.isArray(aiResult.bands)) {
          state.previousBands = JSON.parse(JSON.stringify(state.bands));
          document.getElementById('btnUndoAiEq')?.classList.remove('hidden');

          state.bands = aiResult.bands.slice(0, 10).map((b, i) => ({
            id: `ai_${i + 1}_${Date.now()}`,
            enabled: true,
            filterType: FILTER_TYPES.some((t) => t.value === b.filterType) ? b.filterType : 'peaking',
            frequency: Math.round(Math.max(20, Math.min(20000, Number(b.frequency) || 1000))),
            gain: Number(Math.max(-15, Math.min(15, Number(b.gain) || 0)).toFixed(1)),
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
        state.duration = audioBuffer.duration;
        state.ltasBands = computeBufferLTAS(audioBuffer);
        document.getElementById('audioSourceLabel').textContent = state.fileName;
        document.getElementById('btnSourceSynth').className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1E1D1A] text-[#FBF9F5] transition cursor-pointer';
        document.getElementById('btnSourcePink').className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-[#FBF9F5] text-[#5C5852] hover:text-[#1E1D1A] border border-[#DED8CC] transition cursor-pointer';
        updateTransportDurationUi();
        if (state.isPlaying) startAudioPlayback(0);
        showToast('Switched to Reference Synth Groove');
      });

      document.getElementById('btnSourcePink').addEventListener('click', () => {
        const ctx = ensureAudioEngine();
        audioBuffer = createSynthesizedAudioBuffer(ctx, 'pink');
        state.audioSourceType = 'pink';
        state.fileName = 'Pink Noise (Calibrated)';
        state.duration = audioBuffer.duration;
        state.ltasBands = computeBufferLTAS(audioBuffer);
        document.getElementById('audioSourceLabel').textContent = state.fileName;
        document.getElementById('btnSourcePink').className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1E1D1A] text-[#FBF9F5] transition cursor-pointer';
        document.getElementById('btnSourceSynth').className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-[#FBF9F5] text-[#5C5852] hover:text-[#1E1D1A] border border-[#DED8CC] transition cursor-pointer';
        updateTransportDurationUi();
        if (state.isPlaying) startAudioPlayback(0);
        showToast('Switched to Calibrated Pink Noise');
      });

      document.getElementById('btnLoadAudioFile').addEventListener('click', () => {
        document.getElementById('audioFileInput').click();
      });

      document.getElementById('audioFileInput').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const ctx = ensureAudioEngine();
        try {
          const ab = await file.arrayBuffer();
          const decoded = await ctx.decodeAudioData(ab);
          audioBuffer = decoded;
          state.audioSourceType = 'file';
          state.fileName = file.name;
          state.duration = decoded.duration;
          state.ltasBands = computeBufferLTAS(decoded);
          document.getElementById('audioSourceLabel').textContent = file.name;
          document.getElementById('ltasStatusText').textContent = `LTAS: ${file.name.slice(0, 18)}`;
          updateTransportDurationUi();
          startAudioPlayback(0);
          showToast(`Loaded ${file.name}`);
        } catch (err) {
          showToast(`Audio decode error: ${err.message}`);
        }
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
          showToast(`Selected ${label}`);
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
        state.bands.push(newBand);
        state.selectedBandId = newBand.id;
        syncWebAudioBiquadNodes();
        renderBandsTable();
      });

      document.getElementById('btnInvertBands').addEventListener('click', () => {
        state.bands.forEach((b) => { b.gain = Number((-b.gain).toFixed(1)); });
        syncWebAudioBiquadNodes();
        renderBandsTable();
        showToast('Inverted all filter gains');
      });

      document.getElementById('btnResetBands').addEventListener('click', () => {
        state.previousBands = JSON.parse(JSON.stringify(state.bands));
        document.getElementById('btnUndoAiEq')?.classList.remove('hidden');
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

      document.getElementById('btnUndoAiEq').addEventListener('click', () => {
        if (!state.previousBands) return;
        state.bands = state.previousBands;
        state.previousBands = null;
        document.getElementById('btnUndoAiEq').classList.add('hidden');
        syncWebAudioBiquadNodes();
        renderBandsTable();
        showToast('Restored previous EQ bands');
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
        const powerampPreset = [
          {
            name: `SonaDSP - ${iemName}`,
            preamp: state.preampDb,
            parametric: true,
            bands: state.bands.map((b, idx) => ({
              type: b.filterType === 'lowshelf' ? 4 : (b.filterType === 'highshelf' ? 5 : 3),
              channels: 0,
              frequency: Math.round(b.frequency),
              q: Number(b.Q.toFixed(2)),
              gain: Number(b.gain.toFixed(1)),
              color: BAND_COLORS[idx % BAND_COLORS.length]
            }))
          }
        ];
        const blob = new Blob([JSON.stringify(powerampPreset, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SonaDSP_${state.selectedIemKey}_Poweramp.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Downloaded Poweramp Parametric EQ .json');
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

      // Initial Boot
      window.addEventListener('load', () => {
        populateIemTargetOptions();
        recomputeAcousticCurves();
        renderBandsTable();
        renderTelemetryMatrix();
        updateApoPreviewUi();
        updateActiveBandPillUi();
        fetchFullAutoEqMasterIndex();
        requestAnimationFrame(renderCanvasLoop);
      });
    })();
