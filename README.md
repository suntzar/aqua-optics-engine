# 🌊 AquaOptics Engine v2.0 — SDK Hidro-Óptico e Hidrodinâmico para Babylon.js

**AquaOptics Engine** é uma biblioteca independente e altamente configurável de renderização física de água, óptica subaquática e hidrodinâmica em tempo real construída sobre **Babylon.js (WebGL2 / GLSL ES 3.0)**.

Projetada para ser integrada facilmente em **jogos 3D, simuladores marítimos, visualizações arquitetônicas e experiências interativas**, a engine escala desde piscinas e lagos confinados até oceanos abertos com ilhas e batimetria costeira, mantendo alta taxa de quadros tanto em dispositivos móveis quanto em desktops.

---

## 🏗️ Arquitetura Modular do Projeto

```text
water-engine/
├── aqua-optics.js   # SDK Independente (Shaders GLSL, Óptica, Gerstner, Clipmap LOD, Áudio e Empuxo)
├── script.js        # Aplicação Demo / Showcase (Cenários Piscina & Ilha, Câmeras e Controles de UI)
├── style.css        # Sistema de Design Glassmorphism Responsivo da Demo
├── index.html       # Entrypoint HTML5 semântico
└── README.md        # Documentação Técnica e Referência da API
```

---

## ✨ Recursos Físicos e Ópticos Implementados

1. **Óptica Física da Água em GLSL (`waterSurface` & `poolInterior`)**:
   - **Equação de Fresnel Dielétrica (Aproximação de Schlick)**: Transição fisicamente precisa entre transparência zenital e reflexão especular em ângulos rasantes.
   - **Lei de Snell & Dispersão Cromática Prismática**: Separação espectral nos canais R, G e B combinando *RenderTargetTexture* (RTT) em espaço de tela com *ray-tracing* analítico.
   - **Janela de Snell (48.6°) & Reflexão Interna Total (TIR)**: Comportamento subaquático fiel ao mergulhar a câmera.
   - **Lei de Beer-Lambert & Subsurface Scattering (SSS)**: Atenuação exponencial da luz por profundidade $(\sigma_R, \sigma_G, \sigma_B)$ e translucidez turquesa no contraluz das cristas.
   - **BRDF Microfacet GGX + Glints Estocásticos**: Coluna solar contínua combinada com cintilação de micro-facetas capilares (*diamantes de sol*).

2. **Hidrodinâmica, Cáusticas e Espuma Dual-Tone**:
   - **Ondas Trocoidais de Gerstner (3 a 8 Oitavas Escaláveis)**: Deslocamento vertical e empinamento lateral $(X, Y, Z)$ com *wave shoaling* (desaceleração em águas rasas).
   - **Cáusticas Reativas via Laplaciano**: Convergência luminosa no fundo e nas paredes calculada a partir da curvatura real das ondas e dos anéis de toque.
   - **Fios de Onda Luminosos em Duplo-Tom (Domain-Warped Flow Ribbons)**: Halo ciano-turquesa integrado à água e núcleo branco puro nas cristas, na arrebentação da praia e ao redor de objetos flutuantes.
   - **Empuxo de Arquimedes & Colisões**: Integração rígida para boias, esferas e embarcações com torque alinhado à normal da superfície.

3. **Pipeline de Otimização de Hardware**:
   - **Clipmap Radial Exponencial**: Concentra 70% da densidade poligonal nos primeiros 45 metros ao redor da ilha/câmera e expande progressivamente os triângulos até o horizonte (220m+).
   - **Compactação Dinâmica de Ondas (`uActiveRippleCount` + *Early-Out*)**: Apenas ondulações ativas são enviadas à GPU; quando em repouso, o loop de 32 ondas custa **zero iterações** no shader.
   - **Governador Automático de FPS**: Ajusta dinamicamente o `HardwareScalingLevel` (DPI), o número de oitavas harmônicas e a taxa de atualização da textura de refração.

---

## 🚀 Guia de Integração Rápida (Quick Start)

### 1. Importação no HTML

Inclua o **Babylon.js** e o módulo `aqua-optics.js` no seu projeto:

```html
<script src="https://cdn.babylonjs.com/babylon.js"></script>
<script src="aqua-optics.js"></script>
```

### 2. Uso do SDK e Controle via JavaScript

