# E360 Broadcast LED Platform — Architecture & Vision

> **For Claude Code:** This is the master briefing for a long-term, multi-year platform
> project. Read this first, every session. The goal is a proprietary broadcast graphics +
> LED + virtual-insertion ecosystem that eventually replaces commercial tools (Click Effects
> Prime, Motion Rocket, etc.) in the owner's production company, and is potentially sold as
> appliances. This is built incrementally, in the background of a running business, by one
> operator (the owner) collaborating with Claude Code. **Owner is the architect and owns all
> hardware/real-time/domain decisions. Claude Code accelerates implementation to spec.**

---

## 1. What this platform is

A render-and-playout platform for stadium/broadcast LED, structured as **one shared core
("the platform") with multiple product configurations layered on top**. Build the core once,
reuse it across products. Do NOT build five separate apps that share nothing.

### Products (layered on the platform, built in phases)
1. **Static 3D CamCarpet authoring tool** — generate perspective-correct field-carpet print
   files. Authoring/offline, NOT real-time. *(Separate near-term deliverable; can ship first.)*
2. **Fascia / LED ribbon playout** — Prime/Motion-Rocket-class graphics playout to LED ribbon.
   GPU-rendered content, file playback, zones, transitions. **Latency-insensitive.**
3. **Live feed compositing** — place live SDI camera feeds as windows/zones on the LED canvas.
   **Latency-tolerant** (a few frames fine).
4. **Double-row perspective** — multi-zone LED with per-zone perspective transform tracked to
   camera. Mixed latency profile.
5. **Virtual ad insertion** — camera-tracked chroma-key replacement of LED content in the
   broadcast feed. **THE latency-critical product. The moonshot.** Builds on owner's custom
   Novastar chroma-key build (frame-accurate keyable surface inserted at a specific point in
   the genlock refresh cycle).

---

## 2. The core architectural split (READ THIS — it drives everything)

There are **two fundamentally different processing paths**, and they must be architected
separately because their latency requirements are opposite.

### Path A — GPU / Fascia path (latency-INsensitive)
- All content that is **rendered or played from files**: graphics, branding, scoreboards,
  sponsor content, animations, video clips, static carpets.
- Source → GPU canvas → LED processor (Novastar) via GPU output (DisplayPort/HDMI).
- **No live camera in the loop.** A few frames of latency is invisible and irrelevant.
- This is the BULK of the platform and the bulk of day-to-day production use.
- **Engine: Unreal Engine is appropriate here. No latency concern.**

### Path B — Live / Insertion path (latency-CRITICAL)
- Live SDI camera in → process (warp / chroma-key / composite) → SDI out to broadcast.
- Used by: virtual ad insertion, live feed compositing.
- Latency must be **low AND consistent (low jitter)**, because the inserted content must stay
  locked to the physical LED as the camera moves.
- **Key technique: tracking-delay compensation.** Video is delayed N frames through the
  pipeline; camera tracking data is buffered the SAME N frames so they are time-aligned. You
  render the insert for the camera position matching the frame being processed, NOT the live
  position. This makes a few frames of *consistent* latency acceptable. *Variable* latency
  (jitter) is the enemy — it breaks time-alignment and the insert "swims" relative to the LED.

### Latency budget reference (verify empirically, do not trust these as gospel)
- Theoretical floor SDI→process→SDI: ~2 frames (capture 1 + process/copies ~0–1 + output 1
  + genlock alignment 0–1).
- Tight custom pipeline (AJA SDK + DirectX/CUDA): ~2–4 frames.
- Unreal-based pipeline: ~4–8 frames, MUST be measured.
- Ross XPression FX graphics keying: 1 frame (but that's graphics-over-switcher, NOT full
  camera-tracked insertion — different, smaller budget than Path B insertion).
- Insertion is workable at 3–4 *consistent* frames via tracking-delay compensation. Broadcasts
  already run several frames behind reality; nobody watches truly live.

### Architectural consequence
- **Path A → build in Unreal.** Even Ross's virtual product (Frontier) uses Unreal as its
  render core; owner's proprietary value lives in the layer on top, not in reinventing a
  renderer.
- **Path B → MEASURE Unreal's latency and jitter first (see §6). If Unreal is low+consistent,
  build insertion in Unreal too with tracking-delay compensation. If Unreal is high or jittery,
  the insertion live-path gets CUSTOM code (AJA NTV2 SDK + DirectX 11/12 or CUDA, outside
  Unreal), while everything else stays Unreal.** This is a hybrid and that's fine — it's how
  serious shops actually operate.

