# FASCIA PLAYOUT ENGINE — Build Spec (Product 1)

> **For Claude Code:** This is the spec for the FIRST product on the platform described in
> `PLATFORM.md` (read that first). This is pure **Path A** (latency-insensitive, GPU-rendered
> content to LED). It exercises the core canvas / zone / playback / ingest model the whole
> platform depends on. Build it in **Unreal Engine**. Owner is the architect; implement to this
> spec, surface questions, do not make silent architectural changes. Build incrementally in the
> phase order at the end — each phase should produce something runnable and testable.

---

## 1. What this product is

A button-driven LED ribbon / fascia playout engine. The operator imports video content, assigns
it to named output **zones**, and triggers it via **container** buttons that update multiple zones
at once. Always-on multi-zone preview. Output to a GPU display feeding an LED processor (Novastar).

This is the E360 equivalent of a Prime / Motion-Rocket fascia playout, scoped tight and built on
a clean data model.

---

## 2. Core data model

```
Zone (= Channel)   Named, persistent output region. ≥10 of them. Each has its OWN independent
                   playback state and a transform/layout (position, size, scale/crop; later:
                   stripe/repeat/perspective). A zone keeps showing its current content until
                   something explicitly changes it.

Clip               An imported video, conditioned to the internal playback format (see §5).
                   Per-clip properties: fade-in, fade-out, play-once / loop-N / loop-infinite.

Assignment         (Clip → Zone). A clip playing in a specific zone.

Container          A named button holding a SET of Assignments, fired together as one action.
                   A container is a SPARSE UPDATE: it changes only the zones it addresses; zones
                   it does not address keep playing whatever they had. Container settings
                   SUPERSEDE clip settings when fired via that container. Container config:
                     - transition: crossfade (default) | cut
                     - synchronize start: standard/always (all addressed clips start same frame)
                     - synchronize looping: optional checkbox — ONLY available when all clips in
                       the container are the SAME duration. If clips differ in length, sync-loop
                       is disabled/greyed; clips sync on start then loop independently.

Remote             A special container variant for MULTI-MACHINE sync (DEFERRED to a later phase,
                   but DESIGNED IN now). Strict synchronization + a network pathway: firing a
                   remote on machine A can trigger assigned clips on machine B (C, D…). Requires a
                   shared clock (PTP / genlock) and scheduled-start (send "play at timecode T",
                   both machines wait for T on shared clock). Clips must be pre-distributed to all
                   target machines. Build the container model so Remote is a clean extension, not
                   a bolt-on — but DO NOT implement networking until the local engine is solid.
```

### Key behavioral rule (do not get this wrong)
The engine is **N independent zone players**, not one global program state. Containers are sparse
commands that touch only their addressed zones. Example: zones 1, 2, 3 are playing; fire a
container with clips for 1 and 3 → zones 1 and 3 change, zone 2 is untouched and keeps playing.

---

## 3. UI (button-page interface)

- **Button grid** of container buttons. Press → fire that container.
- **Always-on multi-zone preview**: a monitor-wall view showing what is CURRENTLY playing on
  EACH zone, live, at all times (not a single program preview — all zones visible simultaneously).
- **Configuration surfaces** (modals/panels):
  - Zone config: name, position, size, transform/layout. Set up the ≥10 zones.
  - Clip config: import, set fade-in/out, play-once/loop-N/loop-infinite, view ready-state.
  - Container config: name, the set of (clip→zone) assignments, transition (crossfade/cut),
    sync-start (always on), sync-loop (only when clip lengths match).
- Clips that are still transcoding show a **"processing…"** state and are not yet playable;
  they flip to **"ready"** when ingest completes (see §5).

UMG for the UI. The UI is NOT in the real-time render path.

---

## 4. Rendering / output

- Each zone renders to its own **render target** (texture). Zones composite onto a virtual canvas.
- Canvas → **GPU output (DisplayPort/HDMI)** feeding the LED processor (Novastar). Owner will have
  a GPU output set up for debugging.
- Transitions (crossfade / cut) operate per-zone when a container updates that zone.
- v1 transforms: position, size, scale/fit, crop. LATER: stripe/slice, repeat/tile, perspective.
- **Stripe/repeat model (later phase):** translate LOGICAL layout (long thin ribbon, e.g. 6400×90)
  to PHYSICAL layout (stacked stripes on the GPU output, e.g. 4×1600×90 at dstY 0/90/180/270).
  Support src-region → dst-region, scale, slice, repeat, z-order, opacity/blend.

