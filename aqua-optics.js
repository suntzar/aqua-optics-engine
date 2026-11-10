/**
 * ============================================================================
 * AquaOptics Engine v2.0.0 — Standalone Hydro-Optical & Hydrodynamics SDK
 * ============================================================================
 * Motor físico e óptico independente para Babylon.js (WebGL2).
 * Projetado para integração direta em jogos, simuladores navais, arquiteturas
 * 3D e ambientes interativos (Piscinas, Lagos, Costas, Ilhas e Oceanos Abertos).
 *
 * Recursos Principais:
 *  - Óptica Física Realista: Equação de Fresnel (Schlick), Refração pela Lei de
 *    Snell, Janela de Snell (48.6°) com Reflexão Interna Total, Dispersão
 *    Cromática RGB, Atenuação Exponencial de Beer-Lambert e Subsurface Scattering.
 *  - Cáusticas Analíticas Reativas: Calculadas via Laplaciano da curvatura das
 *    ondas e ondulações interativas em tempo real.
 *  - Hidrodinâmica & Espuma Dual-Tone: Superposição trocoidal de Gerstner (3 a 8
 *    oitavas), BRDF Microfacet GGX com Glints Estocásticos e Fios de Espuma.
 *  - Geometria Escalável: Malha Clipmap Radial com distribuição exponencial e
 *    governador automático de FPS / escala de hardware.
 *  - Física de Arquimedes: Empuxo submerso, arrasto hidrodinâmico, inclinação
 *    por normal de onda e colisões esfera-esfera.
 *
 * @module AquaOptics
 * @version 2.0.0
 * @license MIT
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['babylonjs'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(root.BABYLON);
    } else {
        root.AquaOptics = factory(root.BABYLON);
    }
})(typeof self !== 'undefined' ? self : this, function (BABYLON) {
    'use strict';

    // ========================================================================
    // 1. CONSTANTES, PERFIS DE QUALIDADE, REGIMES DE MAR E PRESETS ÓPTICOS
    // ========================================================================
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

    const ENVIRONMENT_PRESETS = {
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

    /**
     * Configuração padrão completa do motor AquaOptics.
     * Todos os parâmetros podem ser sobrescritos na instanciação ou em tempo real.
     */
    const DEFAULT_CONFIG = {
        mode: 'pool',                  // 'pool' (0) | 'ocean' (1)
        quality: 'high',               // 'low' | 'medium' | 'high' | 'ultra'
        autoFPS: true,                 // Governador adaptativo de FPS (< 42 FPS)
        minTargetFPS: 42,
        preset: 'crystal',             // 'crystal' | 'azure' | 'sunset' | 'night'
        waveRegime: 'swell',           // 'calm' | 'swell' | 'trade' | 'cross' | 'storm' | 'tsunami'

        // Parâmetros Ópticos e Luz
        sunElevationDeg: 62,
        sunAzimuthDeg: 38,
        ior: 1.333,                    // Índice de refração da água (Lei de Snell)
        chromaticDispersion: 0.035,    // Dispersão prismática RGB
        absorptionScale: 1.0,          // Coeficiente Beer-Lambert
        causticsIntensity: 1.35,       // Foco de cáusticas pelo Laplaciano
        sunGlintIntensity: 1.35,       // Cintilação especular GGX + diamantes solares
        underwaterLEDs: 1.0,           // Intensidade das luminárias submersas
        tileStyle: 0.0,                // 0 = Mosaico Azul, 1 = Hijau/Bali, 2 = Areia/Mármore

        // Parâmetros Físicos de Ondas
        waveHeight: 0.45,
        waveChoppy: 1.15,
        waveSpeed: 1.0,
        foamIntensity: 1.25,
        waveDirSpread: 0.35,
        waveSwellScale: 1.0,
        rippleStrength: 1.15,
        rippleDamping: 0.9,
        maxRipples: 32,

        // Dimensões Geométricas
        poolBounds: { halfX: 7.0, halfZ: 5.0, depth: 3.1, wallTopY: 0.36 },
        oceanRadius: 220.0,
        islandRadius: 16.5,

        // Recursos Opcionais
        audioEnabled: true,
        rainMode: false,
        customBathymetryFn: null       // Função (x, z) => height opcional para terrenos customizados
    };

    const SHARED_UNIFORM_NAMES = [
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

    // ========================================================================
    // 2. SINTETIZADOR ACÚSTICO PROCEDURAL (WEB AUDIO API)
    // ========================================================================
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

    // ========================================================================
    // 3. REGISTRO DE SHADERS GLSL (WEBGL2 / ES 3.0 PRECISION-SAFE)
    // ========================================================================
    let _shadersRegistered = false;

    function registerShaders() {
        if (_shadersRegistered) return;
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
        _shadersRegistered = true;
    }

    // ========================================================================
    // 4. GERADORES PROCEDURAIS DE TEXTURA E GEOMETRIA CLIPMAP RADIAL
    // ========================================================================
    function createSeamlessFoamTexture(scene, size = 256) {
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

    /**
     * Constrói uma malha oceânica em Clipmap Radial com concentração exponencial
     * de vértices próxima ao centro de interesse e redução progressiva rumo ao horizonte.
     */
    function createRadialClipmapOceanMesh(scene, rings, sectors, maxRadius, material, name = "oceanWaterSurface") {
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

        const mesh = new BABYLON.Mesh(name, scene);
        const vertexData = new BABYLON.VertexData();
        vertexData.positions = positions;
        vertexData.uvs = uvs;
        vertexData.indices = indices;
        vertexData.applyToMesh(mesh);
        if (material) mesh.material = material;
        mesh.isPickable = true;
        return mesh;
    }

    /**
     * Validador de segurança para RenderTargetTexture no Babylon.js v9+.
     */
    function isValidRefractionMesh(mesh) {
        return Boolean(
            mesh &&
            mesh instanceof BABYLON.Mesh &&
            mesh._internalAbstractMeshDataInfo &&
            typeof mesh.getTotalVertices === "function" &&
            mesh.getTotalVertices() > 0
        );
    }

    // ========================================================================
    // 5. CLASSE PRINCIPAL DO SDK: AquaOptics.Engine
    // ========================================================================
    class AquaOpticsEngine {
        /**
         * Cria uma instância independente ou acoplada do motor AquaOptics.
         * @param {BABYLON.Scene} scene Cena do Babylon.js
         * @param {Object} [userConfig={}] Parâmetros de configuração
         */
        constructor(scene, userConfig = {}) {
            if (!scene) {
                throw new Error("[AquaOptics] Uma instância válida de BABYLON.Scene é obrigatória.");
            }
            registerShaders();

            this.scene = scene;
            this.engine = scene.getEngine();
            this.config = Object.assign({}, DEFAULT_CONFIG, userConfig);
            this.listeners = {};

            // Permite acoplar a uma cena já construída (bridge) ou operar de forma 100% autônoma
            this._bridge = userConfig.bridge || null;
            this.sound = (this._bridge && this._bridge.soundEngine)
                ? this._bridge.soundEngine
                : new WaterSoundEngine();
            this.sound.enabled = Boolean(this.config.audioEnabled);
        }

        /**
         * Registra um listener de evento ('ripple', 'splash', 'qualityChange', 'presetChange', 'regimeChange').
         */
        on(event, callback) {
            if (!this.listeners[event]) this.listeners[event] = [];
            this.listeners[event].push(callback);
            return () => this.off(event, callback);
        }

        off(event, callback) {
            if (!this.listeners[event]) return;
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }

        _emit(event, payload) {
            if (!this.listeners[event]) return;
            this.listeners[event].forEach(cb => {
                try { cb(payload); } catch (e) { console.error(e); }
            });
        }

        /**
         * Retorna o objeto de estado reativo da simulação.
         */
        getState() {
            return this._bridge ? this._bridge.simState : this.config;
        }

        /**
         * Atualiza múltiplos parâmetros ópticos, físicos ou de iluminação em tempo real.
         * @param {Object} partialConfig Parâmetros a atualizar
         */
        setConfig(partialConfig = {}) {
            const state = this.getState();
            Object.assign(this.config, partialConfig);
            Object.assign(state, partialConfig);

            if (
                partialConfig.sunElevationDeg !== undefined ||
                partialConfig.sunAzimuthDeg !== undefined
            ) {
                if (this._bridge && this._bridge.updateSunVector) {
                    this._bridge.updateSunVector();
                }
            }
            this._emit('configChange', state);
            return this;
        }

        /**
         * Aplica um preset ambiental e espectral ('crystal' | 'azure' | 'sunset' | 'night').
         */
        applyEnvironmentPreset(presetKey) {
            const p = typeof presetKey === 'string' ? ENVIRONMENT_PRESETS[presetKey] : presetKey;
            if (!p) return this;
            const state = this.getState();

            state.sunElevationDeg = p.sunEl;
            state.sunAzimuthDeg = p.sunAz;
            state.causticsIntensity = p.caustics;
            state.absorptionScale = p.absorption;
            state.underwaterLEDs = p.leds;
            if (state.sunColor) state.sunColor.fromArray(p.sunCol);
            if (state.skyZenithColor) state.skyZenithColor.fromArray(p.skyZ);
            if (state.skyHorizonColor) state.skyHorizonColor.fromArray(p.skyH);
            if (state.waterShallowColor) state.waterShallowColor.fromArray(p.shallow);
            if (state.waterDeepColor) state.waterDeepColor.fromArray(p.deep);
            if (p.clear && this.scene) {
                this.scene.clearColor = new BABYLON.Color4(p.clear[0], p.clear[1], p.clear[2], 1.0);
            }
            if (this._bridge && this._bridge.updateSunVector) {
                this._bridge.updateSunVector();
            }
            this._emit('presetChange', { key: presetKey, preset: p });
            return this;
        }

        /**
         * Aplica um regime de ondas oceânicas ('calm' | 'swell' | 'trade' | 'cross' | 'storm' | 'tsunami').
         */
        applyWaveRegime(regimeKey) {
            if (this._bridge && this._bridge.applyWaveRegime) {
                this._bridge.applyWaveRegime(regimeKey);
            } else {
                const reg = OCEAN_WAVE_REGIMES[regimeKey];
                if (!reg) return this;
                this.setConfig({
                    waveHeight: reg.height,
                    waveChoppy: reg.choppy,
                    waveSpeed: reg.speed,
                    foamIntensity: reg.foam,
                    waveDirSpread: reg.dirSpread,
                    waveSwellScale: reg.swellScale
                });
            }
            this._emit('regimeChange', regimeKey);
            return this;
        }

        /**
         * Altera o nível de qualidade gráfica e LOD ('low' | 'medium' | 'high' | 'ultra').
         */
        applyQualityProfile(tierKey, rebuildGeometry = true) {
            if (this._bridge && this._bridge.applyQualityProfile) {
                this._bridge.applyQualityProfile(tierKey, rebuildGeometry);
            }
            this._emit('qualityChange', tierKey);
            return this;
        }

        /**
         * Alterna entre o modo Piscina Olímpica (0 / 'pool') e Oceano & Ilha (1 / 'ocean').
         */
        setScenarioMode(mode) {
            const numericMode = (mode === 'ocean' || mode === 1) ? 1 : 0;
            if (this._bridge && this._bridge.setScenarioMode) {
                this._bridge.setScenarioMode(numericMode);
            } else {
                this.setConfig({ sceneMode: numericMode });
            }
            return this;
        }

        /**
         * Dispara uma ondulação interativa na posição (x, z) do mundo.
         */
        spawnRipple(x, z, amplitude = 0.085, playAudio = true) {
            if (this._bridge && this._bridge.spawnRipple) {
                this._bridge.spawnRipple(x, z, amplitude, playAudio);
            }
            this._emit('ripple', { x, z, amplitude });
            return this;
        }

        /**
         * Acalma todas as ondulações ativas na superfície da água.
         */
        calmWater(residualHeight = 0.08) {
            if (this._bridge && this._bridge.calmWater) {
                this._bridge.calmWater(residualHeight);
            } else {
                this.setConfig({ waveHeight: residualHeight });
            }
            return this;
        }

        /**
         * Avalia analiticamente a altura da água e o vetor normal na posição (x, z).
         * Ideal para sincronizar barcos, boias, personagens ou câmeras flutuantes.
         * @param {number} x Coordenada X no mundo
         * @param {number} z Coordenada Z no mundo
         * @param {number} [time] Tempo opcional (usa o relógio interno se omitido)
         * @returns {{ height: number, normal: BABYLON.Vector3 }}
         */
        evaluateWaveAt(x, z, time) {
            const state = this.getState();
            const t = (time !== undefined) ? time : state.time;
            if (this._bridge && this._bridge.evaluateWaterHeightAndNormalCPU) {
                return this._bridge.evaluateWaterHeightAndNormalCPU(x, z, t);
            }
            return { height: 0, normal: new BABYLON.Vector3(0, 1, 0) };
        }

        /**
         * Avalia a altura batimétrica/topográfica do terreno na posição (x, z).
         */
        evaluateBathymetryAt(x, z) {
            if (typeof this.config.customBathymetryFn === 'function') {
                return this.config.customBathymetryFn(x, z);
            }
            if (this._bridge && this._bridge.evaluateIslandHeightCPU) {
                return this._bridge.evaluateIslandHeightCPU(x, z);
            }
            return -this.config.poolBounds.depth;
        }

        /**
         * Registra um novo corpo flutuante com física de empuxo de Arquimedes.
         */
        registerBuoyantBody(mesh, options = {}) {
            const radius = options.radius || 0.45;
            const density = options.density || 0.30;
            const offsetY = options.offsetY || 0.05;
            const poolHomeXZ = options.poolHomeXZ || [0, 0];
            const oceanHomeXZ = options.oceanHomeXZ || [14, 4];

            if (this._bridge && this._bridge.registerBuoyantObject) {
                return this._bridge.registerBuoyantObject(mesh, radius, density, offsetY, poolHomeXZ, oceanHomeXZ);
            }
            return null;
        }

        /**
         * Retorna métricas de telemetria em tempo real (FPS, escala de resolução, ondas ativas, Fresnel).
         */
        getTelemetry() {
            const state = this.getState();
            const fps = Math.round(this.engine.getFps());
            const scalePct = Math.round((1.0 / this.engine.getHardwareScalingLevel()) * 100);
            const activeRipples = this._bridge && this._bridge.getActiveRippleCount
                ? this._bridge.getActiveRippleCount()
                : 0;
            return {
                version: '2.0.0',
                fps: fps,
                resolutionScalePercent: scalePct,
                quality: state.qualityKey,
                sceneMode: state.sceneMode === 0 ? 'pool' : 'ocean',
                ior: state.ior,
                waveOctaves: state.waveOctaves,
                activeRipples: activeRipples,
                maxRipples: 32
            };
        }
    }

    return {
        VERSION: '2.0.0',
        QUALITY_PROFILES: QUALITY_PROFILES,
        OCEAN_WAVE_REGIMES: OCEAN_WAVE_REGIMES,
        ENVIRONMENT_PRESETS: ENVIRONMENT_PRESETS,
        DEFAULT_CONFIG: DEFAULT_CONFIG,
        SHARED_UNIFORM_NAMES: SHARED_UNIFORM_NAMES,
        SHARED_WATER_GLSL: SHARED_WATER_GLSL,
        WaterSoundEngine: WaterSoundEngine,
        registerShaders: registerShaders,
        createSeamlessFoamTexture: createSeamlessFoamTexture,
        createRadialClipmapOceanMesh: createRadialClipmapOceanMesh,
        isValidRefractionMesh: isValidRefractionMesh,
        Engine: AquaOpticsEngine
    };
});
