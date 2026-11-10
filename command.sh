node << 'EOF'
const fs = require('fs');
const filePath = 'index.html';
let code = fs.readFileSync(filePath, 'utf8');

function replaceSection(label, startMarker, endMarker, replacement) {
    const startIdx = code.indexOf(startMarker);
    if (startIdx === -1) {
        console.error(`[ERRO] Marcador inicial não encontrado em: ${label}`);
        process.exit(1);
    }
    const endIdx = code.indexOf(endMarker, startIdx);
    if (endIdx === -1) {
        console.error(`[ERRO] Marcador final não encontrado em: ${label}`);
        process.exit(1);
    }
    code = code.slice(0, startIdx) + replacement + code.slice(endIdx);
    console.log(`[OK] ${label}`);
}

// ============================================================================
// 1. ADICIONAR SLIDER DE BRILHO SOLAR & CINTILAÇÃO (GLINTS) NA UI (ABA 2)
// ============================================================================
replaceSection(
    '1. Adição do slider "Brilho Superficial & Glints" na UI HTML',
    '                <!-- Espuma Costeira e Whitecaps -->',
    '                <!-- Força das Ondulações Interativas (Mouse/Objetos) -->',
`                <!-- Espuma Costeira, Rendilhado Voronoi e Whitecaps -->
                <div class="control-group">
                    <div class="control-row">
                        <span class="control-name">Espuma Celular &amp; Rebentações</span>
                        <span id="valFoamIntensity" class="font-mono-tech control-val">1.25x</span>
                    </div>
                    <input id="sliderFoamIntensity" type="range" min="0.0" max="2.5" step="0.05" value="1.25">
                </div>

                <!-- NOVO: Brilho Superficial GGX & Cintilação Solar (Glints) -->
                <div class="control-group">
                    <div class="control-row">
                        <span class="control-name">Brilho Superficial &amp; Glints Solares</span>
                        <span id="valSunGlint" class="font-mono-tech control-val">1.35x</span>
                    </div>
                    <input id="sliderSunGlint" type="range" min="0.0" max="2.8" step="0.05" value="1.35">
                </div>

`
);

// ============================================================================
// 2. ATUALIZAR ESTADO INICIAL (simState) COM sunGlintIntensity E foamIntensity
// ============================================================================
replaceSection(
    '2. Adição de sunGlintIntensity no simState',
    '            waveHeight: 0.45,\n            waveChoppy: 1.15,\n            waveSpeed: 1.0,\n            foamIntensity: 1.10,',
    '            rippleStrength: 1.15,',
`            waveHeight: 0.45,
            waveChoppy: 1.15,
            waveSpeed: 1.0,
            foamIntensity: 1.25,
            sunGlintIntensity: 1.35,
            waveDirSpread: 0.35,
            waveSwellScale: 1.00,

`
);