---

## 3. Engine decision

**Primary engine: Unreal Engine.** Rationale:
- nDisplay handles multi-output synchronized LED rendering with genlock — the single hardest
  part of a custom build, production-proven.
- Live Link handles camera tracking ingest (Vinten heads, FreeD, Stype).
- Royalty-based licensing, free to build/prototype; favorable terms for custom (non-game) apps.
- Huge talent pool, documentation, and Claude Code familiarity. Avoids bus-factor-of-one.
- Owner's proprietary IP (Novastar chroma-key integration, perspective-warp math, calibration,
  operator UI, LED ribbon stripe/layout handling) becomes Unreal plugins/modules. Build ONLY
  the parts that are the moat; rent the commodity infrastructure.

**Do NOT build a custom engine from scratch for the whole platform.** One operator cannot
out-engineer Epic on commodity rendering infrastructure. The win is building the value-add on
top of world-class infrastructure.

**Possible custom code (narrow):** the Path B insertion live-path IF measured Unreal latency
is inadequate. Custom = AJA NTV2 SDK + DirectX/CUDA, as a separate process/component.

---

## 4. Reference material (study, do not copy)
- **Vibotec source code** (on preserved Linux reference rigs / drive images): defunct virtual-ad
  company whose assets the owner acquired. Two-machine architecture: (1) calibration/tracking
  rig — reads Vinten head over serial via Archer bridge, runs a calibration pass where the
  operator pans the camera over a chroma-keyed LED to *learn the homography* mapping camera
  PTZ → LED pixels; (2) render/composite rig — ingests virtual clips (from external graphics
  like Prime/Ross via the Datapath multi-DVI card OR plays own files), warps to current camera
  perspective, composites into the keyed region, outputs to broadcast/sat truck.
  - HIGH-VALUE extraction targets: the **calibration/homography-learning algorithm**, the
    **tracking ingest / Vinten serial protocol decode**, the **perspective-warp shader**, the
    **inter-machine transform protocol**, any **lens-calibration data**.
  - **IP/legal: UNRESOLVED.** Owner must confirm what the asset purchase actually included
    before any commercial use. Defensible path = study for understanding, then CLEAN-ROOM
    reimplement in modern tools (Unreal + own code + OpenCV). Do NOT port/copy their source
    into the product. Check patent landscape (Supponor, SeenLive, any Vibotec patents) before
    going to market.
- **Click Effects Prime configs** (in repo as reference): playout XML config model, useful for
  understanding how operators configure these systems. NO source recoverable (compiled). Don't
  decompile. Use the user manual for product/market research instead.

---

## 5. Tech stack
- **Render core / Path A & possibly B:** Unreal Engine (C++ where needed, Blueprints sparingly).
- **Path B custom fallback (if needed):** C++ + AJA NTV2 SDK (autocirculate) + DirectX 11/12 or
  CUDA for warp/composite + HLSL shaders.
- **SDI/HDMI I/O:** AJA NTV2 SDK (hardware on hand: AJA Kona 5 = 12G-SDI; some rigs Kona 4 = 3G).
- **File decode:** FFmpeg (libavcodec/libavformat) for clips/image sequences.
- **Camera tracking:** Live Link (Unreal) / FreeD / Stype / direct Vinten serial. Owner has
  Vinten Vector 750i heads + Archer serial-to-network bridge.
- **IP video transport between machines:** NDI SDK (free, well-supported).
- **LED processor:** owner's custom Novastar chroma-key build (frame-accurate key in genlock
  cycle); also standard Novastar VX2000 Pro. Future: Brompton, Megapixel.
- **Operator UI:** Unreal-native UI, or a separate Qt/PyQt6 control surface talking to the
  engine over a control API. UI is NOT in the real-time path.
- **Config:** JSON or XML for layouts. (Reference: the layoutN.xml stripe-mapping model below.)

### LED ribbon stripe/repeat model (from observed production configs)
A long logical ribbon (e.g. 6400×90 as the camera sees it) is physically driven as stacked
stripes matching panel wiring. Example: 6400×90 source sliced into 4×(1600×90) stacked
vertically on the GPU output (dstY = 0, 90, 180, 270). The platform must translate **logical
layout** (long thin ribbon) → **physical layout** (stacked stripes on GPU output). Support:
scale, crop (src region → dst region), stripe/slice, repeat/tile, z-order, opacity/blend.

---