### GPU output vs SDI (architectural note)
Fascia content goes out **GPU output (DisplayPort/HDMI) → LED processor**, NOT through the AJA
Kona. GPU output is higher-bandwidth, supports arbitrary ribbon resolutions (SDI is locked to
broadcast standards and cannot carry 6400×90), and avoids a needless GPU→CPU→SDI conversion. The
Kona/SDI domain is for the LIVE/insertion path (other products), not fascia. Exception: a venue
whose LED processor only accepts SDI input — then output fascia over the Kona for distribution,
accepting the SDI resolution constraint. Not the default.

---

## 5. Ingest pipeline (transcode-on-import) — its own module

**Principle:** normalize ALL incoming media to ONE controlled internal playback format at import
time, so the real-time playback engine only ever deals with one perfectly-playable format. This
pushes all codec complexity to a one-time, offline, background step where latency/convenience
don't matter, and guarantees flawless playback at show time.

### Internal playback format
- **Start with HAP / HAP R** as the internal format (intra-frame, GPU-decoded, no practical
  resolution limit, frame-accurate seek/loop — built for real-time ultra-wide LED playback).
- Keep the door open to evolve toward a proprietary **GPU-ready pre-conditioned frame** format
  (frames stored in the exact pixel layout the GPU wants, pre-sliced into zone/stripe layout,
  memory-mapped straight into textures) IF HAP's GPU decode ever becomes a bottleneck for extreme
  ultra-wide real-time playback. Do NOT start here — HAP first.
- **Do NOT design a novel codec.** Wrap FFmpeg for decode (it decodes essentially everything);
  encode to the chosen internal format. The value is the pipeline + integration, not compression.

### Accepted input formats (published ingest spec)
- **Standard zones (≤ 8192 px any dimension):** ProRes 422 HQ / 4444, DNxHR HQX, or high-bitrate
  H.264/H.265. (H.264 practical ceiling ~4096 wide; H.265 ~8192. ProRes/DNxHR ~8192 wide.)
- **Ultra-wide (> 8192 px wide — perimeter/fascia):** these have NO clean single-file delivery
  codec, so accept formats with no practical width limit:
    - **Image sequence** (PNG / TGA / EXR / DPX) — no width limit, frame-accurate, loops perfectly
    - **HAP / HAP R .mov** — no practical width limit, plays directly
    - **QuickTime Animation (RLE)** — goes very wide, lossless, alpha-capable; great for wide
      flat-graphic/looping authoring (note: RLE compresses poorly on photographic/gradient
      content and is CPU-decoded, so accept it as an INGEST format, transcode to internal — don't
      play it back directly)
    - **Pre-tiled sections** — perimeter divided into per-zone normal-resolution files played in sync
- All content: declare target frame rate (owner's standard, e.g. 60p), colorspace, and any loop-
  point conventions in the published spec.

### Ingest must be ASYNCHRONOUS (this is critical for usability)
Transcoding is slow — especially ultra-wide content (can be several× slower than real-time). DO
NOT block the UI on import. Architecture:

```
User clicks Import
  → file registered in library IMMEDIATELY (state: "processing")
  → added to a background transcode QUEUE
  → user keeps working (build containers, config zones, import more)
  → background workers transcode → internal format
  → clip flips to "ready" (thumbnail + duration populated)
  → now assignable/playable
```

- **Background, non-blocking, queued.** Multiple files transcode in parallel (18-core CPU; chew
  through several at once).
- **GPU-accelerated transcode** where possible (NVENC/NVDEC on the A4000) to speed decode/encode.
- **Skip-if-already-conditioned:** if a file arrives already in the internal format at the right
  settings, validate + register only — no transcode.
- **Persistent library cache:** transcode once, reuse forever across shows.
- **State tracking per clip:** processing / ready / failed. UI reflects it. Playing a not-ready
  clip is disallowed (zone shows not-ready for that window).
- **Optional "play as-is" path** for a clip the operator knows is already fine (already HAP, or a
  small one-shot H.264) — skip transcode, register and play directly.

**Operational framing:** ingest is a PREP activity (load-in / rehearsal), not a SHOW activity.
Transcode time is paid during setup when there's slack; by show time everything is in the fast
internal format. Slow import is acceptable BECAUSE it's backgrounded and done ahead of the show.

---

## 6. Playback behavior details (decisions already made)

- **Zones are persistent:** keep current content until explicitly changed.
- **Containers are sparse updates:** touch only addressed zones.
- **Container settings supersede clip settings** when fired via that container.
- **Sync start:** standard/always for all clips in a container.
- **Sync loop:** optional; ONLY available when all clips in the container share the same duration.
  Different-length clips in a container ⇒ sync-loop disabled; clips loop independently after a
  synced start.
- **Transition:** per-container, crossfade (default) or cut. Crossfade blends new clip with
  outgoing content on the affected zone; cut is instant replace.
- **Clip loop modes:** play-once (then hold last frame — confirm with owner if black/clear is
  wanted instead), loop-N-times, loop-infinite. Fade-in/fade-out per clip (container may override).

> OPEN ITEM to confirm with owner during build: what play-once does at end (hold last frame vs
> go black vs clear the zone). Default assumption: hold last frame. Flag, don't guess silently.

---

## 7. Tech approach (Unreal-specific)

- **Video playback:** Unreal Media Framework (Media Player / Media Texture). VERIFY HAP decode in
  Unreal early — likely needs a HAP plugin; this is a Phase-0 spike. If HAP-in-Unreal is painful,
  that's a real data point (fascia playout might want a lighter non-Unreal player while Unreal is
  reserved for tracking/insertion/3D). Find out by trying, not guessing.