// ============================================================================
// 3. ADICIONAR FUNÇÕES DE ESPUMA VORONOI E COLISÃO NO SHARED_WATER_GLSL
// ============================================================================
replaceSection(
    '3. Funções de Espuma Celular Voronoi (Plateau Borders) no SHARED_WATER_GLSL',
    '        const SHARED_WATER_GLSL = `\n            uniform float uTime;',
    '            // Analytical Island & Seabed Heightfield in GLSL (100% Synced with CPU)',
`        const SHARED_WATER_GLSL = \`
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

            // Rede Celular de Voronoi (Fronteiras de Plateau: d2 - d1 forma paredes de bolhas reais)
            vec2 voronoiBubbleCells(vec2 x) {
                vec2 n = floor(x);
                vec2 f = fract(x);
                float d1 = 8.0;
                float d2 = 8.0;
                for (int j = -1; j <= 1; j++) {
                    for (int i = -1; i <= 1; i++) {
                        vec2 g = vec2(float(i), float(j));
                        vec2 o = hash22(n + g);
                        vec2 r = g + (0.15 + 0.70 * o) - f;
                        float d = dot(r, r);
                        if (d < d1) {
                            d2 = d1;
                            d1 = d;
                        } else if (d < d2) {
                            d2 = d;
                        }
                    }
                }
                return vec2(sqrt(max(0.0, d1)), sqrt(max(0.0, d2)));
            }

            // Avalia a estrutura multi-escala da espuma (Filamentos + Rendilhado de Bolhas + Micro-Espuma)
            vec3 evaluateMultiScaleFoam(vec2 worldXZ, vec2 waveSlope, float rawFoamEnergy, float distAtten) {
                if (rawFoamEnergy <= 0.005) return vec3(0.0);

                // Distorção de domínio (advection) guiada pela inclinação da onda e deriva do vento
                vec2 drift = vec2(uTime * 0.22, -uTime * 0.16) * uWaveSpeed;
                vec2 warpedUV = worldXZ + waveSlope * 0.65;

                // Camada 1: Células macro de espuma (rendilhado largo de esteira)
                vec2 vMacro = voronoiBubbleCells(warpedUV * 2.15 + drift);
                float macroWeb = 1.0 - smoothstep(0.02, 0.26, vMacro.y - vMacro.x);

                // Camada 2: Bolhas intermediárias (aglomerados de espuma aerada)
                vec2 vMid = voronoiBubbleCells(warpedUV * 5.80 - drift * 1.4 + vec2(vMacro.x * 0.35));
                float midBubbles = 1.0 - smoothstep(0.03, 0.30, vMid.y - vMid.x);
                float bubbleCores = smoothstep(0.32, 0.05, vMid.x);

                // Camada 3: Micro-espuma de alta frequência para dar textura porosa ao núcleo branco
                float microFroth = noise2D(warpedUV * 18.5 + drift * 2.2) * 0.6 +
                                   noise2D(warpedUV * 36.0 - drift * 3.0) * 0.4;

                // Combinação hierárquica: bordas rendilhadas vazadas -> centro branco denso
                float laceStructure = clamp(macroWeb * 0.62 + midBubbles * 0.52 + bubbleCores * 0.25, 0.0, 1.0);
                float porousCore = smoothstep(0.38, 0.88, rawFoamEnergy) * (0.78 + 0.22 * microFroth);

                // Threshold progressivo: energias baixas mostram apenas os filamentos da rede celular;
                // energias altas preenchem as células formando a crista branca densa (whitecap)
                float cellMask = smoothstep(0.58 - rawFoamEnergy * 0.52, 0.92 - rawFoamEnergy * 0.35, laceStructure);
                float finalFoamMask = clamp(mix(cellMask * rawFoamEnergy * 1.35, 1.0, porousCore), 0.0, 1.0);

                // Gradiente de relevo 3D das bolhas para perturbar a normal da água
                float foamHeightGradX = (vMid.x - 0.35) * (midBubbles + microFroth * 0.5) * distAtten;
                float foamHeightGradZ = (vMacro.x - 0.35) * (macroWeb + microFroth * 0.5) * distAtten;

                return vec3(finalFoamMask, foamHeightGradX, foamHeightGradZ);
            }

            // Calcula a energia de espuma gerada por ondas de toque/mouse, chuva e colisão com boias/barco
            float evaluateInteractiveFoamSources(vec2 xz) {
                float energy = 0.0;

                // 1. Espuma aerada nos anéis de impacto (toque na água, onda de choque e gotas de chuva)
                int activeCount = int(uActiveRippleCount + 0.1);
                for (int i = 0; i < 32; i++) {
                    if (i >= activeCount) break;
                    vec4 rp = uRipples[i];
                    float age = uTime - rp.z;
                    if (age > 0.0 && age < 3.4) {
                        vec2 delta = xz - rp.xy;
                        float maxR = age * 3.4 + 1.8;
                        if (abs(delta.x) < maxR && abs(delta.y) < maxR) {
                            float dist = length(delta);
                            float waveFront = age * 3.4;
                            float ringDist = abs(dist - waveFront);
                            // Anel principal de espuma que se expande e dissolve em bolhas
                            float ringFoam = exp(-ringDist * ringDist * 2.8) * exp(-age * 1.05 * uRippleDamping);
                            // Turbilhão central de bolhas no ponto exato onde o objeto/dedo bateu na água
                            float splashCore = exp(-dist * dist * 2.2) * exp(-age * 1.65);
                            energy += (ringFoam * 1.45 + splashCore * 2.10) * clamp(rp.w * 7.5, 0.0, 1.8);
                        }
                    }
                }

                // 2. Colar de espuma e marola ao redor das boias e esferas flutuantes
                for (int i = 0; i < 6; i++) {
                    vec4 obj = uFloatingObjects[i];
                    if (obj.w > 0.01) {
                        float d = length(xz - obj.xz);
                        float collarDist = d - obj.w * 0.92;
                        if (collarDist > -0.25 && collarDist < 1.15) {
                            float collar = exp(-collarDist * collarDist * 9.5) * smoothstep(-0.22, 0.02, collarDist);
                            float wakeRing = (0.5 + 0.5 * sin(collarDist * 14.0 - uTime * 5.5)) * exp(-max(0.0, collarDist) * 2.8);
                            energy += (collar * 0.85 + wakeRing * 0.42) * (0.45 + 0.55 * clamp(uWaveHeight, 0.2, 1.5));
                        }
                    }
                }

                // 3. Espuma ao redor do casco do barco ancorado e pilares do píer no modo Oceano
                if (uSceneMode > 0.5) {
                    vec2 boatRel = xz - vec2(14.6, 2.35);
                    // Elipse ajustada ao formato do casco do barco (3.4m x 1.25m)
                    float boatEllip = length(boatRel / vec2(1.75, 0.68));
                    float hullCollar = abs(boatEllip - 1.0);
                    if (hullCollar < 0.65) {
                        energy += exp(-hullCollar * hullCollar * 14.0) * (0.55 + 0.45 * uWaveHeight);
                    }
                }

                return clamp(energy, 0.0, 2.0);
            }

`
);

