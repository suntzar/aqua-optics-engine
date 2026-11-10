window.onload = function () {
    // =========================================================================
    // 1. WEB AUDIO SYNTHESIZER (POOL PLOPS, SPLASHES & CONTINUOUS OCEAN SURF)
    // =========================================================================
    class WaterSoundEngine {
        constructor() {
            this.ctx = null;
            this.enabled = true;
            this.lastRippleSoundTime = 0;
            this.oceanSurfGain = null;
            this.oceanSurfFilter = null;
            this.isOceanAmbientRunning = false;
        }
        init() {
            if (!this.ctx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) this.ctx = new AudioCtx();
            }
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        }
        updateOceanSurf(isOceanMode, waveHeight, time) {
            if (!this.enabled || !isOceanMode) {
                if (this.oceanSurfGain && this.ctx) {
                    this.oceanSurfGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
                }
                return;
            }
            if (!this.ctx) return;
            if (!this.isOceanAmbientRunning) {
                try {
                    const bufLen = this.ctx.sampleRate * 3;
                    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
                    const ch = buf.getChannelData(0);
                    for (let i = 0; i < bufLen; i++) {
                        ch[i] = (Math.random() * 2 - 1) * 0.5;
                    }
                    const src = this.ctx.createBufferSource();
                    src.buffer = buf;
                    src.loop = true;

                    this.oceanSurfFilter = this.ctx.createBiquadFilter();
                    this.oceanSurfFilter.type = 'lowpass';
                    this.oceanSurfFilter.frequency.value = 380;

                    this.oceanSurfGain = this.ctx.createGain();
                    this.oceanSurfGain.gain.value = 0.001;

                    src.connect(this.oceanSurfFilter);
                    this.oceanSurfFilter.connect(this.oceanSurfGain);
                    this.oceanSurfGain.connect(this.ctx.destination);
                    src.start();
                    this.isOceanAmbientRunning = true;
                } catch (e) {}
            }
            if (this.oceanSurfGain && this.oceanSurfFilter) {
                const swellCycle = 0.5 + 0.5 * Math.sin(time * 0.85);
                const targetVol = Math.min(0.11, (0.018 + waveHeight * 0.035) * (0.65 + 0.35 * swellCycle));
                const targetFreq = 240 + swellCycle * 340 + waveHeight * 120;
                this.oceanSurfGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.15);
                this.oceanSurfFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.15);
            }
        }
        playPlop(intensity = 0.6, pitchBase = 280) {
            if (!this.enabled) return;
            const nowMs = performance.now();
            if (nowMs - this.lastRippleSoundTime < 65) return;
            this.lastRippleSoundTime = nowMs;

            try {
                this.init();
                if (!this.ctx) return;
                const now = this.ctx.currentTime;

                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                const startFreq = pitchBase + Math.random() * 140;
                osc.frequency.setValueAtTime(startFreq, now);
                osc.frequency.exponentialRampToValueAtTime(startFreq * 2.15, now + 0.09);

                const vol = Math.min(0.18, Math.max(0.02, intensity * 0.12));
                gain.gain.setValueAtTime(0.001, now);
                gain.gain.linearRampToValueAtTime(vol, now + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now);
                osc.stop(now + 0.12);
            } catch (e) {}
        }
        playSplash(strength = 1.0) {
            if (!this.enabled) return;
            try {
                this.init();
                if (!this.ctx) return;
                const now = this.ctx.currentTime;

                const bufferSize = Math.floor(this.ctx.sampleRate * 0.35);
                const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.12));
                }

                const noise = this.ctx.createBufferSource();
                noise.buffer = buffer;

                const filter = this.ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(650, now);
                filter.frequency.exponentialRampToValueAtTime(1600, now + 0.25);
                filter.Q.value = 1.8;

                const gain = this.ctx.createGain();
                gain.gain.setValueAtTime(Math.min(0.28, strength * 0.2), now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

                noise.connect(filter);
                filter.connect(gain);
                gain.connect(this.ctx.destination);
                noise.start(now);

                this.playPlop(strength, 210);
            } catch (e) {}
        }
    }
    const soundEngine = new WaterSoundEngine();

    // =========================================================================
    // 2. BABYLON.JS ENGINE, ADAPTIVE SCALING, SCENE & CAMERA SETUP
    // =========================================================================
    const canvas = document.getElementById('renderCanvas');
    const engine = new BABYLON.Engine(canvas, true, {
        preserveDrawingBuffer: false,
        stencil: true,
        antialias: true,
        powerPreference: "high-performance"
    });

    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.03, 0.08, 0.16, 1.0);
    scene.skipPointerMovePicking = true;

    // Pool & Ocean Physical Constants (in meters)
    const POOL_HALF_X = 7.0;   // Pool width = 14m
    const POOL_HALF_Z = 5.0;   // Pool length = 10m
    const POOL_DEPTH  = 3.1;   // Pool depth = 3.1m
    const WALL_TOP_Y  = 0.36;  // Coping height above water

    const OCEAN_RADIUS = 220.0; // Radial Clipmap Ocean radius (440m diameter)
    const ISLAND_RADIUS = 16.5; // Tropical Island base radius

    const camera = new BABYLON.ArcRotateCamera(
        "poolCamera",
        -Math.PI * 0.62,
        Math.PI * 0.31,
        15.5,
        new BABYLON.Vector3(0, -0.45, 0),
        scene
    );
    camera.lowerRadiusLimit = 2.2;
    camera.upperRadiusLimit = 145.0;
    camera.lowerBetaLimit = 0.05;
    camera.upperBetaLimit = Math.PI * 0.62;
    camera.wheelPrecision = 18;
    camera.pinchPrecision = 30;
    camera.panningSensibility = 350;
    camera.inertia = 0.86;
    camera.minZ = 0.15;
    camera.maxZ = 520.0;
    camera.attachControl(canvas, true);

    const hemiLight = new BABYLON.HemisphericLight("hemiLight", new BABYLON.Vector3(0, 1, 0), scene);
    hemiLight.intensity = 0.72;
    hemiLight.groundColor = new BABYLON.Color3(0.08, 0.28, 0.42);

    const dirLight = new BABYLON.DirectionalLight("sunLight", new BABYLON.Vector3(-0.45, -0.82, -0.35), scene);
    dirLight.intensity = 1.35;

    // =========================================================================
    // 3. SIMULATION STATE, OCEAN REGIMES, QUALITY TIERS & COMPACT RIPPLE PACKER
    // =========================================================================
    const MAX_RIPPLES = 32;
    const ripplesData = [];
    for (let i = 0; i < MAX_RIPPLES; i++) {
        ripplesData.push({ x: 0, z: 0, startTime: -999.0, amplitude: 0.0 });
    }
    let rippleWriteIndex = 0;

    const QUALITY_PROFILES = {
        low: {
            name: "BAIXO • MOBILE",
            scaling: 1.45,          // ~69% internal resolution
            waveOctaves: 3.0,       // 3 primary Gerstner harmonics
            rttSize: 256,
            rttInterval: 3,         // Refresh refraction every 3rd frame
            poolSubdiv: 72,
            oceanRings: 55,
            oceanSectors: 72,
            analyticDispersion: 0.0
        },
        medium: {
            name: "MÉDIO • EQUILIBRADO",
            scaling: 1.18,          // ~85% internal resolution
            waveOctaves: 5.0,
            rttSize: 512,
            rttInterval: 2,         // Refresh refraction every 2nd frame
            poolSubdiv: 110,
            oceanRings: 85,
            oceanSectors: 108,
            analyticDispersion: 0.0
        },
        high: {
            name: "ALTO • LOD",
            scaling: 1.0,           // 100% native resolution
            waveOctaves: 6.0,
            rttSize: 768,
            rttInterval: 1,
            poolSubdiv: 150,
            oceanRings: 120,
            oceanSectors: 144,
            analyticDispersion: 1.0
        },
        ultra: {
            name: "ULTRA • MÁXIMO",
            scaling: 0.85,          // Supersampled / crisp native
            waveOctaves: 8.0,       // Full 8 Gerstner + capillary harmonics
            rttSize: 1024,
            rttInterval: 1,
            poolSubdiv: 185,
            oceanRings: 155,
            oceanSectors: 180,
            analyticDispersion: 1.0
        }
    };

    const OCEAN_WAVE_REGIMES = {
        calm:    { height: 0.18, choppy: 0.55, speed: 0.70, foam: 0.55, dirSpread: 0.25, swellScale: 0.65 },
        swell:   { height: 0.68, choppy: 1.15, speed: 1.00, foam: 1.10, dirSpread: 0.35, swellScale: 1.00 },
        trade:   { height: 1.05, choppy: 1.55, speed: 1.25, foam: 1.45, dirSpread: 0.65, swellScale: 1.15 },
        cross:   { height: 1.15, choppy: 1.65, speed: 1.15, foam: 1.55, dirSpread: 1.45, swellScale: 1.10 },
        storm:   { height: 1.95, choppy: 2.15, speed: 1.55, foam: 2.10, dirSpread: 0.95, swellScale: 1.60 },
        tsunami: { height: 2.35, choppy: 1.35, speed: 1.80, foam: 1.75, dirSpread: 0.15, swellScale: 2.20 }
    };

    const simState = {
        time: 0,
        sceneMode: 0, // 0 = Pool, 1 = Ocean & Isolated Island
        qualityKey: 'high',
        autoFPS: true,
        waveOctaves: 6.0,
        analyticDispersionFlag: 1.0,
        rttFrameSkip: 1,

        sunElevationDeg: 62,
        sunAzimuthDeg: 38,
        sunDir: new BABYLON.Vector3(0.42, 0.85, 0.31).normalize(),
        sunColor: new BABYLON.Vector3(1.0, 0.97, 0.90),
        skyZenithColor: new BABYLON.Vector3(0.12, 0.42, 0.82),
        skyHorizonColor: new BABYLON.Vector3(0.58, 0.82, 0.96),
        waterShallowColor: new BABYLON.Vector3(0.12, 0.86, 0.88),
        waterDeepColor: new BABYLON.Vector3(0.01, 0.22, 0.48),

        absorptionScale: 1.0,
        causticsIntensity: 1.35,
        ior: 1.333,
        chromaticDispersion: 0.035,

        waveHeight: 0.45,
        waveChoppy: 1.15,
        waveSpeed: 1.0,
        foamIntensity: 1.25,
        sunGlintIntensity: 1.35,
        waveDirSpread: 0.35,
        waveSwellScale: 1.00,

        rippleStrength: 1.15,
        rippleDamping: 0.9,
        underwaterLEDs: 1.0,
        tileStyle: 0.0,
        rainMode: false,
        lastRainTime: 0
    };

    function updateSunVector() {
        const elRad = BABYLON.Tools.ToRadians(simState.sunElevationDeg);
        const azRad = BABYLON.Tools.ToRadians(simState.sunAzimuthDeg);
        const sx = Math.cos(elRad) * Math.cos(azRad);
        const sy = Math.sin(elRad);
        const sz = Math.cos(elRad) * Math.sin(azRad);
        simState.sunDir.set(sx, sy, sz).normalize();
        dirLight.direction.set(-sx, -sy, -sz);
    }
    updateSunVector();

    function spawnRipple(x, z, amplitude = 0.085, playAudio = true) {
        if (simState.sceneMode === 0) {
            if (Math.abs(x) > POOL_HALF_X || Math.abs(z) > POOL_HALF_Z) return;
        } else {
            if (Math.hypot(x, z) > OCEAN_RADIUS * 0.85) return;
        }
        ripplesData[rippleWriteIndex] = {
            x: x,
            z: z,
            startTime: simState.time,
            amplitude: amplitude * simState.rippleStrength
        };
        rippleWriteIndex = (rippleWriteIndex + 1) % MAX_RIPPLES;
        if (playAudio) {
            soundEngine.playPlop(amplitude * 8.0);
        }
    }

    // Pack ONLY currently active ripples at the front of the uniform array
    // so the GLSL shader only iterates `uActiveRippleCount` times (0 iterations when idle)
    const rippleUniformArray = new Float32Array(MAX_RIPPLES * 4);
    let activeRippleCount = 0;

    function syncRippleUniforms() {
        activeRippleCount = 0;
        for (let i = 0; i < MAX_RIPPLES; i++) {
            const r = ripplesData[i];
            const age = simState.time - r.startTime;
            if (age >= 0.0 && age < 6.5 && r.amplitude > 0.001) {
                const idx = activeRippleCount * 4;
                rippleUniformArray[idx + 0] = r.x;
                rippleUniformArray[idx + 1] = r.z;
                rippleUniformArray[idx + 2] = r.startTime;
                rippleUniformArray[idx + 3] = r.amplitude;
                activeRippleCount++;
            }
        }
        return activeRippleCount;
    }

    // =========================================================================
    // 4. PROCEDURAL ISLAND TOPOGRAPHY & CPU WAVE EVALUATOR (POOL & OCEAN)
    // =========================================================================
    function hash2D_CPU(x, z) {
        const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
        return s - Math.floor(s);
    }
    function valueNoiseCPU(x, z) {
        const ix = Math.floor(x), iz = Math.floor(z);
        const fx = x - ix, fz = z - iz;
        const ux = fx * fx * (3.0 - 2.0 * fx);
        const uz = fz * fz * (3.0 - 2.0 * fz);
        const a = hash2D_CPU(ix, iz);
        const b = hash2D_CPU(ix + 1, iz);
        const c = hash2D_CPU(ix, iz + 1);
        const d = hash2D_CPU(ix + 1, iz + 1);
        return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
    }

    function evaluateIslandHeightCPU(x, z) {
        const r = Math.hypot(x, z);
        const angle = Math.atan2(z, x);

        // Modulação costeira orgânica com enseada (baía abrigada) a leste (+X)
        const coveIndent = 0.22 * Math.exp(-Math.pow(angle - 0.08, 2.0) / 0.45);
        const coastlineMod = 1.08 + 0.18 * Math.cos(angle * 2.0 + 0.65) - 0.12 * Math.sin(angle * 3.0 - 0.45) - coveIndent;
        const effR = r / Math.max(0.55, coastlineMod);

        // Ruído fractal de 3 oitavas (sincronizado com o GLSL)
        const n1 = valueNoiseCPU(x * 0.12 + 3.1, z * 0.12 + 7.4);
        const n2 = valueNoiseCPU(x * 0.28 - 5.2, z * 0.28 + 1.9);
        const n3 = valueNoiseCPU(x * 0.62 + 1.7, z * 0.62 - 4.3);
        const fbm = n1 * 0.55 + n2 * 0.30 + n3 * 0.15;
        const ridge = 1.0 - Math.abs(n2 * 2.0 - 1.0);

        // Pico vulcânico principal (Noroeste)
        const dx1 = x + 3.8, dz1 = z - 2.6;
        const dPeak1 = dx1 * dx1 + dz1 * dz1;
        const mainPeak = 8.2 * Math.exp(-dPeak1 / 36.0) * (0.82 + 0.38 * fbm + 0.25 * ridge);

        // Promontório rochoso do Farol (Sudoeste, topo aplainado)
        const dx2 = x + 4.2, dz2 = z + 4.4;
        const dPeak2 = dx2 * dx2 + dz2 * dz2;
        const headlandRaw = 4.5 * Math.exp(-dPeak2 / 28.0);
        const headland = Math.min(3.6, headlandRaw) + 0.25 * (n2 - 0.5) * Math.exp(-dPeak2 / 35.0);

        // Colina secundária (Leste/Sul)
        const dx3 = x - 2.2, dz3 = z + 4.8;
        const eastHill = 2.8 * Math.exp(-(dx3 * dx3 + dz3 * dz3) / 30.0) * (0.85 + 0.3 * n1);

        // Domo de praia e banco de areia raso
        const beachDome = 2.35 * Math.exp(-(effR * effR) / 175.0);

        // Talude oceânico e anel de recife de corais submerso
        const shelfDrop = -10.2 / (1.0 + Math.exp(-(effR - 21.5) * 0.22));
        const reefRingDist = (effR - 18.0) * 0.28;
        const coralReefCrest = (0.85 * fbm + 0.45 * ridge - 0.35) * Math.exp(-(reefRingDist * reefRingDist));

        return Math.max(-11.5, mainPeak + headland + eastHill + beachDome + shelfDrop + coralReefCrest - 1.05);
    }

    function evaluateWaterHeightAndNormalCPU(x, z, t) {
        const wh = simState.waveHeight;
        const ws = simState.waveSpeed * t;
        const isOcean = (simState.sceneMode === 1);
        const scaleFreq = isOcean ? (0.42 / Math.max(0.5, simState.waveSwellScale)) : 1.0;
        const ampScale = isOcean ? (1.85 * simState.waveSwellScale) : 1.0;

        let y = 0.0;
        let dx = 0.0;
        let dz = 0.0;

        if (wh > 0.001) {
            const kx1 = 0.85 * scaleFreq, kz1 = 0.35 * scaleFreq;
            const p1 = x * kx1 + z * kz1 + ws * 2.1;
            const a1 = 0.055 * wh * ampScale;
            y  += Math.sin(p1) * a1;
            dx += Math.cos(p1) * kx1 * a1;
            dz += Math.cos(p1) * kz1 * a1;

            const spread = simState.waveDirSpread;
            const kx2 = (-0.55 * spread - 0.25) * scaleFreq, kz2 = 0.92 * scaleFreq;
            const p2 = x * kx2 + z * kz2 + ws * 1.75;
            const a2 = 0.045 * wh * ampScale;
            y  += Math.sin(p2) * a2;
            dx += Math.cos(p2) * kx2 * a2;
            dz += Math.cos(p2) * kz2 * a2;

            const kx3 = 1.35 * scaleFreq, kz3 = -1.10 * spread * scaleFreq;
            const p3 = x * kx3 + z * kz3 + ws * 2.8;
            const a3 = 0.025 * wh * ampScale;
            y  += Math.sin(p3) * a3;
            dx += Math.cos(p3) * kx3 * a3;
            dz += Math.cos(p3) * kz3 * a3;

            const kx4 = -1.75 * scaleFreq, kz4 = -0.65 * scaleFreq;
            const p4 = x * kx4 + z * kz4 + ws * 3.2;
            const a4 = 0.018 * wh * ampScale;
            y  += Math.cos(p4) * a4;
            dx += -Math.sin(p4) * kx4 * a4;
            dz += -Math.sin(p4) * kz4 * a4;
        }

        const damp = simState.rippleDamping;
        for (let i = 0; i < activeRippleCount; i++) {
            const rx0 = rippleUniformArray[i * 4 + 0];
            const rz0 = rippleUniformArray[i * 4 + 1];
            const rStart = rippleUniformArray[i * 4 + 2];
            const rAmp = rippleUniformArray[i * 4 + 3];
            const age = t - rStart;
            if (age > 0.0 && age < 6.5) {
                const rx = x - rx0;
                const rz = z - rz0;
                const dist = Math.sqrt(rx * rx + rz * rz) + 0.0001;
                const waveFront = age * 3.4;
                const diff = dist - waveFront;
                const env = Math.exp(-age * 0.85 * damp) * Math.exp(-(diff * diff) * 0.85);
                const phase = dist * 7.5 - age * 16.0;
                const s = Math.sin(phase);
                const c = Math.cos(phase);
                const contrib = rAmp * env;
                y += s * contrib;
                const dWave = (c * 7.5 * contrib) / dist;
                dx += rx * dWave;
                dz += rz * dWave;
            }
        }

        const normal = new BABYLON.Vector3(-dx, 1.0, -dz).normalize();
        return { height: y, normal: normal };
    }

    // =========================================================================
    // 5. CUSTOM GLSL SHADERS (WEBGL2 / ES 3.0 PRECISION-SAFE & MOBILE-SAFE)
    // =========================================================================
    // NOTE: Both `uWaveOctaves` and `uActiveRippleCount` are declared as `uniform float`
    // AND `precision highp int;` is set in every stage to prevent WebGL2 linker errors!
    const SHARED_WATER_GLSL = `
        uniform float uTime;
        uniform float uSceneMode;
        uniform float uWaveOctaves;
        uniform float uActiveRippleCount;
        uniform float uWaveHeight;
        uniform float uWaveChoppy;
        uniform float uWaveSpeed;
        uniform float uFoamIntensity;
        uniform float uSunGlintIntensity;
        uniform float uWaveDirSpread;
        uniform float uWaveSwellScale;
        uniform float uRippleDamping;
        uniform float uCausticsIntensity;
        uniform float uUnderwaterLEDs;
        uniform float uTileStyle;
        uniform float uAbsorptionScale;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uWaterShallowColor;
        uniform vec3 uWaterDeepColor;
        uniform vec4 uRipples[32];
        uniform vec4 uFloatingObjects[6];

        float hash21(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }

        vec2 hash22(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.xx + p3.yz) * p3.zy);
        }

        float noise2D(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash21(i);
            float b = hash21(i + vec2(1.0, 0.0));
            float c = hash21(i + vec2(0.0, 1.0));
            float d = hash21(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        // FBM suave de 2 oitavas para modular a espessura dos fios de água com fluidez orgânica
        float smoothWaterFBM(vec2 p) {
            float v = noise2D(p) * 0.65;
            v += noise2D(p * 2.15 + vec2(3.7, -2.4)) * 0.35;
            return v;
        }

        // Gera anéis concêntricos finos e elegantes ao redor das boias e do barco ancorado
        float evaluateObjectWakeFoam(vec2 xz) {
            float wakeRibbon = 0.0;
            float flowNoise = smoothWaterFBM(xz * 2.2 + vec2(uTime * 0.45, -uTime * 0.35));
            float arcMask = smoothstep(0.32, 0.72, flowNoise);

            for (int i = 0; i < 6; i++) {
                vec4 obj = uFloatingObjects[i];
                if (obj.w > 0.01) {
                    float dist = length(xz - obj.xz);
                    float d = dist - obj.w * 0.98;
                    if (d > -0.04 && d < 0.75) {
                        // Dois anéis concêntricos finos que se expandem suavemente ao redor da boia
                        float phase = fract(d * 2.6 - uTime * 0.85);
                        float pulseRing = smoothstep(0.0, 0.14, phase) * (1.0 - smoothstep(0.14, 0.38, phase));
                        float fadeOut = (1.0 - smoothstep(0.05, 0.72, d)) * smoothstep(-0.04, 0.02, d);
                        float contactRim = exp(-d * d * 180.0) * 0.75;
                        wakeRibbon += (contactRim + pulseRing * fadeOut * 1.15) * arcMask;
                    }
                }
            }

            if (uSceneMode > 0.5) {
                vec2 boatRel = xz - vec2(14.6, 2.35);
                float boatEllip = length(boatRel / vec2(1.75, 0.68)) - 1.0;
                if (boatEllip > -0.04 && boatEllip < 0.65) {
                    float bPhase = fract(boatEllip * 2.8 - uTime * 0.75);
                    float bRing = smoothstep(0.0, 0.15, bPhase) * (1.0 - smoothstep(0.15, 0.40, bPhase));
                    float bFade = (1.0 - smoothstep(0.05, 0.62, boatEllip)) * smoothstep(-0.04, 0.02, boatEllip);
                    wakeRibbon += (exp(-boatEllip * boatEllip * 160.0) * 0.7 + bRing * bFade) * arcMask;
                }
            }

            return clamp(wakeRibbon, 0.0, 1.2);
        }

        // Analytical Island & Seabed Heightfield in GLSL (100% Synced with CPU)
        float evaluateIslandBathymetry(vec2 xz) {
            float r = length(xz);
            float angle = atan(xz.y, xz.x);

            float angDiff = angle - 0.08;
            float coveIndent = 0.22 * exp(-(angDiff * angDiff) / 0.45);
            float coastlineMod = 1.08 + 0.18 * cos(angle * 2.0 + 0.65) - 0.12 * sin(angle * 3.0 - 0.45) - coveIndent;
            float effR = r / max(0.55, coastlineMod);

            float n1 = noise2D(xz * 0.12 + vec2(3.1, 7.4));
            float n2 = noise2D(xz * 0.28 + vec2(-5.2, 1.9));
            float n3 = noise2D(xz * 0.62 + vec2(1.7, -4.3));
            float fbm = n1 * 0.55 + n2 * 0.30 + n3 * 0.15;
            float ridge = 1.0 - abs(n2 * 2.0 - 1.0);

            vec2 d1 = xz - vec2(-3.8, 2.6);
            float dPeak1 = dot(d1, d1);
            float mainPeak = 8.2 * exp(-dPeak1 / 36.0) * (0.82 + 0.38 * fbm + 0.25 * ridge);

            vec2 d2 = xz - vec2(-4.2, -4.4);
            float dPeak2 = dot(d2, d2);
            float headlandRaw = 4.5 * exp(-dPeak2 / 28.0);
            float headland = min(3.6, headlandRaw) + 0.25 * (n2 - 0.5) * exp(-dPeak2 / 35.0);

            vec2 d3 = xz - vec2(2.2, -4.8);
            float eastHill = 2.8 * exp(-dot(d3, d3) / 30.0) * (0.85 + 0.3 * n1);

            float beachDome = 2.35 * exp(-(effR * effR) / 175.0);
            float shelfDrop = -10.2 / (1.0 + exp(-(effR - 21.5) * 0.22));
            float reefRingDist = (effR - 18.0) * 0.28;
            float coralReefCrest = (0.85 * fbm + 0.45 * ridge - 0.35) * exp(-(reefRingDist * reefRingDist));

            return max(-11.5, mainPeak + headland + eastHill + beachDome + shelfDrop + coralReefCrest - 1.05);
        }

        // Avalia altura (x), inclinação dH/dx, dH/dz (y, z), Laplaciano (w) + destaque fino de anéis (out)
        vec4 evaluateWaveFieldFull(vec2 xz, out vec2 gerstnerHorizontalXZ, out float rippleCrestOut) {
            gerstnerHorizontalXZ = vec2(0.0);
            rippleCrestOut = 0.0;
            float wh = uWaveHeight;
            float ws = uWaveSpeed * uTime;
            bool isOcean = (uSceneMode > 0.5);

            float freqMult = isOcean ? (0.42 / max(0.45, uWaveSwellScale)) : 1.0;
            float ampMult  = isOcean ? (1.85 * uWaveSwellScale) : 1.0;

            float distFromOrigin = length(xz);
            float horizonAtten = isOcean ? (1.0 / (1.0 + distFromOrigin * 0.0045)) : 1.0;

            float h = 0.0;
            float dx = 0.0;
            float dz = 0.0;
            float laplacian = 0.0;

            if (wh > 0.001) {
                float spread = uWaveDirSpread;
                float chop = uWaveChoppy * (isOcean ? 1.0 : 0.35);

                // Octave 1: Primary Swell
                vec2 d1 = normalize(vec2(0.85, 0.35)) * (0.92 * freqMult);
                float p1 = dot(xz, d1) + ws * 2.1;
                float s1 = sin(p1), c1 = cos(p1);
                float a1 = 0.055 * wh * ampMult * horizonAtten;
                h += s1 * a1;
                dx += c1 * d1.x * a1;
                dz += c1 * d1.y * a1;
                laplacian += -s1 * dot(d1, d1) * a1;
                gerstnerHorizontalXZ -= d1 * (c1 * a1 * chop);

                // Octave 2: Secondary Oblique Wave
                vec2 d2 = normalize(vec2(-0.55 * spread - 0.25, 0.92)) * (1.08 * freqMult);
                float p2 = dot(xz, d2) + ws * 1.75;
                float s2 = sin(p2), c2 = cos(p2);
                float a2 = 0.045 * wh * ampMult * horizonAtten;
                h += s2 * a2;
                dx += c2 * d2.x * a2;
                dz += c2 * d2.y * a2;
                laplacian += -s2 * dot(d2, d2) * a2;
                gerstnerHorizontalXZ -= d2 * (c2 * a2 * chop);

                // Octave 3: Cross-Wave Interference
                vec2 d3 = normalize(vec2(1.35, -1.10 * spread)) * (1.74 * freqMult);
                float p3 = dot(xz, d3) + ws * 2.8;
                float s3 = sin(p3), c3 = cos(p3);
                float a3 = 0.025 * wh * ampMult * horizonAtten;
                h += s3 * a3;
                dx += c3 * d3.x * a3;
                dz += c3 * d3.y * a3;
                laplacian += -s3 * dot(d3, d3) * a3;
                gerstnerHorizontalXZ -= d3 * (c3 * a3 * chop * 0.75);

                // Octave 4 & 5: Medium Chop Harmonics
                if (uWaveOctaves >= 4.5) {
                    vec2 d4 = vec2(-1.75, -0.65) * freqMult;
                    float p4 = dot(xz, d4) + ws * 3.2;
                    float s4 = sin(p4), c4 = cos(p4);
                    float a4 = 0.018 * wh * ampMult * horizonAtten;
                    h += c4 * a4;
                    dx += -s4 * d4.x * a4;
                    dz += -s4 * d4.y * a4;
                    laplacian += -c4 * dot(d4, d4) * a4;

                    vec2 d5 = vec2(2.6, 1.9 * spread) * freqMult;
                    float p5 = dot(xz, d5) - ws * 3.8;
                    float s5 = sin(p5), c5 = cos(p5);
                    float a5 = 0.011 * wh * ampMult * horizonAtten;
                    h += s5 * a5;
                    dx += c5 * d5.x * a5;
                    dz += c5 * d5.y * a5;
                    laplacian += -s5 * dot(d5, d5) * a5;
                }

                // Octave 6 & 7: High-Frequency Capillary Detail
                if (uWaveOctaves >= 5.5) {
                    float p6 = (xz.x * 3.4 + xz.y * 2.7) * freqMult - ws * 4.3;
                    float p7 = (-xz.x * 2.9 + xz.y * 3.8) * freqMult + ws * 3.9;
                    float a6 = 0.0065 * wh * ampMult * horizonAtten;
                    h += (sin(p6) + cos(p7)) * a6;
                    dx += (cos(p6) * 3.4 + sin(p7) * 2.9) * freqMult * a6;
                    dz += (cos(p6) * 2.7 - sin(p7) * 3.8) * freqMult * a6;
                    laplacian += (-sin(p6) * 18.85 - cos(p7) * 22.85) * freqMult * freqMult * a6;
                }

                if (uWaveOctaves >= 7.5) {
                    float p8 = (xz.x * 5.8 - xz.y * 4.9) * freqMult + ws * 5.4;
                    float a8 = 0.0035 * wh * ampMult * horizonAtten;
                    h += sin(p8) * a8;
                    dx += cos(p8) * 5.8 * freqMult * a8;
                    dz += -cos(p8) * 4.9 * freqMult * a8;
                }
            }

            // LOOP ÚNICO DE ONDAS INTERATIVAS: Cria anéis finos e brilhantes no topo exato da onda
            int activeCount = int(uActiveRippleCount + 0.1);
            for (int i = 0; i < 32; i++) {
                if (i >= activeCount) break;
                vec4 rp = uRipples[i];
                float age = uTime - rp.z;
                vec2 delta = xz - rp.xy;
                float maxR = age * 3.4 + 3.2;
                if (abs(delta.x) < maxR && abs(delta.y) < maxR) {
                    float dist = length(delta) + 0.001;
                    float waveFront = age * 3.4;
                    float radialDiff = dist - waveFront;
                    float env = exp(-age * 0.85 * uRippleDamping) * exp(-radialDiff * radialDiff * 0.85);
                    float phase = dist * 7.5 - age * 16.0;
                    float s = sin(phase);
                    float c = cos(phase);
                    float contrib = rp.w * env;
                    h += s * contrib;
                    float dWave = (c * 7.5 * contrib) / dist;
                    dx += delta.x * dWave;
                    dz += delta.y * dWave;
                    laplacian += -s * 42.0 * contrib;

                    // Fio fino apenas no topo da crista de cada anel (pow(max(0, s), 6.0))
                    float sharpCrest = pow(max(0.0, s), 6.0) * exp(-radialDiff * radialDiff * 1.8);
                    float ageAtten = exp(-age * 1.05 * uRippleDamping) * smoothstep(0.0, 0.06, age);
                    rippleCrestOut += sharpCrest * ageAtten * clamp(rp.w * 7.5, 0.0, 1.4);
                }
            }

            return vec4(h, dx, dz, laplacian);
        }

        vec4 evaluateWaveFieldEx(vec2 xz, out vec2 gerstnerHorizontalXZ) {
            float dummyFoam;
            return evaluateWaveFieldFull(xz, gerstnerHorizontalXZ, dummyFoam);
        }

        vec4 evaluateWaveField(vec2 xz) {
            vec2 dummy;
            float dummyFoam;
            return evaluateWaveFieldFull(xz, dummy, dummyFoam);
        }

        // Procedural High-Resolution Ceramic Mosaic Pool Tiles
        vec3 evaluatePoolTiles(vec3 worldPos, vec3 worldNormal) {
            vec2 uv;
            if (abs(worldNormal.y) > 0.5) {
                uv = worldPos.xz;
            } else if (abs(worldNormal.x) > 0.5) {
                uv = worldPos.zy;
            } else {
                uv = worldPos.xy;
            }

            float tileFreq = (uTileStyle > 1.5) ? 4.0 : 9.5;
            vec2 scaledUV = uv * tileFreq;
            vec2 tileID = floor(scaledUV);
            vec2 tileLocal = fract(scaledUV);

            vec2 edgeDist = min(tileLocal, 1.0 - tileLocal);
            float minEdge = min(edgeDist.x, edgeDist.y);
            float groutMask = smoothstep(0.035, 0.085, minEdge);
            float bevelHighlight = smoothstep(0.06, 0.16, minEdge) - smoothstep(0.16, 0.28, minEdge);

            float rnd = hash21(tileID);
            float rnd2 = hash21(tileID + vec2(17.3, 91.7));

            vec3 baseTileCol;
            vec3 groutCol;

            if (uTileStyle < 0.5) {
                vec3 c1 = vec3(0.45, 0.78, 0.94);
                vec3 c2 = vec3(0.24, 0.62, 0.86);
                vec3 c3 = vec3(0.12, 0.44, 0.76);
                baseTileCol = mix(c1, c2, smoothstep(0.15, 0.75, rnd));
                if (rnd2 > 0.84) baseTileCol = mix(baseTileCol, c3, 0.65);
                groutCol = vec3(0.76, 0.88, 0.95);
            } else if (uTileStyle < 1.5) {
                vec3 c1 = vec3(0.22, 0.68, 0.64);
                vec3 c2 = vec3(0.14, 0.52, 0.52);
                vec3 c3 = vec3(0.32, 0.76, 0.70);
                baseTileCol = mix(c1, c2, rnd);
                baseTileCol = mix(baseTileCol, c3, rnd2 * 0.45);
                groutCol = vec3(0.18, 0.36, 0.38);
            } else {
                vec3 c1 = vec3(0.84, 0.93, 0.97);
                vec3 c2 = vec3(0.72, 0.86, 0.93);
                float vein = noise2D(uv * 3.5 + vec2(noise2D(uv * 7.0)));
                baseTileCol = mix(c1, c2, vein);
                groutCol = vec3(0.58, 0.74, 0.84);
            }

            if (abs(worldNormal.y) > 0.5 && uTileStyle < 1.5) {
                if (abs(worldPos.z) < 0.14 || abs(abs(worldPos.z) - 2.5) < 0.12) {
                    if (abs(worldPos.x) < 5.4) {
                        baseTileCol *= vec3(0.32, 0.46, 0.68);
                    }
                }
            }

            if (abs(worldNormal.y) < 0.5 && worldPos.y > -0.22 && worldPos.y < 0.06) {
                float pattern = step(0.5, fract((uv.x + uv.y) * 9.5));
                baseTileCol = mix(vec3(0.08, 0.32, 0.65), vec3(0.58, 0.88, 0.98), pattern * 0.7 + 0.15);
            }

            return mix(groutCol, baseTileCol + bevelHighlight * 0.08, groutMask);
        }

        // Procedural Island Beach Sand, Wet Sand, Coral Reef, Stratified Volcanic Cliffs & Tropical Canopy
        vec3 evaluateIslandTerrainAlbedo(vec3 worldPos, vec3 worldNormal, out float roughnessOut) {
            float h = worldPos.y;
            float upDot = clamp(worldNormal.y, 0.0, 1.0);
            float slope = 1.0 - upDot;

            float nCoarse = noise2D(worldPos.xz * 0.32);
            float nMed    = noise2D(worldPos.xz * 1.35 + vec2(4.2, -1.8));
            float nFine   = noise2D(worldPos.xz * 4.80 + vec2(-2.7, 6.1));
            float fbmDetail = nCoarse * 0.50 + nMed * 0.35 + nFine * 0.15;

            // Ondulações de areia moldadas pelas ondas na praia e lagoa rasa
            float sandRipples = 0.5 + 0.5 * sin(length(worldPos.xz) * 7.5 + nMed * 3.2);
            vec3 drySand = mix(vec3(0.95, 0.88, 0.73), vec3(0.85, 0.76, 0.60), fbmDetail * 0.8 + sandRipples * 0.2);
            vec3 wetSand = drySand * vec3(0.50, 0.45, 0.38);

            // Recife de corais submerso e manchas de calcário/algas marinhas
            float coralPattern = smoothstep(0.38, 0.72, nMed * 0.65 + nFine * 0.35);
            vec3 coralCol = mix(vec3(0.20, 0.52, 0.48), vec3(0.76, 0.52, 0.44), coralPattern);
            vec3 lagoonFloor = mix(drySand * 0.88, coralCol, smoothstep(-0.4, -2.8, h) * (0.45 + 0.55 * nCoarse));

            // Rocha vulcânica basáltica estratificada nas encostas e penhascos
            float strata = 0.5 + 0.5 * sin(h * 5.8 + nMed * 4.0);
            vec3 basaltDark  = vec3(0.19, 0.18, 0.17);
            vec3 basaltLight = vec3(0.38, 0.34, 0.30);
            vec3 cliffRock   = mix(basaltDark, basaltLight, strata * 0.65 + nFine * 0.35);

            // Vegetação tropical exuberante (grama costeira + selva densa no topo)
            vec3 coastalGrass = mix(vec3(0.30, 0.58, 0.18), vec3(0.44, 0.66, 0.24), nFine);
            vec3 deepJungle   = mix(vec3(0.11, 0.36, 0.12), vec3(0.20, 0.46, 0.15), nMed);
            vec3 foliageCol   = mix(coastalGrass, deepJungle, smoothstep(1.6, 5.2, h) * (0.6 + 0.4 * nCoarse));

            // Transição de linha de maré (areia molhada -> areia seca)
            float tideLevel = 0.08 + 0.14 * uWaveHeight;
            float wetMask = 1.0 - smoothstep(-0.20, tideLevel + 0.35, h);
            vec3 col = mix(drySand, wetSand, wetMask);

            // Fundo submerso
            float underwaterMask = 1.0 - smoothstep(-0.35, 0.05, h);
            col = mix(col, lagoonFloor, underwaterMask);

            // Cobertura vegetal acima da faixa de areia (em encostas suaves)
            float vegHeightMask = smoothstep(0.95, 1.85, h);
            float vegSlopeMask  = 1.0 - smoothstep(0.18, 0.46, slope);
            col = mix(col, foliageCol, vegHeightMask * vegSlopeMask);

            // Afloramentos rochosos em encostas íngremes e penhascos
            float rockSlopeMask = smoothstep(0.22, 0.52, slope) * smoothstep(-0.8, 0.6, h);
            float summitRockMask = smoothstep(6.2, 8.2, h) * 0.65;
            col = mix(col, cliffRock, clamp(rockSlopeMask + summitRockMask, 0.0, 1.0));

            roughnessOut = mix(0.86, 0.10, wetMask * smoothstep(-0.45, 0.25, h));
            return col;
        }

        // Real-Time Wave-Focused Optical Caustics Network
        float computeCausticsPattern(vec2 p, float t) {
            mat2 m = mat2(0.80, -0.60, 0.60, 0.80);
            vec2 uv1 = p * 1.45 + vec2(t * 0.32, -t * 0.24);
            vec2 uv2 = (m * p) * 1.55 + vec2(-t * 0.28, t * 0.36);

            float v1 = abs(sin(uv1.x * 3.1 + cos(uv1.y * 2.7 + t * 1.4)) + cos(uv1.y * 3.3 - sin(uv1.x * 2.9 - t * 1.2)));
            float v2 = abs(sin(uv2.x * 3.4 - cos(uv2.y * 3.1 - t * 1.5)) + cos(uv2.y * 2.8 + sin(uv2.x * 3.2 + t * 1.1)));

            float b1 = clamp(1.0 - abs(v1 - 0.85), 0.0, 1.0);
            float b2 = clamp(1.0 - abs(v2 - 0.85), 0.0, 1.0);
            float ridge1 = b1 * b1 * b1 * b1 * b1;
            float ridge2 = b2 * b2 * b2 * b2 * b2;

            return (ridge1 + ridge2) * 0.85;
        }

        // Full Underwater & Above-Water Illumination (Pool & Island Terrain)
        vec3 evaluateUnderwaterPointLighting(vec3 worldPos, vec3 worldNormal, vec3 baseAlbedo) {
            // Iluminação atmosférica limpa e opaca para a parte seca da ilha
            if (uSceneMode > 0.5 && worldPos.y > 0.04) {
                float ndotl = max(0.0, dot(worldNormal, uSunDir));
                float hemiFactor = 0.5 + 0.5 * worldNormal.y;
                vec3 ambientSky = mix(vec3(0.16, 0.22, 0.20), vec3(0.32, 0.44, 0.58), hemiFactor);
                float valleyAO = smoothstep(-0.5, 2.8, worldPos.y) * 0.22 + 0.78;
                vec3 litIsland = baseAlbedo * (uSunColor * (ndotl * 0.92 + 0.12) + ambientSky) * valleyAO;
                return litIsland;
            }

            vec3 refractedSun = refract(-uSunDir, vec3(0.0, 1.0, 0.0), 0.75);
            refractedSun = normalize(refractedSun);

            float depthBelowWater = max(0.0, -worldPos.y);
            vec2 surfaceHitXZ = worldPos.xz - refractedSun.xz * (depthBelowWater / max(0.2, -refractedSun.y));

            vec4 waveAtSurface = evaluateWaveField(surfaceHitXZ);
            vec2 waveSlope = waveAtSurface.yz;
            float waveLaplacian = waveAtSurface.w;

            vec2 refractedCausticPos = surfaceHitXZ + waveSlope * (depthBelowWater * 1.65);

            float lensFocusing = clamp(1.0 - waveLaplacian * depthBelowWater * 0.85, 0.15, 3.6);
            float baseCaustic = computeCausticsPattern(refractedCausticPos, uTime * uWaveSpeed);
            float rippleCausticBoost = clamp(-waveLaplacian * 1.35, 0.0, 2.2);

            float depthCausticFade = exp(-depthBelowWater * 0.22);
            float totalCaustics = (baseCaustic * lensFocusing + rippleCausticBoost) * uCausticsIntensity * depthCausticFade;
            float submergedMask = 1.0 - smoothstep(-0.08, 0.05, worldPos.y);
            totalCaustics *= submergedMask;

            float wallShadow = 1.0;
            if (uSceneMode < 0.5) {
                if (abs(surfaceHitXZ.x) > 7.05 || abs(surfaceHitXZ.y) > 5.05) {
                    wallShadow = (1.0 - smoothstep(6.85, 7.45, abs(surfaceHitXZ.x))) *
                                 (1.0 - smoothstep(4.85, 5.45, abs(surfaceHitXZ.y)));
                }
            }

            float objectShadow = 1.0;
            for (int i = 0; i < 6; i++) {
                vec4 obj = uFloatingObjects[i];
                if (obj.w > 0.01) {
                    float dObj = length(surfaceHitXZ - obj.xz);
                    float sMask = smoothstep(obj.w * 0.40, obj.w * 1.30, dObj);
                    objectShadow *= mix(0.28, 1.0, sMask);
                }
            }

            vec3 lightDir = (worldPos.y < 0.0) ? -refractedSun : uSunDir;
            float ndotl = max(0.20, dot(worldNormal, lightDir));
            vec3 directLight = uSunColor * (ndotl * 0.88 + totalCaustics * 0.95) * wallShadow * objectShadow;

            vec3 ledLightContrib = vec3(0.0);
            if (uUnderwaterLEDs > 0.01 && worldPos.y < 0.35) {
                vec3 ledColor = vec3(0.18, 0.88, 1.0) * uUnderwaterLEDs;
                if (uSceneMode < 0.5) {
                    for (int s = 0; s < 2; s++) {
                        float zPos = (s == 0) ? -2.4 : 2.4;
                        vec3 lPos1 = vec3(-6.95, -1.65, zPos);
                        vec3 toP1 = worldPos - lPos1;
                        float dist1 = length(toP1) + 0.1;
                        float spot1 = max(0.0001, dot(normalize(toP1), vec3(0.95, -0.25, 0.0)));
                        ledLightContrib += ledColor * pow(spot1, 2.2) * (4.5 / (1.0 + dist1 * dist1 * 0.32));

                        vec3 lPos2 = vec3(6.95, -1.65, zPos);
                        vec3 toP2 = worldPos - lPos2;
                        float dist2 = length(toP2) + 0.1;
                        float spot2 = max(0.0001, dot(normalize(toP2), vec3(-0.95, -0.25, 0.0)));
                        ledLightContrib += ledColor * pow(spot2, 2.2) * (4.5 / (1.0 + dist2 * dist2 * 0.32));
                    }
                } else {
                    // Iluminação subaquática suave na lagoa do píer
                    vec2 lagoonLamp = vec2(15.0, 0.0);
                    float rDist = length(worldPos.xz - lagoonLamp);
                    ledLightContrib += ledColor * (2.6 / (1.0 + rDist * rDist * 0.18)) * (1.0 - smoothstep(-0.3, 0.1, worldPos.y));
                }
            }

            vec3 litColor = baseAlbedo * (directLight + vec3(0.15, 0.27, 0.39) + ledLightContrib);

            if (worldPos.y < 0.0) {
                vec3 sigma = vec3(0.24, 0.055, 0.022) * uAbsorptionScale;
                vec3 sunPathAtten = exp(-sigma * depthBelowWater * 0.65);
                litColor *= mix(vec3(1.0), sunPathAtten * 1.15, 0.55);
            }

            return litColor;
        }
    `;

    // -------------------------------------------------------------------------
    // SHADER 0: ATMOSPHERIC SKY DOME SHADER
    // -------------------------------------------------------------------------
    BABYLON.Effect.ShadersStore["skyDomeVertexShader"] = `
        precision highp float;
        precision highp int;
        attribute vec3 position;
        uniform mat4 world;
        uniform mat4 viewProjection;
        varying vec3 vWorldPos;
        void main() {
            vec4 wp = world * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = viewProjection * wp;
        }
    `;

    BABYLON.Effect.ShadersStore["skyDomeFragmentShader"] = `
        precision highp float;
        precision highp int;
        varying vec3 vWorldPos;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uSkyZenithColor;
        uniform vec3 uSkyHorizonColor;
        void main() {
            vec3 dir = normalize(vWorldPos);
            float y = clamp(dir.y, 0.0001, 1.0);
            vec3 sky = mix(uSkyHorizonColor, uSkyZenithColor, pow(y, 0.55));
            float sunCos = max(0.0001, dot(dir, uSunDir));
            sky += uSunColor * pow(sunCos, 24.0) * 0.35;
            sky += uSunColor * smoothstep(0.9982, 0.9996, sunCos) * 2.5;
            if (dir.y < 0.0) {
                sky = mix(uSkyHorizonColor * 0.65, vec3(0.02, 0.09, 0.19), clamp(-dir.y * 5.0, 0.0, 1.0));
            }
            gl_FragColor = vec4(sky, 1.0);
        }
    `;

    // -------------------------------------------------------------------------
    // SHADER 1: POOL INTERIOR & ISLAND TERRAIN CAUSTICS SHADER
    // -------------------------------------------------------------------------
    BABYLON.Effect.ShadersStore["poolInteriorVertexShader"] = `
        precision highp float;
        precision highp int;
        attribute vec3 position;
        attribute vec3 normal;
        attribute vec2 uv;

        uniform mat4 world;
        uniform mat4 viewProjection;

        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying vec2 vUV;

        void main() {
            vec4 wp = world * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            vWorldNormal = normalize((world * vec4(normal, 0.0)).xyz);
            vUV = uv;
            gl_Position = viewProjection * wp;
        }
    `;

    BABYLON.Effect.ShadersStore["poolInteriorFragmentShader"] = `
        precision highp float;
        precision highp int;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying vec2 vUV;

        uniform vec3 uCameraPos;
        ${SHARED_WATER_GLSL}

        void main() {
            vec3 n = normalize(vWorldNormal);
            vec3 color;

            if (uSceneMode < 0.5) {
                vec3 tileAlbedo = evaluatePoolTiles(vWorldPos, n);
                color = evaluateUnderwaterPointLighting(vWorldPos, n, tileAlbedo);

                float cornerX = smoothstep(0.0, 0.55, 7.0 - abs(vWorldPos.x));
                float cornerZ = smoothstep(0.0, 0.55, 5.0 - abs(vWorldPos.z));
                float cornerY = smoothstep(0.0, 0.45, vWorldPos.y + 3.1);
                float ao = 0.72 + 0.28 * (cornerX * cornerZ * cornerY);
                color *= ao;
            } else {
                float rough;
                vec3 islandAlbedo = evaluateIslandTerrainAlbedo(vWorldPos, n, rough);
                color = evaluateUnderwaterPointLighting(vWorldPos, n, islandAlbedo);

                if (vWorldPos.y > -0.15 && vWorldPos.y < 0.48) {
                    vec3 viewDir = normalize(uCameraPos - vWorldPos);
                    vec3 halfVec = normalize(uSunDir + viewDir);
                    float wetSpec = pow(max(0.0001, dot(n, halfVec)), 48.0) * (1.0 - rough) * 0.55;
                    color += uSunColor * wetSpec;
                }
            }

            gl_FragColor = vec4(color, 1.0);
        }
    `;

    // -------------------------------------------------------------------------
    // SHADER 2: SUBMERGED / FLOATING OBJECTS SHADER
    // -------------------------------------------------------------------------
    BABYLON.Effect.ShadersStore["buoyantObjectVertexShader"] = `
        precision highp float;
        precision highp int;
        attribute vec3 position;
        attribute vec3 normal;
        attribute vec2 uv;

        uniform mat4 world;
        uniform mat4 viewProjection;

        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying vec3 vLocalPos;
        varying vec2 vUV;

        void main() {
            vec4 wp = world * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            vWorldNormal = normalize((world * vec4(normal, 0.0)).xyz);
            vLocalPos = position;
            vUV = uv;
            gl_Position = viewProjection * wp;
        }
    `;

    BABYLON.Effect.ShadersStore["buoyantObjectFragmentShader"] = `
        precision highp float;
        precision highp int;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying vec3 vLocalPos;
        varying vec2 vUV;

        uniform vec3 uCameraPos;
        uniform vec3 uObjectColor1;
        uniform vec3 uObjectColor2;
        uniform float uObjectPattern;

        ${SHARED_WATER_GLSL}

        void main() {
            vec3 n = normalize(vWorldNormal);
            vec3 albedo = uObjectColor1;

            if (uObjectPattern < 0.5) {
                float angle = atan(vLocalPos.z, vLocalPos.x);
                float sector = floor( mod(angle + 3.14159265, 6.2831853) / (6.2831853 / 6.0) );
                if (mod(sector, 2.0) < 0.5) {
                    albedo = vec3(0.98, 0.98, 0.99);
                } else if (sector < 1.5) {
                    albedo = vec3(0.96, 0.22, 0.30);
                } else if (sector < 3.5) {
                    albedo = vec3(0.98, 0.78, 0.12);
                } else {
                    albedo = vec3(0.08, 0.68, 0.96);
                }
                if (length(vLocalPos.xz) < 0.14 * length(vLocalPos)) {
                    albedo = vec3(0.98);
                }
            } else if (uObjectPattern < 1.5) {
                float angle = atan(vLocalPos.z, vLocalPos.x);
                float stripe = step(0.0, sin(angle * 6.0));
                albedo = mix(uObjectColor1, uObjectColor2, stripe);
            } else {
                albedo = mix(uObjectColor1, uObjectColor2, smoothstep(-0.4, 0.4, vLocalPos.y));
            }

            vec3 lit = evaluateUnderwaterPointLighting(vWorldPos, n, albedo);

            vec3 viewDir = normalize(uCameraPos - vWorldPos);
            vec3 halfVec = normalize(uSunDir + viewDir);
            float spec = pow(max(0.0001, dot(n, halfVec)), 64.0) * 0.65;
            float rimBase = clamp(1.0 - max(0.0, dot(n, viewDir)), 0.0, 1.0);
            float rim = (rimBase * rimBase * rimBase) * 0.22;

            vec3 finalCol = lit + uSunColor * spec + vec3(0.4, 0.85, 1.0) * rim;
            gl_FragColor = vec4(finalCol, 1.0);
        }
    `;

    // -------------------------------------------------------------------------
    // SHADER 3: UNIFIED POOL & OCEAN WATER SURFACE SHADER (GERSTNER + FOAM + SNELL)
    // -------------------------------------------------------------------------
    BABYLON.Effect.ShadersStore["waterSurfaceVertexShader"] = `
        precision highp float;
        precision highp int;
        attribute vec3 position;
        attribute vec2 uv;

        uniform mat4 world;
        uniform mat4 viewProjection;

        ${SHARED_WATER_GLSL}

        varying vec3 vWorldPos;
        varying vec2 vUV;
        varying vec4 vClipPos;
        varying float vWaveElevation;
        varying float vShoreDepth;

        void main() {
            vec4 wp = world * vec4(position, 1.0);
            vec2 horizDisp;
            vec4 wave = evaluateWaveFieldEx(wp.xz, horizDisp);

            float edgeMask = 1.0;
            float shoreDepth = 3.1;

            if (uSceneMode < 0.5) {
                float wallDampX = smoothstep(0.0, 0.35, 7.0 - abs(wp.x));
                float wallDampZ = smoothstep(0.0, 0.35, 5.0 - abs(wp.z));
                edgeMask = wallDampX * wallDampZ;
            } else {
                float terrainH = evaluateIslandBathymetry(wp.xz);
                shoreDepth = max(0.0, -terrainH);
                float beachDamp = smoothstep(-0.25, 1.4, shoreDepth);
                edgeMask = beachDamp;
                wp.xz += horizDisp * beachDamp;
            }

            wp.y += wave.x * edgeMask;
            vWaveElevation = wave.x * edgeMask;
            vShoreDepth = shoreDepth;
            vWorldPos = wp.xyz;
            vUV = uv;
            vClipPos = viewProjection * wp;
            gl_Position = vClipPos;
        }
    `;

    BABYLON.Effect.ShadersStore["waterSurfaceFragmentShader"] = `
        precision highp float;
        precision highp int;
        varying vec3 vWorldPos;
        varying vec2 vUV;
        varying vec4 vClipPos;
        varying float vWaveElevation;
        varying float vShoreDepth;

        uniform vec3 uCameraPos;
        uniform float uIOR;
        uniform float uChromaticDispersion;
        uniform float uAnalyticDispersionFlag;
        uniform vec3 uSkyZenithColor;
        uniform vec3 uSkyHorizonColor;
        uniform sampler2D uRefractionSampler;
        uniform sampler2D uFoamSampler;

        ${SHARED_WATER_GLSL}

        float intersectPoolBox(vec3 ro, vec3 rd, out vec3 hitNormal) {
            vec3 boxMin = vec3(-7.0, -3.1, -5.0);
            vec3 boxMax = vec3( 7.0,  0.5,  5.0);
            vec3 invDir = 1.0 / (rd + vec3(1e-6));
            vec3 tbot = invDir * (boxMin - ro);
            vec3 ttop = invDir * (boxMax - ro);
            vec3 tmax = max(ttop, tbot);
            float t = min(min(tmax.x, tmax.y), tmax.z);
            vec3 hitPos = ro + rd * t;

            if (abs(hitPos.y - boxMin.y) < 0.02) hitNormal = vec3(0.0, 1.0, 0.0);
            else if (abs(hitPos.x - boxMin.x) < 0.02) hitNormal = vec3(1.0, 0.0, 0.0);
            else if (abs(hitPos.x - boxMax.x) < 0.02) hitNormal = vec3(-1.0, 0.0, 0.0);
            else if (abs(hitPos.z - boxMin.z) < 0.02) hitNormal = vec3(0.0, 0.0, 1.0);
            else hitNormal = vec3(0.0, 0.0, -1.0);

            return max(0.05, t);
        }

        vec3 evaluateSkyReflection(vec3 reflDir) {
            float y = clamp(reflDir.y, 0.0001, 1.0);
            vec3 sky = mix(uSkyHorizonColor, uSkyZenithColor, pow(y, 0.55));

            vec2 cloudUV = reflDir.xz / (reflDir.y + 0.25) * 0.45 + vec2(uTime * 0.012, 0.0);
            float cl = noise2D(cloudUV * 2.5) * 0.6 + noise2D(cloudUV * 5.5) * 0.4;
            sky = mix(sky, uSunColor * 0.95, smoothstep(0.55, 0.85, cl) * 0.28 * smoothstep(0.0, 0.3, y));

            float sunCos = max(0.0001, dot(reflDir, uSunDir));
            sky += uSunColor * pow(sunCos, 16.0) * 0.45;
            sky += uSunColor * pow(sunCos, 512.0) * 3.5;
            return sky;
        }

        float distributionGGX(vec3 N, vec3 H, float roughness) {
            float a = roughness * roughness;
            float a2 = a * a;
            float NdotH = max(0.0, dot(N, H));
            float NdotH2 = NdotH * NdotH;
            float denom = (NdotH2 * (a2 - 1.0) + 1.0);
            return a2 / max(0.00001, 3.14159265 * denom * denom);
        }

        // =====================================================================
        // SISTEMA DE FIOS LUMINOSOS & ESPUMA ESTILIZADA-REALISTA (GAME POLISH)
        // Em vez de uma grade Voronoi cinza, gera:
        //  - x (cyanGlow): Halo ciano-turquesa luminoso e rede aquática suave
        //  - y (whiteCore): Fio branco puro nítido nas cristas, ondas da praia e anéis
        //  - zw (normalPerturb): Micro-relevo líquido suave
        // =====================================================================
        vec4 evaluatePolishedWaterRibbons(
            vec2 worldXZ,
            vec4 wave,
            float waveElev,
            float shoreDepth,
            float rippleCrest,
            float wakeRibbon,
            float viewDist,
            bool isOcean
        ) {
            if (uFoamIntensity <= 0.01 || viewDist > 175.0) return vec4(0.0);

            float distFade = 1.0 - smoothstep(90.0, 170.0, viewDist);

            // Distorção orgânica suave usando a textura de fluxo contínuo (sem grade Voronoi!)
            vec2 flowUV1 = worldXZ * 0.14 + vec2(uTime * 0.025, -uTime * 0.018) * uWaveSpeed;
            vec2 flowUV2 = worldXZ * 0.38 + vec2(-uTime * 0.032, uTime * 0.028) * uWaveSpeed + wave.yz * 0.25;
            vec3 flowSample1 = texture2D(uFoamSampler, flowUV1).rgb;
            vec3 flowSample2 = texture2D(uFoamSampler, flowUV2).rgb;

            // Padrão de fita orgânica (varia suavemente para abrir e fechar os fios de espuma)
            float organicBreak = mix(flowSample1.r, flowSample2.r, 0.5);
            // Filamentos finos esticados na direção do fluxo
            float fineStreaks = flowSample2.g;
            // Micro-gotas cintilantes
            float microDrops  = flowSample2.b;

            // 1. REDE DE BRILHO AQUÁTICO SUPERFICIAL (Water Shimmer Web nas cristas)
            // Cria aquele detalhe cristalino satisfatório quando as ondas se cruzam
            float crestLift = smoothstep(-0.01, 0.12, waveElev) + clamp(-wave.w * 0.18, 0.0, 0.8);
            float shimmerWeb = smoothstep(0.68, 0.94, flowSample1.g * 0.55 + flowSample2.g * 0.45) * crestLift * 0.42;

            // 2. ANÉIS INTERATIVOS DE TOQUE / CHUVA (Fio branco nítido + halo ciano + gotas)
            float rippleMod = mix(0.65, 1.25, organicBreak);
            float rippleCyan = clamp(rippleCrest * rippleMod * 1.15, 0.0, 1.0);
            float rippleWhite = smoothstep(0.32, 0.85, rippleCrest * rippleMod) +
                                smoothstep(0.55, 0.92, microDrops) * clamp(rippleCrest * 1.4, 0.0, 1.0) * 0.65;

            // 3. FIOS DE CRISTA DE ONDA (Sleek Wave Crest Filaments)
            float waveCyan = 0.0;
            float waveWhite = 0.0;

            if (!isOcean) {
                // Na Piscina: fios finos apenas em cristas agudas + reflexo delicado ao bater na borda
                float poolRidge = clamp(-wave.w * 0.28 * uWaveChoppy, 0.0, 1.2);
                waveCyan = smoothstep(0.35, 0.90, poolRidge) * organicBreak * 0.65;
                waveWhite = smoothstep(0.62, 1.05, poolRidge * (0.7 + 0.5 * fineStreaks)) * 0.75;

                float wallDist = min(7.0 - abs(worldXZ.x), 5.0 - abs(worldXZ.y));
                float wallLap = (1.0 - smoothstep(0.0, 0.14, wallDist)) * smoothstep(0.02, 0.09, abs(waveElev));
                waveCyan += wallLap * 0.65;
                waveWhite += wallLap * smoothstep(0.45, 0.85, fineStreaks) * 0.55;
            } else {
                // No Oceano:
                // A) Fios de crista em mar aberto alinhados ao topo da vaga (Whitecap Filaments)
                vec2 windDir = normalize(vec2(0.85, 0.35));
                float leeward = clamp(dot(wave.yz, windDir) * 0.8 + 0.35, 0.0, 1.3);
                float ridgeMetric = (max(0.0, -wave.w) * 0.42 * uWaveChoppy + max(0.0, waveElev) * 0.48) * leeward;

                // O halo ciano envolve a crista; o branco puro forma estrias finas no pico
                waveCyan = smoothstep(0.28, 0.82, ridgeMetric * (0.65 + 0.55 * organicBreak));
                float streakMask = smoothstep(0.42, 0.88, fineStreaks * 0.65 + organicBreak * 0.35);
                waveWhite = smoothstep(0.46, 0.95, ridgeMetric) * streakMask +
                            smoothstep(0.75, 1.25, ridgeMetric) * 0.65;

                // B) ONDAS DE CONTORNO NA PRAIA DA ILHA (Crisp Shoreline Wave Rings)
                if (shoreDepth < 2.8) {
                    // Distorção suave para as ondas acompanharem a praia com naturalidade
                    float shoreWarp = (flowSample1.r - 0.5) * 0.38;
                    float surfCoord = shoreDepth * 1.65 - uTime * 0.52 * uWaveSpeed + shoreWarp;
                    float sFract = fract(surfCoord);

                    // Arco frontal nítido e brilhante que corre em direção à areia
                    float frontRibbon = exp(-pow((sFract - 0.10) / 0.048, 2.0));
                    // Esteira rendilhada suave logo atrás do arco frontal
                    float trailingLace = smoothstep(0.10, 0.25, sFract) * (1.0 - smoothstep(0.25, 0.82, sFract)) *
                                         smoothstep(0.48, 0.82, fineStreaks);

                    // Segunda onda harmônica intercalada
                    float surfCoord2 = shoreDepth * 2.55 - uTime * 0.68 * uWaveSpeed - shoreWarp * 0.8 + 0.45;
                    float sFract2 = fract(surfCoord2);
                    float frontRibbon2 = exp(-pow((sFract2 - 0.12) / 0.055, 2.0)) * 0.72;

                    // Envelope da zona de arrebentação costeira
                    float shoreEnv = (1.0 - smoothstep(0.35, 2.55, shoreDepth)) * smoothstep(-0.05, 0.02, shoreDepth);
                    // Quebra natural ao longo do arco para não parecer uma linha vetorial rígida
                    float ribbonContinuity = smoothstep(0.20, 0.68, organicBreak);

                    // Fio delicado exatamente no encontro da água com a areia molhada
                    float waterEdgeLine = exp(-pow(shoreDepth / 0.055, 2.0)) * (0.45 + 0.55 * frontRibbon);

                    float shoreRibbons = shoreEnv * ((frontRibbon + frontRibbon2) * ribbonContinuity + trailingLace * 0.65) + waterEdgeLine;

                    waveCyan = max(waveCyan, clamp(shoreRibbons * 1.15, 0.0, 1.0));
                    waveWhite = max(waveWhite, clamp((frontRibbon * ribbonContinuity * 1.1 + frontRibbon2 * ribbonContinuity * 0.75 + waterEdgeLine * 0.85 + trailingLace * 0.45) * shoreEnv + waterEdgeLine * 0.7, 0.0, 1.0));
                }
            }

            // 4. ANÉIS DE CONTORNO AO REDOR DAS BOIAS E BARCO
            float wakeCyan = wakeRibbon * 0.85;
            float wakeWhite = smoothstep(0.25, 0.80, wakeRibbon);

            // Combinação final das camadas com escala do usuário e atenuação de distância
            float intensity = clamp(uFoamIntensity, 0.0, 2.5) * distFade;
            float totalCyanGlow = clamp((shimmerWeb + max(max(waveCyan, rippleCyan), wakeCyan)) * intensity, 0.0, 1.0);
            float totalWhiteCore = clamp(max(max(waveWhite, rippleWhite), wakeWhite) * min(1.35, intensity * 0.95), 0.0, 1.0);

            vec2 normalPerturb = (flowSample2.rg - 0.5) * totalWhiteCore * 0.06 * distFade;
            return vec4(totalCyanGlow, totalWhiteCore, normalPerturb);
        }

        void main() {
            bool isOcean = (uSceneMode > 0.5);
            float exactTerrainH = -3.1;
            if (isOcean) {
                if (vShoreDepth < 4.5) {
                    exactTerrainH = evaluateIslandBathymetry(vWorldPos.xz);
                    if (exactTerrainH > vWorldPos.y + 0.025) {
                        discard;
                    }
                } else {
                    exactTerrainH = -vShoreDepth;
                }
            }

            vec3 viewVector = uCameraPos - vWorldPos;
            float viewDist = length(viewVector);
            vec3 viewDir = viewVector / max(0.0001, viewDist);

            vec2 dummyHoriz;
            float rippleCrest = 0.0;
            vec4 wave = evaluateWaveFieldFull(vWorldPos.xz, dummyHoriz, rippleCrest);

            // =====================================================================
            // 1. MICRO-ONDAS CAPILARES EM 3 ESCALAS (PARA GLINTS E RELEVO LÍQUIDO)
            // =====================================================================
            float microFade = 1.0 / (1.0 + viewDist * 0.022);
            float capAmp = (0.018 + 0.028 * clamp(uWaveHeight, 0.15, 1.8)) * microFade;

            vec2 capUV1 = vWorldPos.xz * 4.4 + vec2(uTime * 0.52, -uTime * 0.38) * uWaveSpeed;
            vec2 capUV2 = vWorldPos.xz * 9.8 + vec2(-uTime * 0.64, uTime * 0.48) * uWaveSpeed;
            vec2 capUV3 = vWorldPos.xz * 21.5 + vec2(uTime * 0.85, uTime * 0.72) * uWaveSpeed;

            float nCap1X = noise2D(capUV1 + vec2(0.15, 0.0)) - noise2D(capUV1 - vec2(0.15, 0.0));
            float nCap1Z = noise2D(capUV1 + vec2(0.0, 0.15)) - noise2D(capUV1 - vec2(0.0, 0.15));
            float nCap2X = noise2D(capUV2 + vec2(0.15, 0.0)) - noise2D(capUV2 - vec2(0.15, 0.0));
            float nCap2Z = noise2D(capUV2 + vec2(0.0, 0.15)) - noise2D(capUV2 - vec2(0.0, 0.15));
            float nCap3X = noise2D(capUV3) - 0.5;
            float nCap3Z = noise2D(capUV3.yx + vec2(3.7, 1.2)) - 0.5;

            vec2 capillarySlope = (vec2(nCap1X, nCap1Z) * 1.15 +
                                   vec2(nCap2X, nCap2Z) * 0.75 +
                                   vec2(nCap3X, nCap3Z) * 0.55) * capAmp;

            // =====================================================================
            // 2. AVALIAÇÃO DOS FIOS LUMINOSOS E ANÉIS DE ESPUMA
            // =====================================================================
            float wakeRibbon = (viewDist < 65.0) ? evaluateObjectWakeFoam(vWorldPos.xz) : 0.0;
            float currentShoreDepth = isOcean ? max(0.0, vWorldPos.y - exactTerrainH) : 3.1;

            vec4 ribbonData = evaluatePolishedWaterRibbons(
                vWorldPos.xz,
                wave,
                vWaveElevation,
                currentShoreDepth,
                rippleCrest,
                wakeRibbon,
                viewDist,
                isOcean
            );
            float cyanGlowMask = ribbonData.x;
            float whiteCoreMask = ribbonData.y;
            vec2 ribbonBump = ribbonData.zw;

            vec3 surfaceNormal = normalize(vec3(
                -(wave.y + capillarySlope.x + ribbonBump.x),
                1.0,
                -(wave.z + capillarySlope.y + ribbonBump.y)
            ));

            bool cameraAboveWater = (uCameraPos.y >= vWorldPos.y);
            vec3 orientedNormal = cameraAboveWater ? surfaceNormal : -surfaceNormal;

            float eta = cameraAboveWater ? (1.0 / uIOR) : uIOR;
            float cosThetaI = clamp(dot(viewDir, orientedNormal), 0.0, 1.0);

            float sin2ThetaT = eta * eta * (1.0 - cosThetaI * cosThetaI);
            float fresnel;
            if (sin2ThetaT > 1.0) {
                fresnel = 1.0;
            } else {
                float r0 = (1.0 - uIOR) / (1.0 + uIOR);
                r0 = r0 * r0;
                float cosX = cameraAboveWater ? cosThetaI : sqrt(max(0.0, 1.0 - sin2ThetaT));
                float oneMinusCos = clamp(1.0 - cosX, 0.0, 1.0);
                float f5 = oneMinusCos * oneMinusCos * oneMinusCos * oneMinusCos * oneMinusCos;
                fresnel = r0 + (1.0 - r0) * f5;
                fresnel = clamp(fresnel, 0.02, 0.98);
            }

            vec2 ndc = (vClipPos.xy / max(0.001, vClipPos.w)) * 0.5 + 0.5;
            float shoreRefrAtten = isOcean ? smoothstep(0.0, 0.75, currentShoreDepth) : 1.0;
            vec2 refrOffset = orientedNormal.xz * (0.065 * (uIOR - 1.0) / 0.333) * shoreRefrAtten;

            float disp = uChromaticDispersion;
            vec2 uvR = clamp(ndc + refrOffset * (1.0 - disp * 2.2), 0.002, 0.998);
            vec2 uvG = clamp(ndc + refrOffset, 0.002, 0.998);
            vec2 uvB = clamp(ndc + refrOffset * (1.0 + disp * 2.2), 0.002, 0.998);

            vec3 rttRefraction;
            rttRefraction.r = texture2D(uRefractionSampler, uvR).r;
            rttRefraction.g = texture2D(uRefractionSampler, uvG).g;
            rttRefraction.b = texture2D(uRefractionSampler, uvB).b;

            vec3 refractedRayG = refract(-viewDir, orientedNormal, eta);
            if (length(refractedRayG) < 0.01) {
                refractedRayG = reflect(-viewDir, orientedNormal);
            }

            float waterPathLength;
            vec3 refractedSceneColor;

            if (!isOcean) {
                vec3 hitNormal;
                waterPathLength = intersectPoolBox(vWorldPos, refractedRayG, hitNormal);
                vec3 hitPosG = vWorldPos + refractedRayG * waterPathLength;
                vec3 analyticalTilesG = evaluatePoolTiles(hitPosG, hitNormal);
                vec3 analyticalLitG = evaluateUnderwaterPointLighting(hitPosG, hitNormal, analyticalTilesG);

                if (disp > 0.001 && cameraAboveWater && uAnalyticDispersionFlag > 0.5) {
                    vec3 rayR = refract(-viewDir, orientedNormal, eta * (1.0 + disp * 0.45));
                    vec3 rayB = refract(-viewDir, orientedNormal, eta * (1.0 - disp * 0.45));
                    vec3 nR, nB;
                    float tR = intersectPoolBox(vWorldPos, rayR, nR);
                    float tB = intersectPoolBox(vWorldPos, rayB, nB);
                    vec3 pR = vWorldPos + rayR * tR;
                    vec3 pB = vWorldPos + rayB * tB;
                    analyticalLitG.r = evaluateUnderwaterPointLighting(pR, nR, evaluatePoolTiles(pR, nR)).r;
                    analyticalLitG.b = evaluateUnderwaterPointLighting(pB, nB, evaluatePoolTiles(pB, nB)).b;
                }
                refractedSceneColor = mix(rttRefraction, analyticalLitG, 0.42);
            } else {
                float verticalDepth = currentShoreDepth;
                waterPathLength = verticalDepth / max(0.26, abs(refractedRayG.y));
                vec3 seabedPos = vWorldPos + refractedRayG * min(waterPathLength, 10.0);
                seabedPos.y = min(seabedPos.y, exactTerrainH);
                float dummyRough;
                vec3 sandCol = evaluateIslandTerrainAlbedo(seabedPos, vec3(0.0, 1.0, 0.0), dummyRough);
                vec3 analyticalSeabed = evaluateUnderwaterPointLighting(seabedPos, vec3(0.0, 1.0, 0.0), sandCol);
                refractedSceneColor = mix(rttRefraction, analyticalSeabed, 0.32);
            }

            // =====================================================================
            // 3. BRILHO SUPERFICIAL GGX + GLINTS ESTOCÁSTICOS ("DIAMANTES DE SOL")
            // =====================================================================
            vec3 finalColor;
            if (cameraAboveWater) {
                vec3 sigma = vec3(0.34, 0.075, 0.028) * uAbsorptionScale;
                vec3 transmittance = exp(-sigma * waterPathLength);

                float maxDepthNorm = isOcean ? 9.5 : 4.8;
                float depthFactor = clamp(waterPathLength / maxDepthNorm, 0.0, 1.0);
                vec3 volumeTint = mix(uWaterShallowColor, uWaterDeepColor, depthFactor);

                float blDot = clamp(dot(viewDir, normalize(-uSunDir + surfaceNormal * 0.65)), 0.0, 1.0);
                float backLight = blDot * blDot * blDot;
                float crestFactor = smoothstep(-0.02, 0.16, vWaveElevation);
                vec3 sssGlow = uWaterShallowColor * (backLight * (0.48 + crestFactor * 1.25) * 0.62);

                vec3 transmittedColor = refractedSceneColor * transmittance + volumeTint * (1.0 - transmittance) * 0.76 + sssGlow;

                vec3 reflDir = reflect(-viewDir, orientedNormal);
                reflDir.y = max(0.02, reflDir.y);
                vec3 reflectedColor = evaluateSkyReflection(reflDir);

                vec3 halfVec = normalize(uSunDir + viewDir);

                // Camada 1: Coluna Solar Microfacetada GGX
                float baseRoughness = clamp(0.042 + 0.032 * uWaveHeight, 0.035, 0.12);
                float ggxCore = distributionGGX(orientedNormal, halfVec, baseRoughness) * 0.22;
                float ggxBroad = distributionGGX(orientedNormal, halfVec, baseRoughness * 2.8) * 0.045;

                // Camada 2: Cintilação Estocástica de Micro-Facetas (Glints)
                vec3 glintNormal = normalize(vec3(
                    -(wave.y * 0.85 + capillarySlope.x * 3.4),
                    1.0,
                    -(wave.z * 0.85 + capillarySlope.y * 3.4)
                ));
                float NdotH_glint = max(0.0, dot(glintNormal, halfVec));

                vec2 sparkleGrid1 = vWorldPos.xz * 14.5 + vec2(uTime * 0.8, -uTime * 0.6);
                vec2 sparkleGrid2 = vWorldPos.xz * 23.0 - vec2(uTime * 0.9, uTime * 0.75);
                float sparkleMask = smoothstep(0.62, 0.94, noise2D(sparkleGrid1) * 0.55 + noise2D(sparkleGrid2) * 0.45);

                float diamondSparkles = pow(NdotH_glint, 180.0) * sparkleMask * 6.5 +
                                        pow(NdotH_glint, 950.0) * 8.0;

                float wetSpecularMask = 1.0 - whiteCoreMask * 0.65;
                float glintScale = uSunGlintIntensity * wetSpecularMask;

                vec3 sunWhiteCore = mix(uSunColor, vec3(1.0, 0.995, 0.98), 0.72);
                vec3 specularGlint = (uSunColor * (ggxBroad + ggxCore * 0.65) +
                                      sunWhiteCore * (ggxCore * 0.55 + diamondSparkles)) * glintScale;

                finalColor = mix(transmittedColor, reflectedColor, fresnel) + specularGlint;
            } else {
                vec3 skyThroughWindow = evaluateSkyReflection(normalize(refractedRayG));
                vec3 internalReflColor = mix(refractedSceneColor, uWaterDeepColor, 0.55);
                finalColor = mix(skyThroughWindow * 1.15, internalReflColor, fresnel);
            }

            // =====================================================================
            // 4. COMPOSIÇÃO LUMINOSA DUPLO-TOM (HALO CIANO + FIO BRANCO CRISTALINO)
            //    Zero tons cinzas: a espuma ilumina a água com ciano vivo e branco puro!
            // =====================================================================
            if (cyanGlowMask > 0.004 || whiteCoreMask > 0.004) {
                float sunBrightness = clamp(0.68 + 0.38 * max(0.15, uSunDir.y), 0.65, 1.12);

                // Camada Externa: Brilho aquático ciano-turquesa integrado à cor da água
                vec3 luminousAqua = mix(uWaterShallowColor, vec3(0.62, 0.96, 1.0), 0.62) * sunBrightness;
                finalColor = mix(finalColor, max(finalColor, luminousAqua), cyanGlowMask * 0.68);

                // Camada Interna: Fio de espuma branco puro brilhante nas cristas e ondas
                vec3 crispWhite = mix(vec3(0.95, 0.99, 1.0), uSunColor * 1.05, 0.22) * sunBrightness;
                finalColor = mix(finalColor, crispWhite, whiteCoreMask * 0.92);
            }

            // Menisco sutil nas bordas de azulejo da piscina
            if (!isOcean) {
                float wallProximity = min(7.0 - abs(vWorldPos.x), 5.0 - abs(vWorldPos.z));
                float meniscus = (1.0 - smoothstep(0.0, 0.06, wallProximity)) * 0.16;
                finalColor += vec3(0.90, 0.98, 1.0) * meniscus;
            } else {
                float horizonFog = smoothstep(75.0, 215.0, viewDist);
                vec3 horizonSkyCol = evaluateSkyReflection(normalize(vec3(-viewDir.x, 0.03, -viewDir.z)));
                finalColor = mix(finalColor, horizonSkyCol, horizonFog);
            }

            vec3 mapped = finalColor / (1.0 + finalColor * 0.075);
            gl_FragColor = vec4(clamp(mapped, 0.0, 1.0), 1.0);
        }
    `;
    // === FIM DA PARTE 1 — COLE A PARTE 2 LOGO ABAIXO DESTA LINHA ===
    // === INÍCIO DA PARTE 2 — COLE LOGO ABAIXO DA PARTE 1 ===

    // =========================================================================
    // 6. CREATE SHADER MATERIALS & UNIFORM BINDING
    // =========================================================================
    const floatingObjectsUniform = new Float32Array(6 * 4);

    const sharedUniformNames = [
        "world", "viewProjection", "uTime", "uSceneMode", "uWaveOctaves",
        "uActiveRippleCount", "uWaveHeight", "uWaveChoppy", "uWaveSpeed",
        "uFoamIntensity", "uSunGlintIntensity", "uWaveDirSpread", "uWaveSwellScale",
        "uRippleDamping", "uCausticsIntensity", "uUnderwaterLEDs", "uTileStyle",
        "uAbsorptionScale", "uSunDir", "uSunColor", "uWaterShallowColor",
        "uWaterDeepColor", "uRipples", "uFloatingObjects", "uCameraPos",
        "uIOR", "uChromaticDispersion", "uAnalyticDispersionFlag",
        "uSkyZenithColor", "uSkyHorizonColor",
        "uObjectColor1", "uObjectColor2", "uObjectPattern"
    ];

    const skyDomeMat = new BABYLON.ShaderMaterial("skyDomeMat", scene, {
        vertex: "skyDome",
        fragment: "skyDome"
    }, {
        attributes: ["position"],
        uniforms: ["world", "viewProjection", "uSunDir", "uSunColor", "uSkyZenithColor", "uSkyHorizonColor"]
    });
    skyDomeMat.backFaceCulling = false;

    const skyDome = BABYLON.MeshBuilder.CreateSphere("skyDome", { diameter: 480, segments: 24 }, scene);
    skyDome.isPickable = false;
    skyDome.material = skyDomeMat;
    skyDome.freezeWorldMatrix();

    const poolInteriorMat = new BABYLON.ShaderMaterial("poolInteriorMat", scene, {
        vertex: "poolInterior",
        fragment: "poolInterior"
    }, {
        attributes: ["position", "normal", "uv"],
        uniforms: sharedUniformNames
    });
    poolInteriorMat.backFaceCulling = false;

    const waterSurfaceMat = new BABYLON.ShaderMaterial("waterSurfaceMat", scene, {
        vertex: "waterSurface",
        fragment: "waterSurface"
    }, {
        attributes: ["position", "uv"],
        uniforms: sharedUniformNames,
        samplers: ["uRefractionSampler", "uFoamSampler"]
    });
    waterSurfaceMat.backFaceCulling = false;

    // Gera uma textura 256x256 perfeitamente ladrilhável (seamless) de Fluxo & Fios Aquáticos
    // Sem células Voronoi! Usa ondas senoidais entrelaçadas (Domain-Warped Flow) para criar
    // fitas líquidas suaves (R), filamentos alongados de crista (G) e micro-gotas (B).
    function createSeamlessFoamTexture() {
        const size = 256;
        const tex = new BABYLON.DynamicTexture("proceduralFoamTex", { width: size, height: size }, scene, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
        const ctx = tex.getContext();
        const imgData = ctx.createImageData(size, size);
        const data = imgData.data;
        const TAU = Math.PI * 2.0;

        function hashGrid(ix, iy, seed) {
            const s = Math.sin(ix * 127.1 + iy * 311.7 + seed * 53.3) * 43758.5453;
            return s - Math.floor(s);
        }

        // Ruído interpolado perfeitamente periódico (tileable em 0..1)
        function periodicNoise(u, v, period, seed) {
            const x = u * period;
            const y = v * period;
            const ix0 = Math.floor(x) % period;
            const iy0 = Math.floor(y) % period;
            const ix1 = (ix0 + 1) % period;
            const iy1 = (iy0 + 1) % period;
            const fx = x - Math.floor(x);
            const fy = y - Math.floor(y);
            const ux = fx * fx * (3.0 - 2.0 * fx);
            const uy = fy * fy * (3.0 - 2.0 * fy);

            const a = hashGrid(ix0, iy0, seed);
            const b = hashGrid(ix1, iy0, seed);
            const c = hashGrid(ix0, iy1, seed);
            const d = hashGrid(ix1, iy1, seed);
            return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
        }

        function periodicFBM(u, v, basePeriod, seed) {
            return periodicNoise(u, v, basePeriod, seed) * 0.55 +
                   periodicNoise(u, v, basePeriod * 2, seed + 11.0) * 0.30 +
                   periodicNoise(u, v, basePeriod * 4, seed + 23.0) * 0.15;
        }

        for (let py = 0; py < size; py++) {
            const v = py / size;
            for (let px = 0; px < size; px++) {
                const u = px / size;
                const idx = (py * size + px) * 4;

                // Distorção de domínio suave (Flow Warping)
                const warpX = periodicFBM(u, v, 4, 1.0) - 0.5;
                const warpY = periodicFBM(u, v, 4, 7.0) - 0.5;
                const wu = (u + warpX * 0.18 + 1.0) % 1.0;
                const wv = (v + warpY * 0.18 + 1.0) % 1.0;

                // Canal R: Modulação fluida e orgânica para abrir/fechar os arcos de onda
                const rVal = periodicFBM(wu, wv, 6, 19.0);

                // Canal G: Filamentos líquidos entrelaçados (Curvas cáusticas suaves sem colmeia)
                const wave1 = Math.sin((wu * 3.0 + wv * 2.0) * TAU + warpX * 4.5);
                const wave2 = Math.cos((wu * 2.0 - wv * 3.0) * TAU + warpY * 4.5);
                const ribbon1 = Math.pow(Math.max(0.0, 1.0 - Math.abs(wave1)), 3.2);
                const ribbon2 = Math.pow(Math.max(0.0, 1.0 - Math.abs(wave2)), 3.2);
                const nFine = periodicFBM(wu, wv, 12, 31.0);
                const gVal = Math.min(1.0, (ribbon1 * 0.65 + ribbon2 * 0.55) * (0.45 + 0.55 * nFine));

                // Canal B: Micro-gotas cintilantes de alta frequência
                const nDrop1 = periodicNoise(u, v, 24, 43.0);
                const nDrop2 = periodicNoise(u, v, 36, 59.0);
                const bVal = Math.pow(nDrop1 * nDrop2, 1.6) * 2.2;

                data[idx + 0] = Math.min(255, Math.round(rVal * 255));
                data[idx + 1] = Math.min(255, Math.round(gVal * 255));
                data[idx + 2] = Math.min(255, Math.round(Math.min(1.0, bVal) * 255));
                data[idx + 3] = 255;
            }
        }

        ctx.putImageData(imgData, 0, 0);
        tex.update(true);
        tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
        tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        tex.anisotropicFilteringLevel = 4;
        return tex;
    }

    const proceduralFoamTex = createSeamlessFoamTexture();
    waterSurfaceMat.setTexture("uFoamSampler", proceduralFoamTex);

    function bindCommonShaderUniforms(mat) {
        mat.setFloat("uTime", simState.time);
        mat.setFloat("uSceneMode", simState.sceneMode);
        mat.setFloat("uWaveOctaves", simState.waveOctaves);
        mat.setFloat("uActiveRippleCount", activeRippleCount);
        mat.setFloat("uWaveHeight", simState.waveHeight);
        mat.setFloat("uWaveChoppy", simState.waveChoppy);
        mat.setFloat("uWaveSpeed", simState.waveSpeed);
        mat.setFloat("uFoamIntensity", simState.foamIntensity);
        mat.setFloat("uSunGlintIntensity", simState.sunGlintIntensity);
        mat.setFloat("uWaveDirSpread", simState.waveDirSpread);
        mat.setFloat("uWaveSwellScale", simState.waveSwellScale);
        mat.setFloat("uRippleDamping", simState.rippleDamping);
        mat.setFloat("uCausticsIntensity", simState.causticsIntensity);
        mat.setFloat("uUnderwaterLEDs", simState.underwaterLEDs);
        mat.setFloat("uTileStyle", simState.tileStyle);
        mat.setFloat("uAbsorptionScale", simState.absorptionScale);
        mat.setVector3("uSunDir", simState.sunDir);
        mat.setVector3("uSunColor", simState.sunColor);
        mat.setVector3("uWaterShallowColor", simState.waterShallowColor);
        mat.setVector3("uWaterDeepColor", simState.waterDeepColor);
        mat.setArray4("uRipples", rippleUniformArray);
        mat.setArray4("uFloatingObjects", floatingObjectsUniform);
        mat.setVector3("uCameraPos", camera.position);
    }

    // =========================================================================
    // 7. BUILD POOL ARCHITECTURE & ISOLATED TROPICAL ISLAND SCENE
    // =========================================================================
    const poolSceneMeshes = [];
    const poolRefractionMeshes = [];
    const oceanSceneMeshes = [];
    const oceanRefractionMeshes = [];
    const sharedFloatingRefractionMeshes = [];

    // Safe mesh validator for Babylon.js v9.35.0 RenderTargetTexture
    function isValidRefractionMesh(mesh) {
        return Boolean(
            mesh &&
            mesh instanceof BABYLON.Mesh &&
            mesh._internalAbstractMeshDataInfo &&
            typeof mesh.getTotalVertices === "function" &&
            mesh.getTotalVertices() > 0
        );
    }

    function registerPoolMesh(mesh, includeInRefraction = true) {
        poolSceneMeshes.push(mesh);
        if (includeInRefraction && isValidRefractionMesh(mesh)) {
            poolRefractionMeshes.push(mesh);
        }
    }

    function registerOceanMesh(mesh, includeInRefraction = true) {
        oceanSceneMeshes.push(mesh);
        if (includeInRefraction && isValidRefractionMesh(mesh)) {
            oceanRefractionMeshes.push(mesh);
        }
    }

    // -------------------------------------------------------------------------
    // 7.1 POOL FLOOR, WALLS, TRAVERTINE DECK, LADDER & LED FIXTURES
    // -------------------------------------------------------------------------
    const poolFloor = BABYLON.MeshBuilder.CreateGround("poolFloor", {
        width: POOL_HALF_X * 2,
        height: POOL_HALF_Z * 2,
        subdivisions: 4
    }, scene);
    poolFloor.position.y = -POOL_DEPTH;
    poolFloor.material = poolInteriorMat;
    poolFloor.freezeWorldMatrix();
    registerPoolMesh(poolFloor, true);

    const wallHeight = POOL_DEPTH + WALL_TOP_Y;
    const wallCenterY = (-POOL_DEPTH + WALL_TOP_Y) * 0.5;

    const wallNorth = BABYLON.MeshBuilder.CreatePlane("wallNorth", { width: POOL_HALF_X * 2, height: wallHeight }, scene);
    wallNorth.position.set(0, wallCenterY, POOL_HALF_Z);
    wallNorth.material = poolInteriorMat;
    wallNorth.freezeWorldMatrix();
    registerPoolMesh(wallNorth, true);

    const wallSouth = BABYLON.MeshBuilder.CreatePlane("wallSouth", { width: POOL_HALF_X * 2, height: wallHeight }, scene);
    wallSouth.position.set(0, wallCenterY, -POOL_HALF_Z);
    wallSouth.rotation.y = Math.PI;
    wallSouth.material = poolInteriorMat;
    wallSouth.freezeWorldMatrix();
    registerPoolMesh(wallSouth, true);

    const wallEast = BABYLON.MeshBuilder.CreatePlane("wallEast", { width: POOL_HALF_Z * 2, height: wallHeight }, scene);
    wallEast.position.set(POOL_HALF_X, wallCenterY, 0);
    wallEast.rotation.y = Math.PI * 0.5;
    wallEast.material = poolInteriorMat;
    wallEast.freezeWorldMatrix();
    registerPoolMesh(wallEast, true);

    const wallWest = BABYLON.MeshBuilder.CreatePlane("wallWest", { width: POOL_HALF_Z * 2, height: wallHeight }, scene);
    wallWest.position.set(-POOL_HALF_X, wallCenterY, 0);
    wallWest.rotation.y = -Math.PI * 0.5;
    wallWest.material = poolInteriorMat;
    wallWest.freezeWorldMatrix();
    registerPoolMesh(wallWest, true);

    function createTravertineTexture() {
        const tex = new BABYLON.DynamicTexture("travertineTex", { width: 512, height: 512 }, scene, true);
        const ctx = tex.getContext();
        ctx.fillStyle = "#e4dfd7";
        ctx.fillRect(0, 0, 512, 512);

        for (let i = 0; i < 3500; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const w = 2 + Math.random() * 16;
            ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.14)" : "rgba(160,148,132,0.14)";
            ctx.fillRect(x, y, w, 2);
        }
        ctx.strokeStyle = "rgba(120, 110, 98, 0.45)";
        ctx.lineWidth = 3;
        for (let x = 0; x <= 512; x += 128) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
        }
        for (let y = 0; y <= 512; y += 128) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
        }
        tex.update();
        tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
        tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        return tex;
    }

    const copingMat = new BABYLON.StandardMaterial("copingMat", scene);
    const travTex = createTravertineTexture();
    travTex.uScale = 6;
    travTex.vScale = 2;
    copingMat.diffuseTexture = travTex;
    copingMat.specularColor = new BABYLON.Color3(0.25, 0.25, 0.25);
    copingMat.freeze();

    const deckWidth = 2.4;
    const rimHeight = 0.16;
    const rimY = WALL_TOP_Y + rimHeight * 0.5 - 0.04;

    const deckNorth = BABYLON.MeshBuilder.CreateBox("deckN", { width: (POOL_HALF_X + deckWidth) * 2, height: rimHeight, depth: deckWidth }, scene);
    deckNorth.position.set(0, rimY, POOL_HALF_Z + deckWidth * 0.5 - 0.06);
    deckNorth.material = copingMat;
    deckNorth.freezeWorldMatrix();
    registerPoolMesh(deckNorth, false);

    const deckSouth = BABYLON.MeshBuilder.CreateBox("deckS", { width: (POOL_HALF_X + deckWidth) * 2, height: rimHeight, depth: deckWidth }, scene);
    deckSouth.position.set(0, rimY, -POOL_HALF_Z - deckWidth * 0.5 + 0.06);
    deckSouth.material = copingMat;
    deckSouth.freezeWorldMatrix();
    registerPoolMesh(deckSouth, false);

    const deckEast = BABYLON.MeshBuilder.CreateBox("deckE", { width: deckWidth, height: rimHeight, depth: POOL_HALF_Z * 2 }, scene);
    deckEast.position.set(POOL_HALF_X + deckWidth * 0.5 - 0.06, rimY, 0);
    deckEast.material = copingMat;
    deckEast.freezeWorldMatrix();
    registerPoolMesh(deckEast, false);

    const deckWest = BABYLON.MeshBuilder.CreateBox("deckW", { width: deckWidth, height: rimHeight, depth: POOL_HALF_Z * 2 }, scene);
    deckWest.position.set(-POOL_HALF_X - deckWidth * 0.5 + 0.06, rimY, 0);
    deckWest.material = copingMat;
    deckWest.freezeWorldMatrix();
    registerPoolMesh(deckWest, false);

    const chromeMat = new BABYLON.StandardMaterial("chromeMat", scene);
    chromeMat.diffuseColor = new BABYLON.Color3(0.75, 0.82, 0.88);
    chromeMat.specularColor = new BABYLON.Color3(1.0, 1.0, 1.0);
    chromeMat.specularPower = 96;
    chromeMat.freeze();

    function buildPoolLadder() {
        const ladderRoot = new BABYLON.Mesh("ladderRoot", scene);
        ladderRoot.position.set(-POOL_HALF_X + 0.25, 0, -2.6);
        registerPoolMesh(ladderRoot, false);

        const railOffsets = [-0.32, 0.32];
        railOffsets.forEach((zOff) => {
            const path = [
                new BABYLON.Vector3(-0.1, -2.1, zOff),
                new BABYLON.Vector3(-0.1, WALL_TOP_Y + 0.65, zOff),
                new BABYLON.Vector3(-0.22, WALL_TOP_Y + 0.88, zOff),
                new BABYLON.Vector3(-0.55, WALL_TOP_Y + 0.88, zOff),
                new BABYLON.Vector3(-0.62, WALL_TOP_Y + 0.05, zOff)
            ];
            const rail = BABYLON.MeshBuilder.CreateTube("ladderRail", { path: path, radius: 0.032, tessellation: 14 }, scene);
            rail.parent = ladderRoot;
            rail.material = chromeMat;
            registerPoolMesh(rail, true);
        });

        for (let s = 0; s < 4; s++) {
            const step = BABYLON.MeshBuilder.CreateBox("ladderStep" + s, { width: 0.12, height: 0.035, depth: 0.60 }, scene);
            step.position.set(-0.1, -0.42 - s * 0.48, 0);
            step.parent = ladderRoot;
            step.material = chromeMat;
            registerPoolMesh(step, true);
        }
    }
    buildPoolLadder();

    const ledFixtureMat = new BABYLON.StandardMaterial("ledFixtureMat", scene);
    ledFixtureMat.emissiveColor = new BABYLON.Color3(0.35, 0.95, 1.0);
    ledFixtureMat.diffuseColor = new BABYLON.Color3(0.8, 0.98, 1.0);

    [-2.4, 2.4].forEach((zPos) => {
        [-1, 1].forEach((side) => {
            const lamp = BABYLON.MeshBuilder.CreateCylinder("ledLamp", { diameter: 0.42, height: 0.05, tessellation: 20 }, scene);
            lamp.rotation.z = Math.PI * 0.5;
            lamp.position.set(side * (POOL_HALF_X - 0.02), -1.65, zPos);
            lamp.material = ledFixtureMat;
            lamp.freezeWorldMatrix();
            registerPoolMesh(lamp, true);
        });
    });

    // -------------------------------------------------------------------------
    // 7.2 ISOLATED TROPICAL ISLAND, CORAL REEF BATHYMETRY & PROPS (OCEAN MODE)
    // -------------------------------------------------------------------------
    function buildIsolatedIslandScene() {
        const rings = 112;
        const sectors = 144;
        const maxTerrainRadius = 74.0;
        const positions = [];
        const normals = [];
        const uvs = [];
        const indices = [];

        for (let r = 0; r <= rings; r++) {
            const t = r / rings;
            const radius = Math.pow(t, 1.48) * maxTerrainRadius;
            for (let s = 0; s <= sectors; s++) {
                const u = s / sectors;
                const theta = u * Math.PI * 2.0;
                const x = Math.cos(theta) * radius;
                const z = Math.sin(theta) * radius;
                const y = evaluateIslandHeightCPU(x, z);

                positions.push(x, y, z);
                uvs.push(x * 0.1, z * 0.1);

                const eps = 0.28;
                const hx = evaluateIslandHeightCPU(x + eps, z) - evaluateIslandHeightCPU(x - eps, z);
                const hz = evaluateIslandHeightCPU(x, z + eps) - evaluateIslandHeightCPU(x, z - eps);
                const nVec = new BABYLON.Vector3(-hx, 2.0 * eps, -hz).normalize();
                normals.push(nVec.x, nVec.y, nVec.z);
            }
        }

        // CORREÇÃO CRÍTICA: Winding order anti-horário (i0, i2, i1) para que a face externa
        // da ilha seja a face frontal (opaca) e nunca fique transparente!
        const stride = sectors + 1;
        for (let r = 0; r < rings; r++) {
            for (let s = 0; s < sectors; s++) {
                const i0 = r * stride + s;
                const i1 = i0 + 1;
                const i2 = (r + 1) * stride + s;
                const i3 = i2 + 1;
                indices.push(i0, i2, i1);
                indices.push(i1, i2, i3);
            }
        }

        const islandMesh = new BABYLON.Mesh("islandTerrain", scene);
        const vData = new BABYLON.VertexData();
        vData.positions = positions;
        vData.normals = normals;
        vData.uvs = uvs;
        vData.indices = indices;
        vData.applyToMesh(islandMesh);
        islandMesh.material = poolInteriorMat;
        islandMesh.isPickable = false;
        islandMesh.freezeWorldMatrix();
        registerOceanMesh(islandMesh, true);

        // Materiais sólidos do cenário da ilha
        const trunkMat = new BABYLON.StandardMaterial("palmTrunkMat", scene);
        trunkMat.diffuseColor = new BABYLON.Color3(0.44, 0.31, 0.20);
        trunkMat.specularColor = new BABYLON.Color3(0.06, 0.06, 0.06);
        trunkMat.freeze();

        const coconutMat = new BABYLON.StandardMaterial("coconutMat", scene);
        coconutMat.diffuseColor = new BABYLON.Color3(0.28, 0.18, 0.09);
        coconutMat.specularColor = new BABYLON.Color3(0.1, 0.08, 0.05);
        coconutMat.freeze();

        const frondMat = new BABYLON.StandardMaterial("palmFrondMat", scene);
        frondMat.diffuseColor = new BABYLON.Color3(0.19, 0.58, 0.18);
        frondMat.specularColor = new BABYLON.Color3(0.22, 0.32, 0.18);
        frondMat.backFaceCulling = false;
        frondMat.freeze();

        const bushMat = new BABYLON.StandardMaterial("tropicalBushMat", scene);
        bushMat.diffuseColor = new BABYLON.Color3(0.15, 0.48, 0.16);
        bushMat.specularColor = new BABYLON.Color3(0.08, 0.14, 0.08);
        bushMat.freeze();

        const rockMat = new BABYLON.StandardMaterial("volcanicRockMat", scene);
        rockMat.diffuseColor = new BABYLON.Color3(0.25, 0.24, 0.22);
        rockMat.specularColor = new BABYLON.Color3(0.12, 0.12, 0.12);
        rockMat.freeze();

        const woodMat = new BABYLON.StandardMaterial("pierWoodMat", scene);
        woodMat.diffuseColor = new BABYLON.Color3(0.52, 0.36, 0.21);
        woodMat.specularColor = new BABYLON.Color3(0.10, 0.08, 0.06);
        woodMat.freeze();

        const thatchMat = new BABYLON.StandardMaterial("tikiThatchMat", scene);
        thatchMat.diffuseColor = new BABYLON.Color3(0.76, 0.62, 0.36);
        thatchMat.specularColor = new BABYLON.Color3(0.08, 0.07, 0.05);
        thatchMat.freeze();

        const lighthouseRedMat = new BABYLON.StandardMaterial("lighthouseRedMat", scene);
        lighthouseRedMat.diffuseColor = new BABYLON.Color3(0.82, 0.18, 0.16);
        lighthouseRedMat.specularColor = new BABYLON.Color3(0.25, 0.20, 0.20);
        lighthouseRedMat.freeze();

        const lighthouseWhiteMat = new BABYLON.StandardMaterial("lighthouseWhiteMat", scene);
        lighthouseWhiteMat.diffuseColor = new BABYLON.Color3(0.95, 0.94, 0.92);
        lighthouseWhiteMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
        lighthouseWhiteMat.freeze();

        const warmWindowMat = new BABYLON.StandardMaterial("warmWindowMat", scene);
        warmWindowMat.emissiveColor = new BABYLON.Color3(1.0, 0.78, 0.35);
        warmWindowMat.diffuseColor = new BABYLON.Color3(1.0, 0.85, 0.5);
        warmWindowMat.freeze();

        // 1. Coqueiros Tropicais com tronco segmentado, cocos e folhas arqueadas
        function createPalmTree(baseX, baseZ, height, leanDist, leanDir) {
            const baseY = evaluateIslandHeightCPU(baseX, baseZ) - 0.12;
            const path = [];
            const steps = 8;
            for (let i = 0; i <= steps; i++) {
                const f = i / steps;
                const curve = Math.pow(f, 1.5) * leanDist;
                const px = baseX + Math.cos(leanDir) * curve;
                const pz = baseZ + Math.sin(leanDir) * curve;
                const py = baseY + f * height;
                path.push(new BABYLON.Vector3(px, py, pz));
            }
            const trunk = BABYLON.MeshBuilder.CreateTube("palmTrunk", {
                path: path,
                radiusFunction: (idx) => {
                    const f = idx / steps;
                    const ringBump = (idx % 2 === 0) ? 1.06 : 0.96;
                    return 0.23 * (1.0 - f * 0.46) * ringBump;
                },
                tessellation: 9
            }, scene);
            trunk.material = trunkMat;
            trunk.isPickable = false;
            trunk.freezeWorldMatrix();
            registerOceanMesh(trunk, false);

            const topPos = path[path.length - 1];

            // Cacho de cocos no topo
            for (let c = 0; c < 3; c++) {
                const ca = (c / 3) * Math.PI * 2.0;
                const coco = BABYLON.MeshBuilder.CreateSphere("coconut", { diameter: 0.24, segments: 6 }, scene);
                coco.position.set(topPos.x + Math.cos(ca) * 0.14, topPos.y - 0.12, topPos.z + Math.sin(ca) * 0.14);
                coco.material = coconutMat;
                coco.isPickable = false;
                coco.freezeWorldMatrix();
                registerOceanMesh(coco, false);
            }

            // 8 Folhas de palmeira em duas camadas
            const numFronds = 8;
            for (let k = 0; k < numFronds; k++) {
                const ang = (k / numFronds) * Math.PI * 2.0 + leanDir * 0.25;
                const frondLen = (k % 2 === 0) ? 2.85 : 2.35;
                const lift = (k % 2 === 0) ? 0.52 : 0.72;
                const frondPath = [];
                for (let j = 0; j <= 5; j++) {
                    const jf = j / 5;
                    const rOut = jf * frondLen;
                    const drop = Math.sin(jf * Math.PI * 0.72) * lift - jf * jf * 1.05;
                    frondPath.push(new BABYLON.Vector3(
                        topPos.x + Math.cos(ang) * rOut,
                        topPos.y + drop,
                        topPos.z + Math.sin(ang) * rOut
                    ));
                }
                const frond = BABYLON.MeshBuilder.CreateRibbon("palmFrond", {
                    pathArray: [
                        frondPath.map((p, idx) => {
                            const w = Math.sin((idx / 5) * Math.PI) * 0.46;
                            return p.add(new BABYLON.Vector3(-Math.sin(ang) * w, -0.04, Math.cos(ang) * w));
                        }),
                        frondPath.map((p, idx) => p.add(new BABYLON.Vector3(0, 0.04, 0))),
                        frondPath.map((p, idx) => {
                            const w = Math.sin((idx / 5) * Math.PI) * 0.46;
                            return p.add(new BABYLON.Vector3(Math.sin(ang) * w, -0.04, -Math.cos(ang) * w));
                        })
                    ]
                }, scene);
                frond.material = frondMat;
                frond.isPickable = false;
                frond.freezeWorldMatrix();
                registerOceanMesh(frond, false);
            }
        }

        const palmSpecs = [
            [4.6, 2.8, 5.1, 1.5, 0.45],
            [5.8, -2.5, 4.7, 1.4, -0.35],
            [2.8, -5.6, 4.9, 1.6, -1.05],
            [-1.4, -6.2, 4.3, 1.3, -1.65],
            [-6.8, -0.8, 5.0, 1.7, 2.95],
            [-5.5, 5.4, 4.8, 1.5, 2.15],
            [-1.2, 6.2, 5.3, 1.6, 1.45],
            [2.4, 5.4, 4.4, 1.2, 0.95],
            [1.2, 1.4, 5.6, 1.1, 0.25],
            [-1.8, 0.8, 5.8, 1.0, 2.40],
            [3.5, -1.6, 4.1, 1.3, -0.15],
            [-7.4, 2.6, 4.2, 1.6, 2.65]
        ];
        palmSpecs.forEach(p => createPalmTree(p[0], p[1], p[2], p[3], p[4]));

        // 2. Arbustos Tropicais Costeiros
        const bushCoords = [
            [3.8, 1.8, 0.9], [4.9, -1.9, 0.85], [1.8, -4.2, 1.05],
            [-2.2, -3.5, 0.95], [-5.8, -2.2, 1.1], [-2.5, 4.8, 1.15],
            [0.8, 3.6, 0.9], [-0.4, -2.4, 0.8], [2.6, 0.9, 0.75],
            [-5.2, 1.2, 1.2], [-1.5, 2.8, 1.0], [5.2, 3.6, 0.8]
        ];
        bushCoords.forEach((bc, idx) => {
            const by = evaluateIslandHeightCPU(bc[0], bc[1]);
            const bush = BABYLON.MeshBuilder.CreateSphere("tropicalBush" + idx, {
                diameterX: bc[2] * 1.45,
                diameterY: bc[2] * 0.95,
                diameterZ: bc[2] * 1.35,
                segments: 5
            }, scene);
            bush.position.set(bc[0], by + bc[2] * 0.32, bc[1]);
            bush.rotation.y = idx * 1.1;
            bush.material = bushMat;
            bush.isPickable = false;
            bush.freezeWorldMatrix();
            registerOceanMesh(bush, false);
        });

        // 3. Penhascos Basálticos e Rochas Costeiras (Sea Stacks)
        const rockCoords = [
            [-8.8, 4.2, 2.2, 1.8], [-10.2, 1.5, 2.6, 2.4], [-8.5, -5.8, 2.1, 1.6],
            [-5.5, -8.2, 1.8, 1.4], [6.4, -7.8, 1.5, 1.1], [8.8, 5.2, 1.6, 1.2],
            [11.2, -4.2, 1.3, 0.95], [-3.2, 9.6, 1.9, 1.5], [-12.5, -2.4, 2.8, 3.1],
            [14.2, 6.8, 1.4, 1.1], [-5.2, 2.8, 2.4, 2.2], [-3.0, 3.6, 2.2, 1.9]
        ];
        rockCoords.forEach((rc, idx) => {
            const by = evaluateIslandHeightCPU(rc[0], rc[1]);
            const boulder = BABYLON.MeshBuilder.CreateSphere("islandBoulder" + idx, {
                diameterX: rc[2] * 1.5,
                diameterY: rc[3] * 1.2,
                diameterZ: rc[2] * 1.25,
                segments: 4
            }, scene);
            boulder.convertToFlatShadedMesh();
            boulder.position.set(rc[0], by + rc[3] * 0.32, rc[1]);
            boulder.rotation.set(idx * 0.4, idx * 1.3, idx * 0.25);
            boulder.material = rockMat;
            boulder.isPickable = false;
            boulder.freezeWorldMatrix();
            registerOceanMesh(boulder, true);
        });

        // 4. Complexo do Farol Costeiro no Promontório Sudoeste (-4.2, -4.4)
        const lhX = -4.2, lhZ = -4.4;
        const lhBaseY = evaluateIslandHeightCPU(lhX, lhZ) - 0.08;

        const lhFoundation = BABYLON.MeshBuilder.CreateCylinder("lhFoundation", {
            diameterBottom: 3.1, diameterTop: 2.6, height: 0.75, tessellation: 10
        }, scene);
        lhFoundation.position.set(lhX, lhBaseY + 0.35, lhZ);
        lhFoundation.material = rockMat;
        lhFoundation.isPickable = false;
        lhFoundation.freezeWorldMatrix();
        registerOceanMesh(lhFoundation, false);

        // Torre listrada vermelha e branca em 4 anéis
        const stripeHeights = [1.1, 1.0, 1.0, 0.9];
        let curY = lhBaseY + 0.72;
        for (let s = 0; s < 4; s++) {
            const hStripe = stripeHeights[s];
            const dBot = 2.15 - s * 0.22;
            const dTop = 2.15 - (s + 1) * 0.22;
            const seg = BABYLON.MeshBuilder.CreateCylinder("lhStripe" + s, {
                diameterBottom: dBot, diameterTop: dTop, height: hStripe, tessellation: 18
            }, scene);
            seg.position.set(lhX, curY + hStripe * 0.5, lhZ);
            seg.material = (s % 2 === 0) ? lighthouseWhiteMat : lighthouseRedMat;
            seg.isPickable = false;
            seg.freezeWorldMatrix();
            registerOceanMesh(seg, false);
            curY += hStripe;
        }

        const lhGallery = BABYLON.MeshBuilder.CreateCylinder("lhGallery", {
            diameter: 1.68, height: 0.18, tessellation: 18
        }, scene);
        lhGallery.position.set(lhX, curY + 0.09, lhZ);
        lhGallery.material = rockMat;
        lhGallery.isPickable = false;
        lhGallery.freezeWorldMatrix();
        registerOceanMesh(lhGallery, false);

        const lhBeacon = BABYLON.MeshBuilder.CreateCylinder("lighthouseBeacon", {
            diameter: 1.12, height: 0.82, tessellation: 16
        }, scene);
        lhBeacon.position.set(lhX, curY + 0.55, lhZ);
        lhBeacon.material = ledFixtureMat;
        lhBeacon.isPickable = false;
        lhBeacon.freezeWorldMatrix();
        registerOceanMesh(lhBeacon, false);

        const lhRoof = BABYLON.MeshBuilder.CreateCylinder("lighthouseRoof", {
            diameterBottom: 1.52, diameterTop: 0.08, height: 0.85, tessellation: 18
        }, scene);
        lhRoof.position.set(lhX, curY + 1.35, lhZ);
        lhRoof.material = lighthouseRedMat;
        lhRoof.isPickable = false;
        lhRoof.freezeWorldMatrix();
        registerOceanMesh(lhRoof, false);

        // Feixe óptico giratório do Farol
        const beamPivot = new BABYLON.TransformNode("lighthouseBeamPivot", scene);
        beamPivot.position.set(lhX, curY + 0.55, lhZ);
        window._lighthouseBeamPivot = beamPivot;

        const beamMat = new BABYLON.StandardMaterial("lighthouseBeamMat", scene);
        beamMat.emissiveColor = new BABYLON.Color3(0.45, 0.95, 1.0);
        beamMat.diffuseColor = new BABYLON.Color3(0.0, 0.0, 0.0);
        beamMat.alpha = 0.22;
        beamMat.backFaceCulling = false;
        beamMat.disableLighting = true;

        const beamCone = BABYLON.MeshBuilder.CreateCylinder("lighthouseBeamCone", {
            diameterTop: 0.35, diameterBottom: 4.2, height: 18.0, tessellation: 16
        }, scene);
        beamCone.rotation.z = Math.PI * 0.5;
        beamCone.position.set(9.2, 0, 0);
        beamCone.parent = beamPivot;
        beamCone.material = beamMat;
        beamCone.isPickable = false;
        registerOceanMesh(beamCone, false);

        // 5. Chalé Costeiro ao lado do Farol
        const cotX = -0.8, cotZ = -1.6;
        const cotY = evaluateIslandHeightCPU(cotX, cotZ);
        const cotBody = BABYLON.MeshBuilder.CreateBox("cottageBody", { width: 2.4, height: 1.45, depth: 1.85 }, scene);
        cotBody.position.set(cotX, cotY + 0.65, cotZ);
        cotBody.rotation.y = 0.35;
        cotBody.material = lighthouseWhiteMat;
        cotBody.isPickable = false;
        cotBody.freezeWorldMatrix();
        registerOceanMesh(cotBody, false);

        const cotRoof = BABYLON.MeshBuilder.CreateCylinder("cottageRoof", {
            diameterBottom: 2.65, diameterTop: 0.2, height: 1.05, tessellation: 4
        }, scene);
        cotRoof.scaling.z = 0.82;
        cotRoof.position.set(cotX, cotY + 1.85, cotZ);
        cotRoof.rotation.y = 0.35 + Math.PI * 0.25;
        cotRoof.material = lighthouseRedMat;
        cotRoof.isPickable = false;
        cotRoof.freezeWorldMatrix();
        registerOceanMesh(cotRoof, false);

        const cotWin = BABYLON.MeshBuilder.CreateBox("cottageWindow", { width: 0.55, height: 0.42, depth: 1.92 }, scene);
        cotWin.position.set(cotX, cotY + 0.75, cotZ);
        cotWin.rotation.y = 0.35;
        cotWin.material = warmWindowMat;
        cotWin.isPickable = false;
        cotWin.freezeWorldMatrix();
        registerOceanMesh(cotWin, false);

        // 6. Quiosque Tiki de Palha e Píer de Madeira na Enseada Leste
        const gazeboX = 7.4, gazeboZ = 0.0;
        const gazeboY = evaluateIslandHeightCPU(gazeboX, gazeboZ);
        const gazeboFloor = BABYLON.MeshBuilder.CreateCylinder("gazeboFloor", { diameter: 3.1, height: 0.16, tessellation: 8 }, scene);
        gazeboFloor.position.set(gazeboX, 0.56, gazeboZ);
        gazeboFloor.material = woodMat;
        gazeboFloor.isPickable = false;
        gazeboFloor.freezeWorldMatrix();
        registerOceanMesh(gazeboFloor, false);

        for (let gp = 0; gp < 4; gp++) {
            const ga = (gp / 4) * Math.PI * 2.0 + Math.PI * 0.25;
            const post = BABYLON.MeshBuilder.CreateCylinder("gazeboPost" + gp, { diameter: 0.16, height: 2.3, tessellation: 8 }, scene);
            post.position.set(gazeboX + Math.cos(ga) * 1.15, 1.15, gazeboZ + Math.sin(ga) * 1.15);
            post.material = woodMat;
            post.isPickable = false;
            post.freezeWorldMatrix();
            registerOceanMesh(post, true);
        }

        const gazeboRoof = BABYLON.MeshBuilder.CreateCylinder("gazeboRoof", {
            diameterBottom: 3.8, diameterTop: 0.15, height: 1.35, tessellation: 12
        }, scene);
        gazeboRoof.position.set(gazeboX, 2.65, gazeboZ);
        gazeboRoof.material = thatchMat;
        gazeboRoof.isPickable = false;
        gazeboRoof.freezeWorldMatrix();
        registerOceanMesh(gazeboRoof, false);

        const pierStartR = 8.8;
        const pierEndR = 17.6;
        for (let p = 0; p < 15; p++) {
            const pr = pierStartR + (p / 14) * (pierEndR - pierStartR);
            const plank = BABYLON.MeshBuilder.CreateBox("pierPlank" + p, { width: 1.75, height: 0.09, depth: 0.48 }, scene);
            plank.position.set(pr, 0.56, 0);
            plank.rotation.y = Math.PI * 0.5;
            plank.material = woodMat;
            plank.isPickable = false;
            plank.freezeWorldMatrix();
            registerOceanMesh(plank, false);

            if (p % 3 === 0 || p === 14) {
                [-0.74, 0.74].forEach((zSide) => {
                    const post = BABYLON.MeshBuilder.CreateCylinder("pierPost", { diameter: 0.18, height: 3.4, tessellation: 8 }, scene);
                    post.position.set(pr, -0.75, zSide);
                    post.material = woodMat;
                    post.isPickable = false;
                    post.freezeWorldMatrix();
                    registerOceanMesh(post, true);
                });
            }
        }

        // 7. Barco Tropical Ancorado ao lado do Píer
        const boatPivot = new BABYLON.TransformNode("islandBoatPivot", scene);
        boatPivot.position.set(14.6, 0.08, 2.35);
        window._islandBoatPivot = boatPivot;

        const boatHull = BABYLON.MeshBuilder.CreateSphere("boatHull", {
            diameterX: 3.4, diameterY: 0.75, diameterZ: 1.25, segments: 10
        }, scene);
        boatHull.scaling.y = 0.65;
        boatHull.parent = boatPivot;
        boatHull.material = lighthouseWhiteMat;
        boatHull.isPickable = false;
        registerOceanMesh(boatHull, true);

        const boatTrim = BABYLON.MeshBuilder.CreateBox("boatBench", { width: 1.6, height: 0.12, depth: 0.85 }, scene);
        boatTrim.position.set(0, 0.16, 0);
        boatTrim.parent = boatPivot;
        boatTrim.material = woodMat;
        boatTrim.isPickable = false;
        registerOceanMesh(boatTrim, false);

        const boatMast = BABYLON.MeshBuilder.CreateCylinder("boatMast", { diameter: 0.09, height: 2.8, tessellation: 8 }, scene);
        boatMast.position.set(0.2, 1.4, 0);
        boatMast.parent = boatPivot;
        boatMast.material = woodMat;
        boatMast.isPickable = false;
        registerOceanMesh(boatMast, false);
    }
    buildIsolatedIslandScene();

    // =========================================================================
    // 8. INTERACTIVE BUOYANT FLOATING OBJECTS (SHARED ACROSS POOL & ISLAND LAGOON)
    // =========================================================================
    const buoyantObjects = [];

    function createObjectMaterial(name, col1, col2, patternId) {
        const mat = new BABYLON.ShaderMaterial(name, scene, {
            vertex: "buoyantObject",
            fragment: "buoyantObject"
        }, {
            attributes: ["position", "normal", "uv"],
            uniforms: sharedUniformNames
        });
        mat.onBindObservable.add(() => {
            bindCommonShaderUniforms(mat);
            mat.setVector3("uObjectColor1", col1);
            mat.setVector3("uObjectColor2", col2);
            mat.setFloat("uObjectPattern", patternId);
        });
        return mat;
    }

    function registerBuoyantObject(mesh, radius, density, offsetY = 0, poolHomeXZ = [0, 0], oceanHomeXZ = [14, 4]) {
        mesh.isPickable = true;
        if (isValidRefractionMesh(mesh)) {
            sharedFloatingRefractionMeshes.push(mesh);
        }
        const obj = {
            mesh: mesh,
            radius: radius,
            density: density,
            offsetY: offsetY,
            poolHomeXZ: poolHomeXZ,
            oceanHomeXZ: oceanHomeXZ,
            vy: 0,
            vx: (Math.random() - 0.5) * 0.25,
            vz: (Math.random() - 0.5) * 0.25,
            rotVelX: 0,
            rotVelZ: 0,
            wasAboveWater: false
        };
        buoyantObjects.push(obj);
        return obj;
    }

    const beachBallMesh = BABYLON.MeshBuilder.CreateSphere("beachBall", { diameter: 0.92, segments: 28 }, scene);
    beachBallMesh.position.set(-2.3, 0.25, 0.8);
    beachBallMesh.material = createObjectMaterial(
        "beachBallMat",
        new BABYLON.Vector3(1, 1, 1),
        new BABYLON.Vector3(0.1, 0.6, 0.95),
        0.0
    );
    registerBuoyantObject(beachBallMesh, 0.46, 0.26, 0.14, [-2.3, 0.8], [15.5, 4.2]);

    const floatRingMesh = BABYLON.MeshBuilder.CreateTorus("floatRing", {
        diameter: 1.45,
        thickness: 0.42,
        tessellation: 36
    }, scene);
    floatRingMesh.position.set(2.1, 0.08, -0.9);
    floatRingMesh.material = createObjectMaterial(
        "floatRingMat",
        new BABYLON.Vector3(0.98, 0.34, 0.44),
        new BABYLON.Vector3(0.98, 0.96, 0.95),
        1.0
    );
    registerBuoyantObject(floatRingMesh, 0.75, 0.32, 0.04, [2.1, -0.9], [14.2, -4.6]);

    const goldOrbMesh = BABYLON.MeshBuilder.CreateSphere("goldOrb", { diameter: 0.66, segments: 24 }, scene);
    goldOrbMesh.position.set(0.4, 0.12, 1.9);
    goldOrbMesh.material = createObjectMaterial(
        "goldOrbMat",
        new BABYLON.Vector3(1.0, 0.82, 0.14),
        new BABYLON.Vector3(0.98, 0.45, 0.08),
        2.0
    );
    registerBuoyantObject(goldOrbMesh, 0.33, 0.46, 0.02, [0.4, 1.9], [18.5, 1.2]);

    const diveOrbMesh = BABYLON.MeshBuilder.CreateSphere("diveOrb", { diameter: 0.62, segments: 24 }, scene);
    diveOrbMesh.position.set(-1.1, -0.5, -1.8);
    diveOrbMesh.material = createObjectMaterial(
        "diveOrbMat",
        new BABYLON.Vector3(0.08, 0.94, 0.72),
        new BABYLON.Vector3(0.04, 0.48, 0.88),
        2.0
    );
    registerBuoyantObject(diveOrbMesh, 0.31, 0.74, -0.15, [-1.1, -1.8], [12.8, -2.1]);

    // =========================================================================
    // 9. RADIAL CLIPMAP OCEAN MESH, POOL WATER MESH & DYNAMIC RTT OPTIMIZER
    // =========================================================================
    let poolWaterMesh = null;
    let oceanWaterMesh = null;

    function createRadialClipmapOceanMesh(rings, sectors, maxRadius) {
        const positions = [];
        const uvs = [];
        const indices = [];

        for (let r = 0; r <= rings; r++) {
            const t = r / rings;
            const radius = Math.pow(t, 2.15) * maxRadius;
            for (let s = 0; s <= sectors; s++) {
                const u = s / sectors;
                const theta = u * Math.PI * 2.0;
                const x = Math.cos(theta) * radius;
                const z = Math.sin(theta) * radius;
                positions.push(x, 0.0, z);
                uvs.push(u, t);
            }
        }

        const stride = sectors + 1;
        for (let r = 0; r < rings; r++) {
            for (let s = 0; s < sectors; s++) {
                const i0 = r * stride + s;
                const i1 = i0 + 1;
                const i2 = (r + 1) * stride + s;
                const i3 = i2 + 1;
                indices.push(i0, i1, i2);
                indices.push(i1, i3, i2);
            }
        }

        const mesh = new BABYLON.Mesh("oceanWaterSurface", scene);
        const vertexData = new BABYLON.VertexData();
        vertexData.positions = positions;
        vertexData.uvs = uvs;
        vertexData.indices = indices;
        vertexData.applyToMesh(mesh);
        mesh.material = waterSurfaceMat;
        mesh.isPickable = true;
        return mesh;
    }

    function rebuildWaterMeshesForProfile(prof) {
        if (poolWaterMesh) poolWaterMesh.dispose();
        if (oceanWaterMesh) oceanWaterMesh.dispose();

        poolWaterMesh = BABYLON.MeshBuilder.CreateGround("poolWaterSurface", {
            width: POOL_HALF_X * 2,
            height: POOL_HALF_Z * 2,
            subdivisionsX: prof.poolSubdiv,
            subdivisionsY: Math.round(prof.poolSubdiv * 0.75),
            updatable: false
        }, scene);
        poolWaterMesh.position.y = 0.0;
        poolWaterMesh.material = waterSurfaceMat;
        poolWaterMesh.isPickable = true;

        oceanWaterMesh = createRadialClipmapOceanMesh(prof.oceanRings, prof.oceanSectors, OCEAN_RADIUS);

        poolWaterMesh.setEnabled(simState.sceneMode === 0);
        oceanWaterMesh.setEnabled(simState.sceneMode === 1);
    }

    let refractionRTT = null;
    function syncRefractionRenderList() {
        if (!refractionRTT) return;
        const baseList = (simState.sceneMode === 0) ? poolRefractionMeshes : oceanRefractionMeshes;
        refractionRTT.renderList = baseList.concat(sharedFloatingRefractionMeshes).filter(isValidRefractionMesh);
    }

    function rebuildRefractionRTT(size, refreshInterval) {
        if (refractionRTT) {
            const idx = scene.customRenderTargets.indexOf(refractionRTT);
            if (idx !== -1) scene.customRenderTargets.splice(idx, 1);
            refractionRTT.dispose();
        }
        refractionRTT = new BABYLON.RenderTargetTexture(
            "refractionRTT",
            { width: size, height: size },
            scene,
            false,
            true
        );
        refractionRTT.refreshRate = refreshInterval;
        refractionRTT.renderParticles = (simState.qualityKey === 'high' || simState.qualityKey === 'ultra');
        syncRefractionRenderList();
        scene.customRenderTargets.push(refractionRTT);
        waterSurfaceMat.setTexture("uRefractionSampler", refractionRTT);
    }

    rebuildWaterMeshesForProfile(QUALITY_PROFILES.high);
    rebuildRefractionRTT(QUALITY_PROFILES.high.rttSize, QUALITY_PROFILES.high.rttInterval);

    // =========================================================================
    // 10. PARTICLE SYSTEMS (SPLASH DROPLETS & UNDERWATER MICRO-BUBBLES)
    // =========================================================================
    function createParticleTexture() {
        const pTex = new BABYLON.DynamicTexture("particleTex", { width: 64, height: 64 }, scene, false);
        const ctx = pTex.getContext();
        const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
        grad.addColorStop(0, "rgba(255, 255, 255, 1.0)");
        grad.addColorStop(0.5, "rgba(185, 242, 255, 0.65)");
        grad.addColorStop(1, "rgba(56, 189, 248, 0.0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
        pTex.update();
        return pTex;
    }
    const dropletTex = createParticleTexture();

    const splashParticles = new BABYLON.ParticleSystem("splashParticles", 350, scene);
    splashParticles.particleTexture = dropletTex;
    splashParticles.emitter = new BABYLON.Vector3(0, 0, 0);
    splashParticles.minEmitBox = new BABYLON.Vector3(-0.15, 0, -0.15);
    splashParticles.maxEmitBox = new BABYLON.Vector3(0.15, 0.05, 0.15);
    splashParticles.color1 = new BABYLON.Color4(0.85, 0.97, 1.0, 0.9);
    splashParticles.color2 = new BABYLON.Color4(0.45, 0.88, 1.0, 0.75);
    splashParticles.colorDead = new BABYLON.Color4(0.2, 0.7, 0.95, 0.0);
    splashParticles.minSize = 0.04;
    splashParticles.maxSize = 0.14;
    splashParticles.minLifeTime = 0.25;
    splashParticles.maxLifeTime = 0.65;
    splashParticles.emitRate = 0;
    splashParticles.gravity = new BABYLON.Vector3(0, -9.8, 0);
    splashParticles.direction1 = new BABYLON.Vector3(-1.4, 2.6, -1.4);
    splashParticles.direction2 = new BABYLON.Vector3(1.4, 4.4, 1.4);
    splashParticles.start();

    function emitSplashBurst(x, z, count = 30) {
        splashParticles.emitter.set(x, 0.05, z);
        splashParticles.manualEmitCount = count;
    }

    const bubbleParticles = new BABYLON.ParticleSystem("underwaterBubbles", 280, scene);
    bubbleParticles.particleTexture = dropletTex;
    bubbleParticles.emitter = new BABYLON.Vector3(0, -1.6, 0);
    bubbleParticles.minEmitBox = new BABYLON.Vector3(-6.5, -1.4, -4.5);
    bubbleParticles.maxEmitBox = new BABYLON.Vector3(6.5, 1.3, 4.5);
    bubbleParticles.color1 = new BABYLON.Color4(0.65, 0.95, 1.0, 0.45);
    bubbleParticles.color2 = new BABYLON.Color4(0.35, 0.85, 1.0, 0.30);
    bubbleParticles.colorDead = new BABYLON.Color4(0.2, 0.7, 1.0, 0.0);
    bubbleParticles.minSize = 0.025;
    bubbleParticles.maxSize = 0.075;
    bubbleParticles.minLifeTime = 2.5;
    bubbleParticles.maxLifeTime = 5.0;
    bubbleParticles.emitRate = 45;
    bubbleParticles.gravity = new BABYLON.Vector3(0, 0.25, 0);
    bubbleParticles.direction1 = new BABYLON.Vector3(-0.08, 0.12, -0.08);
    bubbleParticles.direction2 = new BABYLON.Vector3(0.08, 0.32, 0.08);
    bubbleParticles.start();

    // =========================================================================
    // 11. INTERACTIVE POINTER & PHYSICS ENGINE (POOL & OCEAN SURFACE)
    // =========================================================================
    let isDraggingWater = false;
    let lastDragRipplePos = new BABYLON.Vector2(999, 999);

    function getActiveWaterMesh() {
        return (simState.sceneMode === 0) ? poolWaterMesh : oceanWaterMesh;
    }

    scene.onPointerObservable.add((pointerInfo) => {
        const currentWater = getActiveWaterMesh();
        switch (pointerInfo.type) {
            case BABYLON.PointerEventTypes.POINTERDOWN: {
                if (pointerInfo.event.button !== 0 && pointerInfo.event.pointerType === 'mouse') return;
                const pick = scene.pick(scene.pointerX, scene.pointerY);
                if (!pick || !pick.hit) return;

                const hitObj = buoyantObjects.find(o => o.mesh === pick.pickedMesh);
                if (hitObj) {
                    hitObj.vy -= 4.2;
                    hitObj.vx += (Math.random() - 0.5) * 2.2;
                    hitObj.vz += (Math.random() - 0.5) * 2.2;
                    hitObj.rotVelX += (Math.random() - 0.5) * 6.0;
                    hitObj.rotVelZ += (Math.random() - 0.5) * 6.0;
                    spawnRipple(hitObj.mesh.position.x, hitObj.mesh.position.z, 0.14, false);
                    emitSplashBurst(hitObj.mesh.position.x, hitObj.mesh.position.z, 40);
                    soundEngine.playSplash(1.0);
                    return;
                }

                if (pick.pickedMesh === currentWater && pick.pickedPoint) {
                    isDraggingWater = true;
                    camera.detachControl();
                    const pt = pick.pickedPoint;
                    spawnRipple(pt.x, pt.z, 0.10, true);
                    emitSplashBurst(pt.x, pt.z, 18);
                    lastDragRipplePos.set(pt.x, pt.z);

                    buoyantObjects.forEach(o => {
                        const dx = o.mesh.position.x - pt.x;
                        const dz = o.mesh.position.z - pt.z;
                        const d = Math.sqrt(dx * dx + dz * dz) + 0.1;
                        if (d < 3.5) {
                            const push = (3.5 - d) * 0.45;
                            o.vx += (dx / d) * push;
                            o.vz += (dz / d) * push;
                            o.vy += push * 0.5;
                        }
                    });
                }
                break;
            }

            case BABYLON.PointerEventTypes.POINTERMOVE: {
                if (!isDraggingWater) return;
                const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m === currentWater);
                if (pick && pick.hit && pick.pickedPoint) {
                    const pt = pick.pickedPoint;
                    const distMove = Math.hypot(pt.x - lastDragRipplePos.x, pt.z - lastDragRipplePos.y);
                    if (distMove > 0.30) {
                        spawnRipple(pt.x, pt.z, 0.08, true);
                        lastDragRipplePos.set(pt.x, pt.z);
                    }
                }
                break;
            }

            case BABYLON.PointerEventTypes.POINTERUP: {
                if (isDraggingWater) {
                    isDraggingWater = false;
                    camera.attachControl(canvas, true);
                }
                break;
            }
        }
    });

    // =========================================================================
    // 12. ARCHIMEDES BUOYANCY & ISLAND SHORE HYDRODYNAMICS STEP
    // =========================================================================
    function updateBuoyancyPhysics(dt) {
        const clampedDt = Math.min(dt, 0.04);
        const gravity = 9.81;
        const isOcean = (simState.sceneMode === 1);

        for (let i = 0; i < buoyantObjects.length; i++) {
            const obj = buoyantObjects[i];
            const pos = obj.mesh.position;

            const waveSample = evaluateWaterHeightAndNormalCPU(pos.x, pos.z, simState.time);
            const waterY = waveSample.height + obj.offsetY;

            const bottomY = pos.y - obj.radius;
            const submergedDepth = Math.max(0.0, Math.min(obj.radius * 2.0, waterY - bottomY));
            const submergedRatio = submergedDepth / (obj.radius * 2.0);

            const isAbove = submergedRatio < 0.05;
            if (obj.wasAboveWater && !isAbove && obj.vy < -1.4) {
                spawnRipple(pos.x, pos.z, Math.min(0.16, Math.abs(obj.vy) * 0.025), false);
                emitSplashBurst(pos.x, pos.z, 35);
                soundEngine.playSplash(Math.min(1.2, Math.abs(obj.vy) * 0.22));
            }
            obj.wasAboveWater = isAbove;

            const buoyantForce = (submergedRatio / obj.density) * gravity;
            const netAccelY = buoyantForce - gravity;
            obj.vy += netAccelY * clampedDt;

            if (submergedRatio > 0.05) {
                const slopePush = isOcean ? 3.4 : 2.6;
                obj.vx += waveSample.normal.x * slopePush * clampedDt;
                obj.vz += waveSample.normal.z * slopePush * clampedDt;

                const waterDragY = Math.pow(0.12, clampedDt);
                const waterDragXZ = Math.pow(0.38, clampedDt);
                obj.vy *= waterDragY;
                obj.vx *= waterDragXZ;
                obj.vz *= waterDragXZ;
            } else {
                obj.vx *= Math.pow(0.92, clampedDt);
                obj.vz *= Math.pow(0.92, clampedDt);
            }

            pos.x += obj.vx * clampedDt;
            pos.y += obj.vy * clampedDt;
            pos.z += obj.vz * clampedDt;

            if (!isOcean) {
                if (pos.y - obj.radius < -POOL_DEPTH) {
                    pos.y = -POOL_DEPTH + obj.radius;
                    obj.vy = Math.abs(obj.vy) * 0.45;
                }
                const boundX = POOL_HALF_X - obj.radius - 0.12;
                const boundZ = POOL_HALF_Z - obj.radius - 0.12;
                if (pos.x > boundX) { pos.x = boundX; obj.vx = -Math.abs(obj.vx) * 0.75; spawnRipple(pos.x, pos.z, 0.05, false); }
                if (pos.x < -boundX) { pos.x = -boundX; obj.vx = Math.abs(obj.vx) * 0.75; spawnRipple(pos.x, pos.z, 0.05, false); }
                if (pos.z > boundZ) { pos.z = boundZ; obj.vz = -Math.abs(obj.vz) * 0.75; spawnRipple(pos.x, pos.z, 0.05, false); }
                if (pos.z < -boundZ) { pos.z = -boundZ; obj.vz = Math.abs(obj.vz) * 0.75; spawnRipple(pos.x, pos.z, 0.05, false); }
            } else {
                const groundY = evaluateIslandHeightCPU(pos.x, pos.z);
                if (pos.y - obj.radius < groundY) {
                    pos.y = groundY + obj.radius;
                    obj.vy = Math.abs(obj.vy) * 0.35;
                    const rDist = Math.hypot(pos.x, pos.z) + 0.001;
                    obj.vx += (pos.x / rDist) * 1.8 * clampedDt;
                    obj.vz += (pos.z / rDist) * 1.8 * clampedDt;
                }
                const distFromIsland = Math.hypot(pos.x, pos.z);
                if (distFromIsland > 32.0) {
                    const pull = (distFromIsland - 32.0) * 0.65 * clampedDt;
                    obj.vx -= (pos.x / distFromIsland) * pull;
                    obj.vz -= (pos.z / distFromIsland) * pull;
                }
            }

            for (let j = i + 1; j < buoyantObjects.length; j++) {
                const other = buoyantObjects[j];
                const dx = other.mesh.position.x - pos.x;
                const dz = other.mesh.position.z - pos.z;
                const minDist = obj.radius + other.radius + 0.08;
                const dist = Math.hypot(dx, dz);
                if (dist < minDist && dist > 0.001) {
                    const overlap = (minDist - dist) * 0.5;
                    const nx = dx / dist;
                    const nz = dz / dist;
                    pos.x -= nx * overlap;
                    pos.z -= nz * overlap;
                    other.mesh.position.x += nx * overlap;
                    other.mesh.position.z += nz * overlap;

                    const relVx = other.vx - obj.vx;
                    const relVz = other.vz - obj.vz;
                    const sepVel = relVx * nx + relVz * nz;
                    if (sepVel < 0) {
                        const imp = sepVel * 0.85;
                        obj.vx += nx * imp;
                        obj.vz += nz * imp;
                        other.vx -= nx * imp;
                        other.vz -= nz * imp;
                    }
                }
            }

            obj.rotVelX *= Math.pow(0.25, clampedDt);
            obj.rotVelZ *= Math.pow(0.25, clampedDt);
            const targetRotZ = -waveSample.normal.x * 0.85;
            const targetRotX = waveSample.normal.z * 0.85;
            obj.mesh.rotation.z = BABYLON.Scalar.Lerp(obj.mesh.rotation.z, targetRotZ, clampedDt * 5.0) + obj.rotVelZ * clampedDt;
            obj.mesh.rotation.x = BABYLON.Scalar.Lerp(obj.mesh.rotation.x, targetRotX, clampedDt * 5.0) + obj.rotVelX * clampedDt;
            obj.mesh.rotation.y += (obj.vx * 0.35 - obj.vz * 0.25) * clampedDt;

            if (i < 6) {
                floatingObjectsUniform[i * 4 + 0] = pos.x;
                floatingObjectsUniform[i * 4 + 1] = pos.y;
                floatingObjectsUniform[i * 4 + 2] = pos.z;
                floatingObjectsUniform[i * 4 + 3] = obj.radius;
            }
        }
    }

    // =========================================================================
    // 13. SCENARIO SWITCHER, QUALITY OPTIMIZER & UI EVENT LISTENERS
    // =========================================================================
    const camController = {
        mode: 'orbit', // 'orbit' | 'free' | 'cinematic'
        isTransitioning: false,
        transElapsed: 0,
        transDuration: 0.95,
        startAlpha: 0, startBeta: 0, startRadius: 0,
        startTarget: new BABYLON.Vector3(),
        endAlpha: 0, endBeta: 0, endRadius: 0,
        endTarget: new BABYLON.Vector3(),
        cinematicTime: 0,
        cinematicBaseAlpha: -Math.PI * 0.62,
        cinematicBaseRadius: 15.5,
        cinematicCenter: new BABYLON.Vector3(0, -0.45, 0),
        flySpeed: 10.0,
        keys: { forward: false, backward: false, left: false, right: false, up: false, down: false, boost: false }
    };

    function stopAllCameraMotion() {
        scene.stopAnimation(camera);
        scene.stopAnimation(camera.target);
        camController.isTransitioning = false;
        camera.inertialAlphaOffset = 0;
        camera.inertialBetaOffset = 0;
        camera.inertialRadiusOffset = 0;
        camera.inertialPanningX = 0;
        camera.inertialPanningY = 0;
    }

    function restoreOrbitLimits() {
        camera.lowerRadiusLimit = 2.0;
        camera.upperRadiusLimit = 165.0;
        camera.lowerBetaLimit = 0.05;
        camera.upperBetaLimit = Math.PI * 0.64;
        camera.angularSensibilityX = 1000;
        camera.angularSensibilityY = 1000;
        camera.panningSensibility = 350;
        camera.wheelPrecision = 18;
    }

    function updateCameraModeUI(activeId) {
        const allIds = ['camOrbitFixed', 'camFreeFly', 'camCinematic', 'camOverview', 'camGrazing', 'camTopDown', 'camUnderwater'];
        allIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('active', id === activeId);
        });
    }

    function animateCameraTo(alpha, beta, radius, targetX, targetY, targetZ, activeBtnId = null) {
        stopAllCameraMotion();
        camController.mode = 'orbit';
        restoreOrbitLimits();

        // Normaliza o ângulo atual para evitar giros desnecessários de 360°
        let currentAlpha = camera.alpha;
        let deltaAlpha = (alpha - currentAlpha) % (Math.PI * 2);
        if (deltaAlpha > Math.PI) deltaAlpha -= Math.PI * 2;
        if (deltaAlpha < -Math.PI) deltaAlpha += Math.PI * 2;

        camController.startAlpha = currentAlpha;
        camController.startBeta = camera.beta;
        camController.startRadius = camera.radius;
        camController.startTarget.copyFrom(camera.target);

        camController.endAlpha = currentAlpha + deltaAlpha;
        camController.endBeta = BABYLON.Scalar.Clamp(beta, camera.lowerBetaLimit, camera.upperBetaLimit);
        camController.endRadius = BABYLON.Scalar.Clamp(radius, camera.lowerRadiusLimit, camera.upperRadiusLimit);
        camController.endTarget.set(targetX, targetY, targetZ);

        camController.transElapsed = 0;
        camController.transDuration = 0.90;
        camController.isTransitioning = true;

        if (activeBtnId) {
            updateCameraModeUI(activeBtnId);
        }
    }

    // Modo 1: Ponto Fixo (Órbita Clássica travada no centro do cenário)
    function enableFixedOrbitMode(recenterTarget = true) {
        const wasFree = (camController.mode === 'free');
        const eyePos = camera.position.clone();
        stopAllCameraMotion();
        camController.mode = 'orbit';
        restoreOrbitLimits();

        const fixedTarget = (simState.sceneMode === 0)
            ? new BABYLON.Vector3(0, -0.45, 0)
            : new BABYLON.Vector3(2.0, 0.5, 0);

        if (wasFree || recenterTarget) {
            const offset = eyePos.subtract(fixedTarget);
            const dist = BABYLON.Scalar.Clamp(offset.length(), 4.5, 90.0);
            const targetAlpha = Math.atan2(offset.z, offset.x);
            const targetBeta = BABYLON.Scalar.Clamp(Math.acos(BABYLON.Scalar.Clamp(offset.y / Math.max(0.001, offset.length()), -1, 1)), 0.12, Math.PI * 0.60);
            animateCameraTo(targetAlpha, targetBeta, dist, fixedTarget.x, fixedTarget.y, fixedTarget.z, 'camOrbitFixed');
        } else {
            updateCameraModeUI('camOrbitFixed');
        }

        document.getElementById('bottomHintText').innerHTML =
            "<strong>Modo Ponto Fixo:</strong> Arraste para orbitar ao redor do ponto central ou use o scroll para zoom.";
    }

    // Modo 2: Câmera Livre em 1ª Pessoa (WASD / Setas / E-Q / Mouse Look)
    function enableFreeFlyMode() {
        if (camController.mode === 'free') return;
        const eyePos = camera.position.clone();
        const forward = camera.target.subtract(eyePos).normalize();

        stopAllCameraMotion();
        camController.mode = 'free';

        const pivotDist = 0.15;
        camera.lowerRadiusLimit = pivotDist;
        camera.upperRadiusLimit = pivotDist;
        camera.lowerBetaLimit = 0.05;
        camera.upperBetaLimit = Math.PI - 0.05;
        camera.angularSensibilityX = 750;
        camera.angularSensibilityY = 750;
        camera.panningSensibility = 65;

        camera.radius = pivotDist;
        camera.target.copyFrom(eyePos.add(forward.scale(pivotDist)));

        updateCameraModeUI('camFreeFly');
        document.getElementById('bottomHintText').innerHTML =
            "<strong>Câmera Livre:</strong> Use <strong>WASD</strong> ou <strong>Setas</strong> para voar, <strong>E/Espaço</strong> subir, <strong>Q/C</strong> descer, <strong>Shift</strong> turbo e arraste o mouse para olhar.";
    }

    // Modo 3: Cinemático Suave (Órbita de Drone Real sem bugs)
    function toggleCinematicMode() {
        if (camController.mode === 'cinematic') {
            enableFixedOrbitMode(false);
            return;
        }
        if (camController.mode === 'free') {
            enableFixedOrbitMode(true);
        }
        stopAllCameraMotion();
        restoreOrbitLimits();

        camController.mode = 'cinematic';
        camController.cinematicTime = 0;
        camController.cinematicBaseAlpha = camera.alpha;
        camController.cinematicBaseRadius = BABYLON.Scalar.Clamp(
            camera.radius,
            simState.sceneMode === 0 ? 11.0 : 26.0,
            simState.sceneMode === 0 ? 19.0 : 48.0
        );
        camController.cinematicCenter.copyFrom(
            simState.sceneMode === 0 ? new BABYLON.Vector3(0, -0.40, 0) : new BABYLON.Vector3(2.0, 0.5, 0)
        );

        updateCameraModeUI('camCinematic');
        document.getElementById('bottomHintText').innerHTML =
            "<strong>Modo Cinemático Ativo:</strong> Movimento suave de drone. Clique em <strong>🎯 Ponto Fixo</strong> ou <strong>🕊️ Câmera Livre</strong> para assumir o controle.";
    }

    // Controles de Teclado e Scroll para o Modo Câmera Livre
    window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        const code = e.code;
        if (code === 'KeyW' || code === 'ArrowUp') camController.keys.forward = true;
        if (code === 'KeyS' || code === 'ArrowDown') camController.keys.backward = true;
        if (code === 'KeyA' || code === 'ArrowLeft') camController.keys.left = true;
        if (code === 'KeyD' || code === 'ArrowRight') camController.keys.right = true;
        if (code === 'KeyE' || code === 'Space') camController.keys.up = true;
        if (code === 'KeyQ' || code === 'KeyC') camController.keys.down = true;
        if (code === 'ShiftLeft' || code === 'ShiftRight') camController.keys.boost = true;
    });

    window.addEventListener('keyup', (e) => {
        const code = e.code;
        if (code === 'KeyW' || code === 'ArrowUp') camController.keys.forward = false;
        if (code === 'KeyS' || code === 'ArrowDown') camController.keys.backward = false;
        if (code === 'KeyA' || code === 'ArrowLeft') camController.keys.left = false;
        if (code === 'KeyD' || code === 'ArrowRight') camController.keys.right = false;
        if (code === 'KeyE' || code === 'Space') camController.keys.up = false;
        if (code === 'KeyQ' || code === 'KeyC') camController.keys.down = false;
        if (code === 'ShiftLeft' || code === 'ShiftRight') camController.keys.boost = false;
    });

    canvas.addEventListener('wheel', (e) => {
        if (camController.mode === 'free') {
            const forward = camera.target.subtract(camera.position).normalize();
            const step = -Math.sign(e.deltaY) * 1.35;
            camera.target.addInPlace(forward.scale(step));
        }
    }, { passive: true });

    // Se o usuário clicar na cena durante uma transição automática, entrega o controle na hora
    canvas.addEventListener('pointerdown', () => {
        if (camController.isTransitioning) {
            camController.isTransitioning = false;
        }
    });

    // Atualização por frame da câmera (Transição Smootherstep, Voo Livre e Drone Cinemático)
    scene.onBeforeRenderObservable.add(() => {
        const dt = Math.min(engine.getDeltaTime() * 0.001, 0.05);

        // No modo Câmera Livre, desativa o bloqueio de clique na água para permitir girar a visão livremente
        if (poolWaterMesh) poolWaterMesh.isPickable = (camController.mode !== 'free');
        if (oceanWaterMesh) oceanWaterMesh.isPickable = (camController.mode !== 'free');

        // 1. Interpolação suave de transição entre ângulos (sem loop infinito!)
        if (camController.isTransitioning) {
            camController.transElapsed += dt;
            const rawT = Math.min(1.0, camController.transElapsed / camController.transDuration);
            // Curva Smootherstep de Ken Perlin (aceleração e desaceleração suaves)
            const t = rawT * rawT * rawT * (rawT * (rawT * 6.0 - 15.0) + 10.0);

            camera.alpha = BABYLON.Scalar.Lerp(camController.startAlpha, camController.endAlpha, t);
            camera.beta = BABYLON.Scalar.Lerp(camController.startBeta, camController.endBeta, t);
            camera.radius = BABYLON.Scalar.Lerp(camController.startRadius, camController.endRadius, t);
            BABYLON.Vector3.LerpToRef(camController.startTarget, camController.endTarget, t, camera.target);

            if (rawT >= 1.0) {
                camController.isTransitioning = false;
            }
            return;
        }

        // 2. Movimento no Modo Câmera Livre (WASD / Setas / E / Q)
        if (camController.mode === 'free') {
            const k = camController.keys;
            const baseSpeed = (simState.sceneMode === 1 ? 16.0 : 8.5) * (k.boost ? 2.6 : 1.0);
            const forward = camera.target.subtract(camera.position).normalize();
            const right = BABYLON.Vector3.Cross( BABYLON.Axis.Y, forward ).normalize();

            const moveVec = new BABYLON.Vector3(0, 0, 0);
            if (k.forward)  moveVec.addInPlace(forward);
            if (k.backward) moveVec.subtractInPlace(forward);
            if (k.right)    moveVec.addInPlace(right);
            if (k.left)     moveVec.subtractInPlace(right);
            if (k.up)       moveVec.y += 1.0;
            if (k.down)     moveVec.y -= 1.0;

            if (moveVec.lengthSquared() > 0.0001) {
                moveVec.normalize().scaleInPlace(baseSpeed * dt);
                camera.target.addInPlace(moveVec);
            }
            return;
        }

        // 3. Movimento no Modo Cinemático (Órbita panorâmica contínua e controlada)
        if (camController.mode === 'cinematic') {
            camController.cinematicTime += dt;
            const ct = camController.cinematicTime;

            camera.inertialAlphaOffset = 0;
            camera.inertialBetaOffset = 0;
            camera.inertialRadiusOffset = 0;

            camera.alpha = camController.cinematicBaseAlpha + ct * 0.16;
            camera.beta = (simState.sceneMode === 0 ? Math.PI * 0.33 : Math.PI * 0.36) + Math.sin(ct * 0.45) * 0.08;
            camera.radius = camController.cinematicBaseRadius + Math.sin(ct * 0.35) * (simState.sceneMode === 0 ? 2.2 : 5.5);
            BABYLON.Vector3.LerpToRef(camera.target, camController.cinematicCenter, dt * 3.0, camera.target);
        }
    });


    function applyWaveRegime(regimeKey) {
        const reg = OCEAN_WAVE_REGIMES[regimeKey];
        if (!reg) return;
        document.querySelectorAll('.wave-regime-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-wave-regime') === regimeKey);
        });
        simState.waveHeight = reg.height;
        simState.waveChoppy = reg.choppy;
        simState.waveSpeed = reg.speed;
        simState.foamIntensity = reg.foam;
        simState.waveDirSpread = reg.dirSpread;
        simState.waveSwellScale = reg.swellScale;

        document.getElementById('sliderWaveHeight').value = reg.height;
        document.getElementById('valWaveHeight').textContent = reg.height.toFixed(2);
        document.getElementById('sliderWaveChoppy').value = reg.choppy;
        document.getElementById('valWaveChoppy').textContent = reg.choppy.toFixed(2) + "x";
        document.getElementById('sliderWaveSpeed').value = reg.speed;
        document.getElementById('valWaveSpeed').textContent = reg.speed.toFixed(2) + "x";
        document.getElementById('sliderFoamIntensity').value = reg.foam;
        document.getElementById('valFoamIntensity').textContent = reg.foam.toFixed(2) + "x";
    }

    function setScenarioMode(mode) {
        simState.sceneMode = mode;
        const isOcean = (mode === 1);

        poolSceneMeshes.forEach(m => m.setEnabled(!isOcean));
        oceanSceneMeshes.forEach(m => m.setEnabled(isOcean));
        if (poolWaterMesh) poolWaterMesh.setEnabled(!isOcean);
        if (oceanWaterMesh) oceanWaterMesh.setEnabled(isOcean);

        buoyantObjects.forEach(obj => {
            const home = isOcean ? obj.oceanHomeXZ : obj.poolHomeXZ;
            obj.mesh.position.set(home[0], 0.35, home[1]);
            obj.vx = 0; obj.vy = 0; obj.vz = 0;
        });

        document.getElementById('btnScenePool').classList.toggle('active', !isOcean);
        document.getElementById('btnSceneOcean').classList.toggle('active', isOcean);
        document.getElementById('btnTabPool').className = !isOcean ? "btn-action btn-accent-outline" : "btn-action btn-secondary";
        document.getElementById('btnTabOcean').className = isOcean ? "btn-action btn-accent-outline" : "btn-action btn-secondary";

        if (isOcean) {
            if (simState.waveHeight < 0.5) applyWaveRegime('swell');
            animateCameraTo(-Math.PI * 0.32, Math.PI * 0.36, 36.0, 2.0, 0.5, 0.0);
            document.getElementById('bottomHintText').innerHTML =
                "<strong>Oceano &amp; Ilha:</strong> Experimente os 6 regimes de ondas na aba <strong>Física &amp; Mar</strong> ou clique nas águas da lagoa!";
        } else {
            simState.waveSwellScale = 1.0;
            if (simState.waveHeight > 1.0) {
                simState.waveHeight = 0.45;
                document.getElementById('sliderWaveHeight').value = 0.45;
                document.getElementById('valWaveHeight').textContent = "0.45";
            }
            animateCameraTo(-Math.PI * 0.62, Math.PI * 0.31, 15.5, 0.0, -0.45, 0.0);
            document.getElementById('bottomHintText').innerHTML =
                "<strong>Piscina Olímpica:</strong> Toque ou arraste sobre a água para refratar os raios solares e movimentar as boias.";
        }

        syncRefractionRenderList();
        soundEngine.init();
    }

    oceanSceneMeshes.forEach(m => m.setEnabled(false));

    document.getElementById('btnScenePool').addEventListener('click', () => setScenarioMode(0));
    document.getElementById('btnSceneOcean').addEventListener('click', () => setScenarioMode(1));
    document.getElementById('btnTabPool').addEventListener('click', () => setScenarioMode(0));
    document.getElementById('btnTabOcean').addEventListener('click', () => setScenarioMode(1));

    function applyQualityProfile(key, rebuildGeometry = true) {
        const prof = QUALITY_PROFILES[key];
        if (!prof) return;
        simState.qualityKey = key;
        simState.waveOctaves = prof.waveOctaves;
        simState.analyticDispersionFlag = prof.analyticDispersion;
        simState.rttFrameSkip = prof.rttInterval;

        engine.setHardwareScalingLevel(prof.scaling);
        const scalePct = Math.round((1.0 / prof.scaling) * 100);
        document.getElementById('sliderResolutionScale').value = scalePct;
        document.getElementById('valResolutionScale').textContent = scalePct + "%";

        if (rebuildGeometry) {
            rebuildWaterMeshesForProfile(prof);
        }
        rebuildRefractionRTT(prof.rttSize, prof.rttInterval);

        document.querySelectorAll('.quality-btn').forEach(b => {
            const isMatch = b.getAttribute('data-quality') === key;
            b.className = isMatch ? "quality-btn btn-action btn-accent-outline" : "quality-btn btn-action btn-secondary";
        });

        document.getElementById('badgeQualityHUD').textContent = prof.name;
        document.getElementById('statMeshLOD').textContent = `Clipmap (${prof.oceanRings}x${prof.oceanSectors})`;
        document.getElementById('statOctaves').textContent = `${prof.waveOctaves} harmônicos`;
        document.getElementById('statRTT').textContent = `${prof.rttSize}px (1/${prof.rttInterval} frame)`;
    }

    document.querySelectorAll('.quality-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            applyQualityProfile(btn.getAttribute('data-quality'), true);
        });
    });

    document.getElementById('btnToggleAutoFPS').addEventListener('click', () => {
        simState.autoFPS = !simState.autoFPS;
        const badge = document.getElementById('autoFpsBadge');
        badge.textContent = simState.autoFPS ? "ATIVO" : "MANUAL";
        badge.style.opacity = simState.autoFPS ? "1.0" : "0.45";
    });

    document.getElementById('sliderResolutionScale').addEventListener('input', (e) => {
        const pct = parseFloat(e.target.value);
        document.getElementById('valResolutionScale').textContent = pct + "%";
        engine.setHardwareScalingLevel(100.0 / pct);
    });

    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-tab');
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tabContents.forEach(content => {
                content.classList.toggle('hidden', content.id !== targetId);
            });
        });
    });

    const controlPanel = document.getElementById('controlPanel');
    let panelOpen = true;
    document.getElementById('btnTogglePanel').addEventListener('click', () => {
        panelOpen = !panelOpen;
        controlPanel.style.transform = panelOpen ? 'translateX(0)' : 'translateX(110%)';
    });

    const btnToggleAudio = document.getElementById('btnToggleAudio');
    const iconAudioOn = document.getElementById('iconAudioOn');
    const iconAudioOff = document.getElementById('iconAudioOff');
    btnToggleAudio.addEventListener('click', () => {
        soundEngine.enabled = !soundEngine.enabled;
        iconAudioOn.classList.toggle('hidden', !soundEngine.enabled);
        iconAudioOff.classList.toggle('hidden', soundEngine.enabled);
        if (soundEngine.enabled) soundEngine.playPlop(0.6);
    });

    document.getElementById('camOrbitFixed').addEventListener('click', () => {
        enableFixedOrbitMode(true);
    });

    document.getElementById('camFreeFly').addEventListener('click', () => {
        enableFreeFlyMode();
    });

    document.getElementById('camCinematic').addEventListener('click', () => {
        toggleCinematicMode();
    });

    const camButtons = [
        {
            id: 'camOverview',
            fn: () => simState.sceneMode === 0
                ? animateCameraTo(-Math.PI * 0.62, Math.PI * 0.31, 15.5, 0, -0.45, 0, 'camOverview')
                : animateCameraTo(-Math.PI * 0.32, Math.PI * 0.36, 36.0, 2.0, 0.5, 0, 'camOverview')
        },
        {
            id: 'camGrazing',
            fn: () => simState.sceneMode === 0
                ? animateCameraTo(-Math.PI * 0.78, Math.PI * 0.465, 11.8, 0, -0.10, 0, 'camGrazing')
                : animateCameraTo(-Math.PI * 0.18, Math.PI * 0.475, 22.5, 10.0, 0.15, 0, 'camGrazing')
        },
        {
            id: 'camTopDown',
            fn: () => simState.sceneMode === 0
                ? animateCameraTo(-Math.PI * 0.50, 0.14, 14.2, 0, -0.5, 0, 'camTopDown')
                : animateCameraTo(-Math.PI * 0.50, 0.22, 54.0, 0, 0.0, 0, 'camTopDown')
        },
        {
            id: 'camUnderwater',
            fn: () => simState.sceneMode === 0
                ? animateCameraTo(-Math.PI * 0.38, Math.PI * 0.545, 7.8, 0, -1.25, 0, 'camUnderwater')
                : animateCameraTo(-Math.PI * 0.12, Math.PI * 0.535, 12.5, 14.5, -1.15, 0, 'camUnderwater')
        }
    ];

    camButtons.forEach(item => {
        const el = document.getElementById(item.id);
        if (el) {
            el.addEventListener('click', () => {
                item.fn();
            });
        }
    });


    const presets = {
        crystal: {
            sunEl: 62, sunAz: 38, caustics: 1.35, absorption: 1.0, leds: 1.0,
            sunCol: [1.0, 0.97, 0.90],
            skyZ: [0.12, 0.42, 0.82], skyH: [0.58, 0.82, 0.96],
            shallow: [0.12, 0.86, 0.88], deep: [0.01, 0.22, 0.48],
            clear: [0.03, 0.08, 0.16]
        },
        azure: {
            sunEl: 54, sunAz: 110, caustics: 1.55, absorption: 1.55, leds: 1.0,
            sunCol: [1.0, 0.98, 0.95],
            skyZ: [0.06, 0.28, 0.68], skyH: [0.42, 0.72, 0.92],
            shallow: [0.05, 0.68, 0.92], deep: [0.005, 0.10, 0.34],
            clear: [0.02, 0.05, 0.14]
        },
        sunset: {
            sunEl: 16, sunAz: 245, caustics: 1.10, absorption: 1.15, leds: 1.4,
            sunCol: [1.0, 0.64, 0.32],
            skyZ: [0.18, 0.22, 0.48], skyH: [0.94, 0.52, 0.32],
            shallow: [0.16, 0.72, 0.76], deep: [0.04, 0.14, 0.34],
            clear: [0.08, 0.05, 0.12]
        },
        night: {
            sunEl: 12, sunAz: 60, caustics: 0.75, absorption: 1.25, leds: 2.4,
            sunCol: [0.22, 0.34, 0.58],
            skyZ: [0.01, 0.03, 0.08], skyH: [0.04, 0.09, 0.18],
            shallow: [0.06, 0.65, 0.85], deep: [0.005, 0.06, 0.18],
            clear: [0.01, 0.02, 0.06]
        }
    };

    document.querySelectorAll('.preset-btn[data-preset]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-preset');
            const p = presets[key];
            if (!p) return;

            document.querySelectorAll('.preset-btn[data-preset]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            simState.sunElevationDeg = p.sunEl;
            simState.sunAzimuthDeg = p.sunAz;
            simState.causticsIntensity = p.caustics;
            simState.absorptionScale = p.absorption;
            simState.underwaterLEDs = p.leds;
            simState.sunColor.fromArray(p.sunCol);
            simState.skyZenithColor.fromArray(p.skyZ);
            simState.skyHorizonColor.fromArray(p.skyH);
            simState.waterShallowColor.fromArray(p.shallow);
            simState.waterDeepColor.fromArray(p.deep);
            scene.clearColor = new BABYLON.Color4(p.clear[0], p.clear[1], p.clear[2], 1.0);

            document.getElementById('sliderSunElevation').value = p.sunEl;
            document.getElementById('valSunElevation').textContent = p.sunEl + "°";
            document.getElementById('sliderSunAzimuth').value = p.sunAz;
            document.getElementById('valSunAzimuth').textContent = p.sunAz + "°";
            document.getElementById('sliderCaustics').value = p.caustics;
            document.getElementById('valCaustics').textContent = p.caustics.toFixed(2) + "x";
            document.getElementById('sliderAbsorption').value = p.absorption;
            document.getElementById('valAbsorption').textContent = p.absorption.toFixed(2) + "x";
            updateSunVector();
        });
    });

    document.querySelectorAll('.wave-regime-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            applyWaveRegime(btn.getAttribute('data-wave-regime'));
        });
    });

    document.getElementById('sliderSunElevation').addEventListener('input', (e) => {
        simState.sunElevationDeg = parseFloat(e.target.value);
        document.getElementById('valSunElevation').textContent = simState.sunElevationDeg + "°";
        updateSunVector();
    });
    document.getElementById('sliderSunAzimuth').addEventListener('input', (e) => {
        simState.sunAzimuthDeg = parseFloat(e.target.value);
        document.getElementById('valSunAzimuth').textContent = simState.sunAzimuthDeg + "°";
        updateSunVector();
    });
    document.getElementById('sliderCaustics').addEventListener('input', (e) => {
        simState.causticsIntensity = parseFloat(e.target.value);
        document.getElementById('valCaustics').textContent = simState.causticsIntensity.toFixed(2) + "x";
    });
    document.getElementById('sliderIOR').addEventListener('input', (e) => {
        simState.ior = parseFloat(e.target.value);
        let label = simState.ior.toFixed(3);
        if (Math.abs(simState.ior - 1.333) < 0.015) label += " (Água)";
        else if (simState.ior > 1.50) label += " (Cristal)";
        document.getElementById('valIOR').textContent = label;
        document.getElementById('hudIOR').textContent = simState.ior.toFixed(3);
    });
    document.getElementById('sliderDispersion').addEventListener('input', (e) => {
        simState.chromaticDispersion = parseFloat(e.target.value);
        document.getElementById('valDispersion').textContent = simState.chromaticDispersion.toFixed(3);
    });
    document.getElementById('sliderAbsorption').addEventListener('input', (e) => {
        simState.absorptionScale = parseFloat(e.target.value);
        document.getElementById('valAbsorption').textContent = simState.absorptionScale.toFixed(2) + "x";
    });
    document.getElementById('sliderWaveHeight').addEventListener('input', (e) => {
        simState.waveHeight = parseFloat(e.target.value);
        document.getElementById('valWaveHeight').textContent = simState.waveHeight.toFixed(2);
    });
    document.getElementById('sliderWaveChoppy').addEventListener('input', (e) => {
        simState.waveChoppy = parseFloat(e.target.value);
        document.getElementById('valWaveChoppy').textContent = simState.waveChoppy.toFixed(2) + "x";
    });
    document.getElementById('sliderWaveSpeed').addEventListener('input', (e) => {
        simState.waveSpeed = parseFloat(e.target.value);
        document.getElementById('valWaveSpeed').textContent = simState.waveSpeed.toFixed(2) + "x";
    });
    document.getElementById('sliderFoamIntensity').addEventListener('input', (e) => {
        simState.foamIntensity = parseFloat(e.target.value);
        document.getElementById('valFoamIntensity').textContent = simState.foamIntensity.toFixed(2) + "x";
    });
    document.getElementById('sliderSunGlint').addEventListener('input', (e) => {
        simState.sunGlintIntensity = parseFloat(e.target.value);
        document.getElementById('valSunGlint').textContent = simState.sunGlintIntensity.toFixed(2) + "x";
    });
    document.getElementById('sliderRippleStrength').addEventListener('input', (e) => {
        simState.rippleStrength = parseFloat(e.target.value);
        document.getElementById('valRippleStrength').textContent = simState.rippleStrength.toFixed(2) + "x";
    });
    document.getElementById('sliderDamping').addEventListener('input', (e) => {
        simState.rippleDamping = parseFloat(e.target.value);
        const v = simState.rippleDamping;
        document.getElementById('valDamping').textContent = v < 0.7 ? "Baixo (Longa)" : (v > 1.3 ? "Alto (Viscoso)" : "Normal");
    });

    document.getElementById('btnWavePulse').addEventListener('click', () => {
        const cx = (simState.sceneMode === 0) ? 0 : 14.5;
        const cz = 0;
        spawnRipple(cx, cz, 0.18, false);
        emitSplashBurst(cx, cz, 50);
        soundEngine.playSplash(1.1);
        buoyantObjects.forEach(o => {
            o.vy += 2.4;
            o.vx += (o.mesh.position.x - cx) * 0.35;
            o.vz += (o.mesh.position.z - cz) * 0.35;
        });
    });

    document.getElementById('btnCalmWater').addEventListener('click', () => {
        for (let i = 0; i < MAX_RIPPLES; i++) {
            ripplesData[i].amplitude = 0;
        }
        simState.waveHeight = 0.08;
        document.getElementById('sliderWaveHeight').value = 0.08;
        document.getElementById('valWaveHeight').textContent = "0.08";
    });

    let spawnedCount = 0;
    document.getElementById('btnDropObject').addEventListener('click', () => {
        const isOcean = (simState.sceneMode === 1);
        const rx = isOcean ? (13.0 + (Math.random() - 0.5) * 6.0) : ((Math.random() - 0.5) * 7.5);
        const rz = isOcean ? ((Math.random() - 0.5) * 6.0) : ((Math.random() - 0.5) * 4.8);

        if (buoyantObjects.length >= 6) {
            const target = buoyantObjects[buoyantObjects.length - 1];
            target.mesh.position.set(rx, 3.0, rz);
            target.vy = -1.5;
            target.vx = (Math.random() - 0.5) * 1.5;
            target.vz = (Math.random() - 0.5) * 1.5;
            target.wasAboveWater = true;
            return;
        }
        spawnedCount++;
        const isTorus = (spawnedCount % 2 === 1);

        if (isTorus) {
            const ring = BABYLON.MeshBuilder.CreateTorus("extraRing" + spawnedCount, {
                diameter: 1.15,
                thickness: 0.34,
                tessellation: 28
            }, scene);
            ring.position.set(rx, 2.9, rz);
            ring.material = createObjectMaterial(
                "extraRingMat" + spawnedCount,
                new BABYLON.Vector3(0.15, 0.85, 0.98),
                new BABYLON.Vector3(0.98, 0.98, 1.0),
                1.0
            );
            const bo = registerBuoyantObject(ring, 0.58, 0.30, 0.03, [rx, rz], [15.0, rz]);
            bo.wasAboveWater = true;
            syncRefractionRenderList();
        } else {
            const ball = BABYLON.MeshBuilder.CreateSphere("extraBall" + spawnedCount, {
                diameter: 0.76,
                segments: 24
            }, scene);
            ball.position.set(rx, 2.9, rz);
            ball.material = createObjectMaterial(
                "extraBallMat" + spawnedCount,
                new BABYLON.Vector3(1, 1, 1),
                new BABYLON.Vector3(1, 0.3, 0.5),
                0.0
            );
            const bo = registerBuoyantObject(ball, 0.38, 0.28, 0.10, [rx, rz], [16.5, rz]);
            bo.wasAboveWater = true;
            syncRefractionRenderList();
        }
    });

    const rainIndicator = document.getElementById('rainIndicator');
    document.getElementById('btnToggleRain').addEventListener('click', () => {
        simState.rainMode = !simState.rainMode;
        if (simState.rainMode) {
            rainIndicator.style.background = "#22d3ee";
            rainIndicator.style.boxShadow = "0 0 8px #22d3ee";
        } else {
            rainIndicator.style.background = "#64748b";
            rainIndicator.style.boxShadow = "none";
        }
    });

    const ledIndicator = document.getElementById('ledIndicator');
    document.getElementById('btnToggleLights').addEventListener('click', () => {
        simState.underwaterLEDs = simState.underwaterLEDs > 0.1 ? 0.0 : 1.55;
        const on = simState.underwaterLEDs > 0.1;
        ledIndicator.style.background = on ? "#22d3ee" : "#64748b";
        ledIndicator.style.boxShadow = on ? "0 0 8px #22d3ee" : "none";
        ledFixtureMat.emissiveColor = on
            ? new BABYLON.Color3(0.35, 0.95, 1.0)
            : new BABYLON.Color3(0.05, 0.12, 0.18);
    });

    document.getElementById('btnImplulseAll').addEventListener('click', () => {
        buoyantObjects.forEach((o, idx) => {
            o.vy = -3.8 - idx * 0.4;
            o.vx += (Math.random() - 0.5) * 3.0;
            o.vz += (Math.random() - 0.5) * 3.0;
            spawnRipple(o.mesh.position.x, o.mesh.position.z, 0.11, false);
            emitSplashBurst(o.mesh.position.x, o.mesh.position.z, 25);
        });
        soundEngine.playSplash(1.2);
    });

    document.querySelectorAll('.tile-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tile-btn').forEach(b => {
                b.className = "tile-btn btn-action btn-secondary";
            });
            btn.className = "tile-btn btn-action btn-accent-outline";
            const t = btn.getAttribute('data-tile');
            simState.tileStyle = (t === 'mosaic') ? 0.0 : (t === 'turquoise' ? 1.0 : 2.0);
        });
    });

    // =========================================================================
    // 14. MAIN RENDER, AUTO-FPS GOVERNOR & SIMULATION LOOP
    // =========================================================================
    const hudFresnel = document.getElementById('hudFresnel');
    const hudRipples = document.getElementById('hudRipples');
    const hudFPS = document.getElementById('hudFPS');
    const statRippleLoop = document.getElementById('statRippleLoop');
    const underwaterOverlay = document.getElementById('underwaterOverlay');

    setTimeout(() => {
        spawnRipple(-0.8, 0.3, 0.11, false);
    }, 400);

    let frameCounter = 0;
    let fpsAccumulator = 60.0;

    scene.registerBeforeRender(() => {
        const dt = engine.getDeltaTime() * 0.001;
        simState.time += dt;
        frameCounter++;

        if (simState.rainMode && simState.time - simState.lastRainTime > 0.11) {
            simState.lastRainTime = simState.time;
            const span = (simState.sceneMode === 0) ? 1.85 : 3.5;
            const rx = (Math.random() - 0.5) * (POOL_HALF_X * span);
            const rz = (Math.random() - 0.5) * (POOL_HALF_Z * span);
            spawnRipple(rx, rz, 0.055 + Math.random() * 0.04, true);
            emitSplashBurst(rx, rz, 8);
        }

        if (frameCounter % 6 === 0) {
            soundEngine.updateOceanSurf(simState.sceneMode === 1, simState.waveHeight, simState.time);
        }

        updateBuoyancyPhysics(dt);

        if (simState.sceneMode === 1) {
            if (window._lighthouseBeamPivot) {
                window._lighthouseBeamPivot.rotation.y = simState.time * 1.15;
                window._lighthouseBeamPivot.setEnabled(simState.underwaterLEDs > 0.1);
            }
            if (window._islandBoatPivot) {
                const bw = evaluateWaterHeightAndNormalCPU(14.6, 2.35, simState.time);
                window._islandBoatPivot.position.y = bw.height + 0.06;
                window._islandBoatPivot.rotation.z = -bw.normal.x * 0.55;
                window._islandBoatPivot.rotation.x = bw.normal.z * 0.65;
            }
        }

        const activeRipples = syncRippleUniforms();

        skyDomeMat.setVector3("uSunDir", simState.sunDir);
        skyDomeMat.setVector3("uSunColor", simState.sunColor);
        skyDomeMat.setVector3("uSkyZenithColor", simState.skyZenithColor);
        skyDomeMat.setVector3("uSkyHorizonColor", simState.skyHorizonColor);

        bindCommonShaderUniforms(poolInteriorMat);
        bindCommonShaderUniforms(waterSurfaceMat);
        waterSurfaceMat.setFloat("uIOR", simState.ior);
        waterSurfaceMat.setFloat("uChromaticDispersion", simState.chromaticDispersion);
        waterSurfaceMat.setFloat("uAnalyticDispersionFlag", simState.analyticDispersionFlag);
        waterSurfaceMat.setVector3("uSkyZenithColor", simState.skyZenithColor);
        waterSurfaceMat.setVector3("uSkyHorizonColor", simState.skyHorizonColor);

        const isSubmerged = camera.position.y < 0.02;
        underwaterOverlay.style.opacity = isSubmerged ? "1" : "0";

        const currentFps = engine.getFps();
        fpsAccumulator = fpsAccumulator * 0.95 + currentFps * 0.05;

        if (frameCounter % 15 === 0) {
            const scalePct = Math.round((1.0 / engine.getHardwareScalingLevel()) * 100);
            hudFPS.textContent = `${Math.round(currentFps)} (${scalePct}%)`;
            hudRipples.textContent = `${activeRipples} ativas`;
            statRippleLoop.textContent = `${activeRipples} / 32 avaliadas`;

            const viewVec = camera.position.subtract(camera.target).normalize();
            const cosTheta = Math.abs(viewVec.y);
            const r0 = Math.pow((1.0 - simState.ior) / (1.0 + simState.ior), 2.0);
            const fresnelPct = Math.round(Math.min(99, (r0 + (1.0 - r0) * Math.pow(1.0 - cosTheta, 5.0)) * 100));
            hudFresnel.textContent = fresnelPct + "%";
        }

        if (simState.autoFPS && frameCounter % 140 === 0 && simState.time > 3.0) {
            if (fpsAccumulator < 42 && simState.qualityKey !== 'low') {
                const order = ['ultra', 'high', 'medium', 'low'];
                const currIdx = order.indexOf(simState.qualityKey);
                if (currIdx >= 0 && currIdx < order.length - 1) {
                    applyQualityProfile(order[currIdx + 1], false);
                    fpsAccumulator = 58.0;
                }
            }
        }
    });

    engine.runRenderLoop(() => {
        scene.render();
    });

    window.addEventListener('resize', () => {
        engine.resize();
    });
};