```javascript
// 1. Registrar os Shaders GLSL do AquaOptics na engine do Babylon.js
AquaOptics.registerShaders();

// 2. Criar uma malha oceânica otimizada em Clipmap Radial
const oceanMesh = AquaOptics.createRadialClipmapOceanMesh(
    scene,
    120,            // Anéis radiais
    144,            // Setores angulares
    220.0,          // Raio máximo (metros)
    waterMaterial,  // ShaderMaterial configurado
    "meuOceano"
);

// 3. Gerar a textura procedural seamless de fluxo e espuma (256x256 trilinear)
const foamTexture = AquaOptics.createSeamlessFoamTexture(scene, 256);
waterMaterial.setTexture("uFoamSampler", foamTexture);
```

### 3. Controlando a Instância Ativa (`window.aquaEngine`) em Tempo Real

Na aplicação integrada (ou diretamente pelo console do navegador), você pode controlar todos os aspectos do motor através da instância `aquaEngine`:

```javascript
// Alternar entre Piscina Olímpica ('pool') e Oceano com Ilha ('ocean')
aquaEngine.setScenarioMode('ocean');

// Aplicar um dos 6 regimes de mar aberto ('calm', 'swell', 'trade', 'cross', 'storm', 'tsunami')
aquaEngine.applyWaveRegime('storm');

// Aplicar um preset óptico e atmosférico ('crystal', 'azure', 'sunset', 'night')
aquaEngine.applyEnvironmentPreset('sunset');

// Ajustar parâmetros ópticos ou físicos granulares em tempo real
aquaEngine.setConfig({
    ior: 1.333,
    chromaticDispersion: 0.045,
    causticsIntensity: 1.80,
    sunGlintIntensity: 1.60,
    foamIntensity: 1.45,
    waveHeight: 1.20
});

// Disparar ondas interativas via código em qualquer coordenada (x, z)
aquaEngine.spawnRipple(0, 0, 0.18, true);

// Consultar a altura e a normal da onda na CPU (para sincronizar barcos ou personagens)
const sample = aquaEngine.evaluateWaveAt(14.6, 2.35);
meuBarco.position.y = sample.height;

// Ler diagnósticos e telemetria de performance
console.table(aquaEngine.getTelemetry());
```

---

## ⚙️ Referência de Configuração (`AquaOptics.DEFAULT_CONFIG`)

| Propriedade | Tipo | Padrão | Descrição |
| :--- | :--- | :---: | :--- |
| `mode` | `string` | `'pool'` | Modo de operação: `'pool'` (confinado) ou `'ocean'` (aberto com batimetria). |
| `quality` | `string` | `'high'` | Perfil de hardware: `'low'`, `'medium'`, `'high'` ou `'ultra'`. |
| `autoFPS` | `boolean` | `true` | Reduz automaticamente o custo de GPU se o FPS cair abaixo de `42`. |
| `ior` | `number` | `1.333` | Índice de refração na Lei de Snell (`1.333` = Água, `1.52` = Cristal). |
| `chromaticDispersion` | `number` | `0.035` | Intensidade da separação prismática nos canais R, G e B. |
| `absorptionScale` | `number` | `1.0` | Escala de absorção espectral exponencial de Beer-Lambert. |
| `causticsIntensity` | `number` | `1.35` | Multiplicador da rede de cáusticas projetada no fundo. |
| `sunGlintIntensity` | `number` | `1.35` | Intensidade da coluna solar GGX e dos glints estocásticos. |
| `waveHeight` | `number` | `0.45` | Amplitude global das ondas de Gerstner (`0.0` a `2.6`). |
| `waveChoppy` | `number` | `1.15` | Fator de empinamento trocoidal das cristas (`0.0` a `2.5`). |
| `foamIntensity` | `number` | `1.25` | Intensidade dos fios luminosos de espuma e rebentação costeira. |

---

## 📊 Perfis de Qualidade e Escalabilidade (`AquaOptics.QUALITY_PROFILES`)

- **`low` (Mobile / Integrada)**: Escala interna ~69%, 3 harmônicos de Gerstner, RTT 256px (a cada 3 frames), Clipmap `55x72`.
- **`medium` (Equilibrado)**: Escala interna ~85%, 5 harmônicos de Gerstner, RTT 512px (a cada 2 frames), Clipmap `85x108`.
- **`high` (Nativo / Padrão)**: Escala nativa 100%, 6 harmônicos de Gerstner, RTT 768px (todo frame), dispersão analítica ativa, Clipmap `120x144`.
- **`ultra` (Supersampled)**: Superamostragem ~118%, 8 harmônicos completos + capilares, RTT 1024px (todo frame), Clipmap `155x180`.