// ============================================================================
// 4. SUBSTITUIR waterSurfaceFragmentShader COM GGX + GLINTS + ESPUMA 3D
// ============================================================================
replaceSection(
    '4. Upgrade de Espuma 3D e Brilho GGX/Glints no waterSurfaceFragmentShader',
    '        BABYLON.Effect.ShadersStore["waterSurfaceFragmentShader"] = `',
    '        // === FIM DA PARTE 1 — COLE A PARTE 2 LOGO ABAIXO DESTA LINHA ===',
`        BABYLON.Effect.ShadersStore["waterSurfaceFragmentShader"] = \`
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

            \${SHARED_WATER_GLSL}

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

            // Função de Distribuição Normal GGX / Trowbridge-Reitz para Brilho Solar na Água
            float distributionGGX(vec3 N, vec3 H, float roughness) {
                float a = roughness * roughness;
                float a2 = a * a;
                float NdotH = max(0.0, dot(N, H));
                float NdotH2 = NdotH * NdotH;
                float denom = (NdotH2 * (a2 - 1.0) + 1.0);
                return a2 / max(0.00001, 3.14159265 * denom * denom);
            }

            void main() {
                bool isOcean = (uSceneMode > 0.5);
                float exactTerrainH = -3.1;
                if (isOcean) {
                    exactTerrainH = evaluateIslandBathymetry(vWorldPos.xz);
                    if (exactTerrainH > vWorldPos.y + 0.025) {
                        discard;
                    }
                }

                vec3 viewVector = uCameraPos - vWorldPos;
                float viewDist = length(viewVector);
                vec3 viewDir = viewVector / max(0.0001, viewDist);

                vec4 wave = evaluateWaveField(vWorldPos.xz);

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
                // 2. CÁLCULO FÍSICO DE ESPUMA (5 FONTES COMBINADAS + VORONOI 3D)
                // =====================================================================
                float interactiveFoamEnergy = evaluateInteractiveFoamSources(vWorldPos.xz);
                float totalRawFoamEnergy = 0.0;

                if (!isOcean) {
                    // Na Piscina: Espuma nas ondas de toque/objetos + espuma de batida na borda de azulejos
                    float wallProximity = min(7.0 - abs(vWorldPos.x), 5.0 - abs(vWorldPos.z));
                    float wallWaveSlosh = clamp(abs(vWaveElevation) * 6.5 + max(0.0, -wave.w) * 0.35, 0.0, 1.5);
                    float copingFroth = (1.0 - smoothstep(0.0, 0.28, wallProximity)) * (0.35 + 0.85 * wallWaveSlosh);
                    float poolCrestBreak = smoothstep(0.45, 1.15, -wave.w * 0.32 * uWaveChoppy);

                    totalRawFoamEnergy = (interactiveFoamEnergy * 0.95 + copingFroth * 0.75 + poolCrestBreak * 0.65) * uFoamIntensity;
                } else {
                    // No Oceano & Ilha:
                    // A) Quebra de crista trocoidal (Jacobian whitecaps) com cauda na encosta da onda
                    vec2 windDir = normalize(vec2(0.85, 0.35));
                    float leewardSlope = clamp(dot(wave.yz, windDir) * 0.85 + 0.35, 0.0, 1.4);
                    float crestCompression = max(0.0, -wave.w) * 0.48 * uWaveChoppy + max(0.0, vWaveElevation) * 0.65;
                    float whitecapEnergy = smoothstep(0.26, 0.82, crestCompression * (0.75 + 0.45 * leewardSlope));

                    // B) Rebentações na praia e recife (3 trens assimétricos de Swash & Backwash)
                    float shoreDepth = max(0.0, vWorldPos.y - exactTerrainH);
                    float warpNoise = noise2D(vWorldPos.xz * 0.85 + vec2(uTime * 0.15));

                    // Onda dente-de-serra assimétrica: frente de espuma aguda avançando para a areia e cauda rendilhada recuando
                    float surfPhase = shoreDepth * 1.45 - uTime * 0.58 * uWaveSpeed + warpNoise * 0.42;
                    float surfFract = fract(surfPhase);
                    float boreFront = smoothstep(0.0, 0.14, surfFract) * (1.0 - smoothstep(0.14, 0.32, surfFract));
                    float backwashLace = (1.0 - surfFract) * smoothstep(0.02, 0.25, surfFract) * 0.72;

                    // Segundo trem harmônico defasado para naturalidade
                    float surfPhase2 = shoreDepth * 2.35 - uTime * 0.74 * uWaveSpeed - warpNoise * 0.35 + 0.45;
                    float surfFract2 = fract(surfPhase2);
                    float boreFront2 = smoothstep(0.0, 0.16, surfFract2) * (1.0 - smoothstep(0.16, 0.38, surfFract2));

                    float surfZoneEnvelope = (1.0 - smoothstep(0.15, 2.45, shoreDepth)) * smoothstep(-0.15, 0.02, shoreDepth);
                    float beachWaterline = (1.0 - smoothstep(0.0, 0.26, shoreDepth)) * 0.95;

                    // C) Espuma sobre a crista rasa do anel de recife de corais
                    float reefBreaker = (1.0 - smoothstep(0.35, 1.85, shoreDepth)) * smoothstep(0.08, 0.35, abs(vWaveElevation)) * 0.65;

                    float shoreTotalEnergy = surfZoneEnvelope * (boreFront * 1.25 + backwashLace + boreFront2 * 0.65) +
                                             beachWaterline + reefBreaker;

                    totalRawFoamEnergy = (shoreTotalEnergy * 0.95 + whitecapEnergy * 0.92 + interactiveFoamEnergy * 0.90) * uFoamIntensity;
                }

                // Avalia a rede celular Voronoi 3D da espuma
                vec3 foamData = evaluateMultiScaleFoam(vWorldPos.xz, wave.yz, clamp(totalRawFoamEnergy, 0.0, 1.6), microFade);
                float foamMask = foamData.x;
                vec2 foamBumpSlope = foamData.yz * (0.085 * foamMask);

                // Normal final da superfície (Ondas Gerstner + Ondas Capilares + Relevo 3D das Bolhas de Espuma)
                vec3 surfaceNormal = normalize(vec3(
                    -(wave.y + capillarySlope.x + foamBumpSlope.x),
                    1.0,
                    -(wave.z + capillarySlope.y + foamBumpSlope.y)
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
                float shoreRefrAtten = isOcean ? smoothstep(0.0, 0.75, max(0.0, vWorldPos.y - exactTerrainH)) : 1.0;
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
                    float verticalDepth = max(0.0, vWorldPos.y - exactTerrainH);
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

                    // Subsurface Scattering (SSS) turquesa esmeralda através das cristas das ondas
                    float blDot = clamp(dot(viewDir, normalize(-uSunDir + surfaceNormal * 0.65)), 0.0, 1.0);
                    float backLight = blDot * blDot * blDot;
                    float crestFactor = smoothstep(-0.02, 0.16, vWaveElevation);
                    vec3 sssGlow = uWaterShallowColor * (backLight * (0.48 + crestFactor * 1.25) * 0.62);

                    vec3 transmittedColor = refractedSceneColor * transmittance + volumeTint * (1.0 - transmittance) * 0.76 + sssGlow;

                    vec3 reflDir = reflect(-viewDir, orientedNormal);
                    reflDir.y = max(0.02, reflDir.y);
                    vec3 reflectedColor = evaluateSkyReflection(reflDir);

                    // Vetor meia-luz (Half-Vector) entre o Sol e a Câmera
                    vec3 halfVec = normalize(uSunDir + viewDir);

                    // Camada 1: Coluna Solar Microfacetada GGX (caminho luminoso sobre a água)
                    float baseRoughness = clamp(0.042 + 0.032 * uWaveHeight, 0.035, 0.12);
                    float ggxCore = distributionGGX(orientedNormal, halfVec, baseRoughness) * 0.22;
                    float ggxBroad = distributionGGX(orientedNormal, halfVec, baseRoughness * 2.8) * 0.045;

                    // Camada 2: Cintilação Estocástica de Micro-Facetas (Glints brancos vivos que dançam nas ondas)
                    vec3 glintNormal = normalize(vec3(
                        -(wave.y * 0.85 + capillarySlope.x * 3.4),
                        1.0,
                        -(wave.z * 0.85 + capillarySlope.y * 3.4)
                    ));
                    float NdotH_glint = max(0.0, dot(glintNormal, halfVec));

                    // Máscara celular cintilante que isola facetas individuais refletindo o disco solar
                    vec2 sparkleGrid1 = vWorldPos.xz * 14.5 + vec2(uTime * 0.8, -uTime * 0.6);
                    vec2 sparkleGrid2 = vWorldPos.xz * 23.0 - vec2(uTime * 0.9, uTime * 0.75);
                    float sparkleMask = smoothstep(0.62, 0.94, noise2D(sparkleGrid1) * 0.55 + noise2D(sparkleGrid2) * 0.45);

                    float diamondSparkles = pow(NdotH_glint, 180.0) * sparkleMask * 6.5 +
                                            pow(NdotH_glint, 950.0) * 8.0;

                    // A espuma densa é fosca, portanto atenua o reflexo especular onde há espuma grossa
                    float wetSpecularMask = 1.0 - smoothstep(0.25, 0.85, foamMask) * 0.82;
                    float glintScale = uSunGlintIntensity * wetSpecularMask;

                    // Combina cor solar quente na borda do reflexo com núcleo branco puro incandescente
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
                // 4. COMPOSIÇÃO FÍSICA DA ESPUMA (ALBEDO + SSS + SOMBREAMENTO 3D)
                // =====================================================================
                if (foamMask > 0.005) {
                    // Iluminação difusa 3D nas bolhas da espuma + espalhamento subsuperficial turquesa
                    float foamNdotL = max(0.32, dot(orientedNormal, uSunDir));
                    float sunElev = max(0.18, uSunDir.y);

                    // Bordas finas da espuma absorvem um leve tom ciano/turquesa da água; o núcleo é branco neve
                    float coreThickness = smoothstep(0.18, 0.72, foamMask);
                    vec3 thinBubbleTint = mix(uWaterShallowColor * 0.45 + vec3(0.62, 0.68, 0.72), vec3(0.98, 0.99, 1.0), coreThickness);

                    // Brilho úmido (wet sheen) nas bolhas recém-formadas
                    vec3 halfVec = normalize(uSunDir + viewDir);
                    float bubbleSheen = pow(max(0.0, dot(orientedNormal, halfVec)), 36.0) * 0.35 * uSunGlintIntensity;

                    vec3 litFoamColor = thinBubbleTint * (mix(vec3(0.78, 0.86, 0.94), uSunColor, 0.55) * (0.55 + 0.52 * foamNdotL * sunElev)) +
                                        vec3(1.0) * bubbleSheen;

                    finalColor = mix(finalColor, litFoamColor, foamMask);
                }

                // Menisco óptico sutil nas bordas de azulejo da piscina
                if (!isOcean) {
                    float wallProximity = min(7.0 - abs(vWorldPos.x), 5.0 - abs(vWorldPos.z));
                    float meniscus = (1.0 - smoothstep(0.0, 0.09, wallProximity)) * 0.24;
                    finalColor += vec3(0.90, 0.98, 1.0) * meniscus;
                } else {
                    // Neblina atmosférica suave no horizonte oceânico
                    float horizonFog = smoothstep(75.0, 215.0, viewDist);
                    vec3 horizonSkyCol = evaluateSkyReflection(normalize(vec3(-viewDir.x, 0.03, -viewDir.z)));
                    finalColor = mix(finalColor, horizonSkyCol, horizonFog);
                }

                // Tone mapping que preserva a brancura viva da espuma e o estalo dos glints solares
                vec3 mapped = finalColor / (1.0 + finalColor * 0.075);
                gl_FragColor = vec4(clamp(mapped, 0.0, 1.0), 1.0);
            }
        \`;
`
);