## 6. Immediate technical spike (do this EARLY, before committing Path B architecture)
**Measure real SDI round-trip latency AND jitter on the actual hardware** (dev rig: i9-10980XE
+ RTX A4000 + AJA Kona 5):
1. Build a minimal **bare AJA SDK SDI-in → SDI-out passthrough** in C++ → measure latency.
   This is the latency FLOOR.
2. Build an **Unreal SDI-in → SDI-out** pipeline → measure latency and jitter.
3. The delta is the "Unreal tax." Measure jitter (frame-to-frame variation), not just average.
4. Method: inject a visual marker / timecode, capture output, count frame delay.
5. **Decision rule:** Unreal low + consistent → build Path B in Unreal w/ tracking-delay
   compensation. Unreal high or jittery → Path B insertion live-path goes custom (AJA+DX/CUDA).

---

## 7. Build phases (incremental; each phase ships something usable / replaces a tool or proves a slice)
- **Phase 0 — Spikes:** SDI latency measurement (§6). Unreal hello-world rendering to a test
  LED panel via Novastar. Confirm AJA SDK + Unreal + Novastar chain works at all.
- **Phase 1 — Static CamCarpet authoring tool:** separate, near-term, offline. Projection +
  calibration math, print/export pipeline. *(May proceed in parallel; doesn't depend on engine.)*
- **Phase 2 — Fascia playout (Path A):** Unreal canvas, file playback, zones, scale/stripe/
  repeat, output to Novastar. First live-to-LED capability. Latency-insensitive.
- **Phase 3 — Live feed compositing (Path B-lite):** SDI ingest as a zone on the canvas.
  Latency-tolerant. Exercises the SDI ingest path.
- **Phase 4 — Camera tracking + calibration:** Live Link / Vinten ingest, homography-learning
  calibration pass (clean-room from Vibotec understanding). Per-zone perspective transform.
  Enables double-row perspective.
- **Phase 5 — Virtual ad insertion (Path B-full):** chroma-key compositing w/ Novastar key
  build, tracking-delay compensation, dynamic content ingest, broadcast output. The moonshot.
- **Phase 4b/5 — Operator UI, configs, playlists, transitions, automation API** as needed.

---

## 8. Operating principles for this project
- **Owner = architect.** Owner decides what to build, the data model, the real-time/hardware
  calls, and what "broadcast-quality" means. Claude Code implements to spec, writes tests/docs,
  explains errors, reads reference code. Claude Code must NOT make silent architectural changes.
- **Ship usable milestones.** Each phase should replace a tool or prove a slice with real-world
  value — not "impressive demo." Use real upcoming gigs as forcing functions.
- **Don't chase feature parity with Prime/Ross.** They have decades of features. Win by focus
  and tight integration with owner's LED ribbons / tracking / Novastar build, not by being a
  superset. ~20% of features cover ~90% of real show use.
- **Hardening over novelty.** ~90% of this work is reliability: 6-hour show stability, no
  dropped frames, graceful recovery from dropped SDI/crashes, reliable config load. Budget for
  it; it's the actual job, not the algorithms.
- **Document for future-self + Claude Code.** Architecture docs, per-module READMEs, and
  operational runbooks are as much the product as the code. A solo multi-year build dies if it
  becomes un-resumable after a gap.
- **Keep paying for commercial tools for years.** "Replace Prime" is a multi-year horizon.
  Develop in the background; don't starve the paying business that funds it.
- **Deployment is real engineering:** how the platform gets from dev rig → venue rack, updates,
  config backup, operator training, 9-PM-during-a-show debugging. Plan it, don't bolt it on.

### Hardware fleet (deployment + dev target)
~12 acquired workstation-class rigs (4U rack, redundant PSU), broadcast SDI I/O (Kona 5 / Kona 4),
mid-tier GPUs (RTX A4000 and up; some rigs may be Threadripper / Threadripper PRO — flag those as
heavy render/nDisplay-primary candidates). These ARE the appliance target: pre-configured hardened
production machines with the platform preloaded, drop-in to a venue rack. Higher margin + more
defensible than software-only. (Disguise, Pixotope sell appliances; so can E360.)

---

## 9. What NOT to do
- Don't build a from-scratch custom engine for the whole platform.
- Don't put live cameras in Path A or treat all sources as equal — respect the A/B split.
- Don't copy Vibotec source into the product (IP). Clean-room reimplement.
- Don't decompile Click Effects binaries.
- Don't try to ship all products at once or design every feature up front.
- Don't let Claude Code run destructive/agentic operations on production rigs. Suggest-and-
  confirm for anything touching real hardware or live shows.