- **Zones:** per-zone render targets composited to a canvas; output to GPU display.
- **UI:** UMG for button grid, preview wall, config modals.
- **Ingest:** separate offline module wrapping FFmpeg (with NVENC/NVDEC). Runs as background
  workers / separate process; communicates clip state to the engine. NOT in the real-time path.
- **Config persistence:** JSON or XML for zones / clips / containers (the saved "show file").

---

## 8. Build order (incremental; each step runnable/testable)

- **Phase 0 — Spikes (do FIRST):**
  - Unreal hello-world rendering a test pattern to a GPU output → into the Novastar → onto a test
    LED panel. Prove the Unreal→GPU-output→Novastar→LED chain works at all.
  - Verify HAP decode in Unreal (plugin?). Verify FFmpeg→HAP encode chain (the ingest side).
  - (From PLATFORM.md, separately: SDI round-trip latency/jitter measurement — for later products,
    not this one, but do it while hardware is set up.)
- **Phase 1 — Zones + single-clip playback:** define ≥10 named zones with position/size; play ONE
  imported clip (internal format, assume pre-conditioned) in a zone; render to GPU output; basic
  preview of zones.
- **Phase 2 — Clip properties + multi-zone:** fade in/out, play-once/loop-N/loop-infinite;
  multiple zones each with independent persistent state playing simultaneously.
- **Phase 3 — Containers:** container data model; button-grid UI; sparse-update firing (touch only
  addressed zones); sync-start; transition (crossfade/cut); container-overrides-clip settings;
  sync-loop option gated on equal clip lengths.
- **Phase 4 — Ingest pipeline:** async background transcode queue (FFmpeg + NVENC/NVDEC) →
  internal format; clip state (processing/ready/failed); skip-if-conditioned; persistent library;
  accept the tiered input formats from §5; play-as-is option.
- **Phase 5 — Always-on multi-zone preview wall** (full fidelity), config save/load (show files),
  polish.
- **Phase 6 — Richer zone transforms:** stripe/slice, repeat/tile, logical→physical ribbon
  mapping. (Toward real perimeter layouts.)
- **Phase 7+ (DEFERRED) — Remotes / multi-machine sync:** PTP/genlock shared clock, scheduled-
  start network triggering, content pre-distribution, Remote button type. Designed-in from Phase 3
  (container model knows Remotes are coming), implemented only once local engine is rock-solid.

---

## 9. Don'ts
- Don't treat all zones as one global state — respect independent persistent zone players.
- Don't block the UI on transcode — ingest is async/background/queued.
- Don't design a novel codec — wrap FFmpeg, normalize to a known internal format.
- Don't play CPU-heavy formats (Animation) in real time — accept at ingest, transcode out.
- Don't route fascia through the Kona — GPU output to the LED processor (see §4 exception).
- Don't implement multi-machine networking until the single-machine engine is solid.
- Don't make silent architectural changes — surface decisions (e.g. the play-once open item) to
  the owner.