// ============================================================================
// 5. REGISTRAR UNIFORM uSunGlintIntensity E EVENTO DO SLIDER
// ============================================================================
code = code.replace(
    `"uFoamIntensity", "uWaveDirSpread",`,
    `"uFoamIntensity", "uSunGlintIntensity", "uWaveDirSpread",`
);

code = code.replace(
    `mat.setFloat("uFoamIntensity", simState.foamIntensity);`,
    `mat.setFloat("uFoamIntensity", simState.foamIntensity);\n            mat.setFloat("uSunGlintIntensity", simState.sunGlintIntensity);`
);

code = code.replace(
    `        document.getElementById('sliderFoamIntensity').addEventListener('input', (e) => {
            simState.foamIntensity = parseFloat(e.target.value);
            document.getElementById('valFoamIntensity').textContent = simState.foamIntensity.toFixed(2) + "x";
        });`,
    `        document.getElementById('sliderFoamIntensity').addEventListener('input', (e) => {
            simState.foamIntensity = parseFloat(e.target.value);
            document.getElementById('valFoamIntensity').textContent = simState.foamIntensity.toFixed(2) + "x";
        });
        document.getElementById('sliderSunGlint').addEventListener('input', (e) => {
            simState.sunGlintIntensity = parseFloat(e.target.value);
            document.getElementById('valSunGlint').textContent = simState.sunGlintIntensity.toFixed(2) + "x";
        });`
);

fs.writeFileSync(filePath, code, 'utf8');
console.log('[SUCESSO] Espuma Celular Voronoi 3D e Brilho GGX/Glints aplicados em index.html!');
EOF

# Registrar a renomeação (water.html -> index.html) + novas melhorias no Git
git add -A
git commit -m "feat(shaders): implementar espuma celular Voronoi 3D e brilho solar GGX com glints

- Renomeia water.html para index.html como entrypoint principal
- Implementa rede celular de Voronoi (Fronteiras de Plateau d2-d1) em 3 escalas para espuma rendilhada realista
- Adiciona 5 fontes fisicas de espuma: whitecaps de crista (Jacobian), rebentacao swash/backwash em 2 trens, colar de boias/barco, aneis de impacto/chuva e borda da piscina
- Adiciona relevo 3D nas bolhas da espuma, translucidez turquesa nas bordas finas e atenuação especular na espuma densa
- Implementa BRDF Microfacet GGX combinada com cintilacao estocastica capilar (diamantes de sol)
- Adiciona controle deslizante de Brilho Superficial & Glints Solares na interface"
git log -1 --stat
