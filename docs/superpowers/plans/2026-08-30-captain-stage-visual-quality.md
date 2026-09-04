# Captain Stage Visual Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the floating-card captain composition with an integrated captain stage, deepen all ten fleet skins into distinct multi-layer visual systems, and verify the complete desktop experience without publishing it.

**Architecture:** Keep `FleetSkinProvider`, `CaptainOrchestrator`, `CaptainHost`, and the renderer boundary as the single runtime path. Extract layout selection into a pure module, add a route-owned `CaptainStageLayout` that supplies a stable slot to the one global host, extend the manifest and asset registry for multi-layer scenes and safe areas, then update the ten visual families and regression harness. Do not create a second theme provider or duplicate pages per fleet.

**Tech Stack:** React 19, TypeScript 6, Zod 4, Motion 12, CSS layers/Tailwind 4, Vitest 4 with happy-dom, Playwright 1.62, Electron 42, pnpm 11.

**Spec:** `docs/superpowers/specs/2026-08-30-captain-stage-visual-quality-design.md`

## Global Constraints

- The captain stage occupies 34%–40% of available workspace width, with a 360 px minimum and 560 px maximum.
- Deck mode uses a 240–300 px companion presentation; compact mode is at most 72 px.
- Required skin assets commit atomically after preload; the visible transition lasts 250–450 ms.
- The feature must not create a main-thread task longer than 100 ms and targets stable 60 FPS.
- Raster assets have a maximum edge of 4096 px; load the active fleet and at most one predicted fleet.
- Voice starts muted, requires explicit enablement, always has captions, and never enables the microphone.
- Body and interactive text must meet WCAG AA; focus and non-text controls must reach at least 3:1 contrast.
- High-contrast mode retains each fleet's graphic, typographic, and composition identity instead of collapsing to one generic black-and-white skin.
- No remote asset URL, arbitrary path, CSS, HTML, script, runtime download, or third-party skin execution is allowed.
- Do not call the layered renderer Live2D or Cubism; preserve the existing future renderer seam.
- Ten fleets, three display modes, reduced motion, and high contrast require at least 50 accepted visual baselines.
- Verify 1024×640, 1280×720, 1440×900, 1920×1080, and 2560×1440 layouts.
- Do not publish, create a Release, push, or send external messages as part of this plan.

---

## File Structure

### New focused files

- `src/captain/captain-layout.ts`: pure route/context/viewport-to-layout decision; no DOM access.
- `src/captain/captain-layout.test.ts`: layout decision table and boundary tests.
- `src/components/captain/CaptainStageLayout.tsx`: scene/content/captain slot composition only.
- `src/components/captain/CaptainStageLayout.test.tsx`: stable-slot, accessibility, and mode-markup tests.
- `src/styles/captain-stage.css`: stage/deck/compact composition and responsive rules.
- `tests/visual/window-sizes.ts`: the closed viewport matrix shared by visual and Electron checks.
- `docs/verification/captain-stage-visual-quality-2026-08-30.md`: final evidence and unresolved risks.

### Existing files changed by responsibility

- `src/components/captain/CaptainHost.tsx`: consume a resolved decision; keep controls, collision downgrade, renderer boundary, and voice UI.
- `src/components/captain/LayeredCaptainRenderer.tsx`: consume safe-area and expanded composition tokens; no route logic.
- `src/components/app-shell/CaptainAppShellSurface.tsx`: compute the decision once and preserve one host across route changes.
- `src/components/app-shell/AppShell.tsx`: render the additional scene layers and pass stage intent to route content.
- `src/routes/Fleet/index.tsx`, `src/routes/Voyage/index.tsx`, `src/routes/Chat/index.tsx`: use `CaptainStageLayout`; no fleet-ID branches.
- `src/skins/fleet-skin-schema.ts`: version 1.1 multi-layer scene and typed safe-area contract.
- `src/skins/fleet-skin-assets.ts`: total static registry for the expanded closed asset set.
- `src/skins/fleet-skins.ts`: ten complete manifest literals with 34%–40% stage compositions.
- `src/components/FleetSkinProvider.tsx`: map new manifest fields to CSS variables in the existing atomic transaction.
- `src/styles/fleet-skins.css`, `src/styles/captain.css`, `src/styles/app-shell.css`: global scene materials, captain rendering, and shell integration.
- `src/captain/captain-types.ts`, `src/captain/captain-reducer.ts`, `src/components/app-shell/useCaptainAppEvents.ts`: semantic fleet/input events only where the existing bridge lacks them.
- `resources/xingchao/skins/**`: accepted original raster/SVG assets only.
- `resources/xingchao/skins/PROVENANCE.md`: one auditable row for every retained or replaced asset.
- `tests/visual/VisualHarness.tsx`, `tests/visual/visual.css`, `tests/visual/fleet-skins.visual.spec.ts`: production-shaped visual coverage.
- `tests/e2e/fleet-skins.electron.spec.ts`: persistence, speech, rollback, viewport, and console checks.

---

### Task 1: Extract the Deterministic Workspace Layout Contract

**Files:**

- Create: `src/captain/captain-layout.ts`
- Create: `src/captain/captain-layout.test.ts`
- Modify: `src/captain/captain-types.ts`
- Modify: `src/components/captain/CaptainHost.tsx`
- Test: `src/components/captain/CaptainHost.test.tsx`
- Modify: `src/components/app-shell/CaptainAppShellSurface.tsx`
- Test: `src/components/app-shell/CaptainAppShellSurface.test.tsx`

**Interfaces:**

- Produces: `CaptainWorkspaceMode`, `CaptainLayoutRequest`, `CaptainLayoutDecision`, `resolveCaptainWorkspaceLayout(request)`.
- Consumes: `AppShellRoute` and existing `CaptainDisplayMode`.
- `deck` is a workspace layout name; it maps to the existing renderer display mode `companion`.

- [ ] **Step 1: Write the failing decision-table tests**

```ts
import { describe, expect, it } from "vitest"
import { resolveCaptainWorkspaceLayout } from "./captain-layout.ts"

describe("resolveCaptainWorkspaceLayout", () => {
  it.each([
    [{ route: "fleet", viewportWidth: 1440 }, ["stage", "stage", 360, 560]],
    [{ route: "voyage", viewportWidth: 1280 }, ["stage", "stage", 360, 560]],
    [{ route: "chat", viewportWidth: 1440, chatIsEmpty: true }, ["stage", "stage", 360, 560]],
    [{ route: "chat", viewportWidth: 1440, chatIsEmpty: false }, ["deck", "companion", 240, 300]],
    [{ route: "skills", viewportWidth: 1440 }, ["deck", "companion", 240, 300]],
    [{ route: "settings", viewportWidth: 1920 }, ["compact", "compact", 0, 72]],
    [{ route: "fleet", viewportWidth: 1279 }, ["compact", "compact", 0, 72]],
  ] as const)("resolves %o", (input, expected) => {
    const result = resolveCaptainWorkspaceLayout({
      activeProject: false,
      activeSessionId: null,
      activeTask: false,
      chatIsEmpty: false,
      modalOpen: false,
      ...input,
    })
    expect([result.workspaceMode, result.displayMode, result.minWidth, result.maxWidth]).toEqual(expected)
  })
})
```

- [ ] **Step 2: Run RED**

Run: `corepack pnpm run test src/captain/captain-layout.test.ts`

Expected: FAIL because `captain-layout.ts` does not exist.

- [ ] **Step 3: Implement the pure contract and move route rules out of the host**

```ts
export type CaptainWorkspaceMode = "stage" | "deck" | "compact"

export interface CaptainLayoutRequest {
  readonly route: AppShellRoute
  readonly viewportWidth: number
  readonly activeSessionId: string | null
  readonly chatIsEmpty: boolean
  readonly activeProject: boolean
  readonly activeTask: boolean
  readonly modalOpen: boolean
}

export interface CaptainLayoutDecision {
  readonly workspaceMode: CaptainWorkspaceMode
  readonly displayMode: CaptainDisplayMode
  readonly minWidth: number
  readonly maxWidth: number
  readonly integrated: boolean
  readonly reservesContent: boolean
}

export function resolveCaptainWorkspaceLayout(request: CaptainLayoutRequest): CaptainLayoutDecision
```

Use closed route sets. `stage` is integrated and does not reserve content padding. `deck` is not integrated and reserves content. `compact` does neither. Preserve the existing modal downgrade and active-project/task behavior.

- [ ] **Step 4: Update `CaptainHost` to accept `decision: CaptainLayoutDecision`**

Remove the exported resolver and route sets from `CaptainHost.tsx`. Move the existing `useViewportWidth` hook into `CaptainAppShellSurface.tsx`, compute `CaptainLayoutDecision` there, and pass it to the host. Keep collision handling as an effective-mode downgrade that never mutates the pure decision. Update the Surface test renderer in the same step so this task compiles independently before Task 2 introduces `CaptainStageLayout`.

- [ ] **Step 5: Run GREEN and regression tests**

Run: `corepack pnpm run test src/captain/captain-layout.test.ts src/components/captain/CaptainHost.test.tsx src/components/app-shell/CaptainAppShellSurface.test.tsx`

Expected: PASS, including 1279/1280 and 1179/1180 boundaries.

- [ ] **Step 6: Type-check and commit**

```powershell
corepack pnpm run ts-check
git add -- src/captain/captain-layout.ts src/captain/captain-layout.test.ts src/captain/captain-types.ts src/components/captain/CaptainHost.tsx src/components/captain/CaptainHost.test.tsx src/components/app-shell/CaptainAppShellSurface.tsx src/components/app-shell/CaptainAppShellSurface.test.tsx
git commit -m "refactor: extract captain workspace layout"
```

---

### Task 2: Add the Stable Captain Stage Composition Boundary

**Files:**

- Create: `src/components/captain/CaptainStageLayout.tsx`
- Create: `src/components/captain/CaptainStageLayout.test.tsx`
- Create: `src/styles/captain-stage.css`
- Modify: `src/components/app-shell/CaptainAppShellSurface.tsx`
- Modify: `src/components/app-shell/CaptainAppShellSurface.test.tsx`
- Modify: `src/routes/Fleet/index.tsx`
- Modify: `src/routes/Voyage/index.tsx`
- Modify: `src/routes/Chat/index.tsx`
- Modify: `src/index.css`

**Interfaces:**

- Consumes: `CaptainLayoutDecision` from Task 1.
- Produces: `CaptainStageLayout({ decision, captain, children })` and one stable `[data-captain-host-slot]`.
- The same `CaptainHost` React instance must survive `stage → deck → compact → stage` updates.

- [ ] **Step 1: Write failing stable-slot tests**

```tsx
it("keeps one host and one slot while workspace modes change", () => {
  const view = renderLayout(stageDecision)
  const host = view.container.querySelector("[data-captain-host]")
  const slot = view.container.querySelector("[data-captain-host-slot]")
  view.update(deckDecision)
  view.update(compactDecision)
  view.update(stageDecision)
  expect(view.container.querySelector("[data-captain-host]")).toBe(host)
  expect(view.container.querySelector("[data-captain-host-slot]")).toBe(slot)
  expect(view.container.querySelectorAll("[data-captain-host]")).toHaveLength(1)
})

it("marks only stage as an integrated visual plane", () => {
  const view = renderLayout(stageDecision)
  expect(view.container.querySelector("[data-captain-stage-layout]")?.getAttribute("data-workspace-mode")).toBe("stage")
  expect(view.container.querySelector("[data-captain-content]")?.getAttribute("data-captain-reserved")).toBe("false")
})
```

- [ ] **Step 2: Run RED**

Run: `corepack pnpm run test src/components/captain/CaptainStageLayout.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the stable markup**

```tsx
export interface CaptainStageLayoutProps {
  readonly captain: React.ReactNode
  readonly children: React.ReactNode
  readonly decision: CaptainLayoutDecision
}

export function CaptainStageLayout({ captain, children, decision }: CaptainStageLayoutProps) {
  return (
    <div data-captain-stage-layout data-workspace-mode={decision.workspaceMode} className="captain-stage-layout">
      <div
        className="captain-stage-layout__content"
        data-captain-content
        data-captain-reserved={decision.reservesContent}
      >
        {children}
      </div>
      <div className="captain-stage-layout__slot" data-captain-host-slot>
        {captain}
      </div>
    </div>
  )
}
```

Keep both children mounted in all modes. CSS changes layout; React conditionals must not relocate or duplicate the captain.

- [ ] **Step 4: Integrate the Shell seam and routes**

`CaptainAppShellSurface` owns viewport width, computes one decision, renders `CaptainAppEventBridge`, then `CaptainStageLayout`. Remove page-owned empty placeholder slots from Fleet and Voyage. Add a stage-safe empty-chat content wrapper in `Chat/index.tsx`; do not alter the populated chat DOM hierarchy.

- [ ] **Step 5: Add minimal structural CSS**

```css
.captain-stage-layout {
  position: relative;
  min-width: 0;
  min-height: 0;
  height: 100%;
}
.captain-stage-layout__content {
  min-width: 0;
  min-height: 0;
  height: 100%;
}
.captain-stage-layout[data-workspace-mode="stage"] .captain-stage-layout__slot {
  position: absolute;
  inset-block: var(--app-titlebar-height) 0;
  inset-inline-end: 0;
  width: clamp(360px, var(--fleet-captain-stage-width), 560px);
  pointer-events: none;
}
```

- [ ] **Step 6: Run GREEN, type-check, and commit**

```powershell
corepack pnpm run test src/components/captain/CaptainStageLayout.test.tsx src/components/app-shell/CaptainAppShellSurface.test.tsx
corepack pnpm run ts-check
git add -- src/components/captain/CaptainStageLayout.tsx src/components/captain/CaptainStageLayout.test.tsx src/components/app-shell/CaptainAppShellSurface.tsx src/components/app-shell/CaptainAppShellSurface.test.tsx src/routes/Fleet/index.tsx src/routes/Voyage/index.tsx src/routes/Chat/index.tsx src/styles/captain-stage.css src/index.css
git commit -m "feat: integrate the captain stage layout"
```

---

### Task 3: Produce and Audit the New Scene Layers

**Required skill:** `imagegen`. Inspect every generated raster before accepting it. Do not use Python or canvas scripts for image editing.

**Files:**

- Modify: `src/skins/fleet-skin-assets.test.ts`
- Create for each crew: `resources/xingchao/skins/<crew>/scene-midground.webp`
- Create for each crew: `resources/xingchao/skins/<crew>/scene-light.webp`
- Modify: `resources/xingchao/skins/PROVENANCE.md`

**Interfaces:**

- Produces twenty original local assets for the version 1.1 registry in Task 4.
- `scene-midground.webp`: 1920×1080, opaque or alpha-preserving, no character/text/logo.
- `scene-light.webp`: 1920×1080 with transparency, no text/logo, clear face and work safe areas.

- [ ] **Step 1: Add failing binary inventory tests**

```ts
const addedFiles = ["scene-midground.webp", "scene-light.webp"] as const
for (const crewId of BUILTIN_CREW_IDS) {
  for (const file of addedFiles) {
    const path = resolve("resources/xingchao/skins", crewId, file)
    expect(readFileSync(path).subarray(0, 4).toString("ascii")).toBe("RIFF")
  }
}
expect(new Set(midgroundHashes).size).toBe(10)
expect(new Set(lightHashes).size).toBe(10)
```

Also assert no new file is zero-length and no raster edge exceeds 4096 px using the repository's existing WebP header helper.

- [ ] **Step 2: Run RED**

Run: `corepack pnpm run test src/skins/fleet-skin-assets.test.ts`

Expected: FAIL listing the twenty missing files.

- [ ] **Step 3: Generate the ten midgrounds**

Use the corresponding accepted backdrop as a visual reference. Every prompt must include: `original desktop AI command workspace; 16:9; no people; no text; no logo; no watermark; center-left work-safe negative space; right-side captain-safe lighting; cinematic depth; fleet-specific architecture; not a recolor of another fleet`.

Use these exact subjects:

```text
watchtide: brass navigation consoles and curved deep-sea bridge windows
ink-sail: layered manuscript desks, lacquer shelves and controlled ink atmosphere
brocade-harbor: jade-glass design stations, coral illumination and textile geometry
forge-vessel: gunmetal gantries, tool rails and electric-blue engineering terminals
golden-scale: obsidian analytical consoles, gold calibration rings and emerald data channels
helm-order: warm archive counters, process boards and orderly paper systems
iron-code: burgundy tribunal desks, ivory architectural ribs and sealed dossiers
lighthouse: indigo library galleries, index constellations and warm beacon lamps
phantom-wave: audiovisual consoles, spectrum arcs and violet-cyan studio tracks
rest-harbor: sunlit planning table, linen panels, travel maps and sage woodwork
```

- [ ] **Step 4: Generate the ten transparent light overlays**

Each overlay must contain only fleet-specific light shafts, rim light, dust/particles or restrained reflections. The center-left command area and the captain face rectangle defined in the manifest must remain visually clear. Reject black flattened backgrounds, text artifacts, fake interface text, logos, and repeated generated motifs.

- [ ] **Step 5: Inspect and record provenance**

Inspect at 100% and fit-to-window. Record path, date, `AI-generated original`, tool/model, prompt family, edits, license `Apache-2.0 project asset`, alpha status, safe-area decision, and accepted/rejected retry note.

- [ ] **Step 6: Run GREEN and commit**

```powershell
corepack pnpm run test src/skins/fleet-skin-assets.test.ts
git add -- src/skins/fleet-skin-assets.test.ts resources/xingchao/skins
git commit -m "assets: add multi-layer fleet scenes"
```

---

### Task 4: Migrate the Skin Contract and Atomic CSS Mapping to Version 1.1

**Files:**

- Modify: `src/skins/fleet-skin-schema.ts`
- Modify: `src/skins/fleet-skin-schema.test.ts`
- Modify: `src/skins/fleet-skin-assets.ts`
- Modify: `src/skins/fleet-skin-assets.test.ts`
- Modify: `src/skins/fleet-skins.ts`
- Modify: `src/skins/fleet-skins.test.ts`
- Modify: `src/components/FleetSkinProvider.tsx`
- Modify: `src/components/FleetSkinProvider.test.tsx`
- Modify: `src/skins/fleet-skin-css.test.ts`

**Interfaces:**

- Produces: `FLEET_SKIN_SCHEMA_VERSION = "1.1.0"`, eighty closed asset IDs, typed safe areas, and CSS variables for all scene layers.
- Preserves: `validateFleetSkinManifest`, `requiredFleetSkinAssets`, `fleetSkinAssetUrl`, `resolveFleetSkin`.

- [ ] **Step 1: Write failing schema and atomic-commit tests**

```ts
expect(FLEET_SKIN_ASSET_IDS).toHaveLength(80)
expect(validateFleetSkinManifest(manifest).scene.midground).toBe("watchtide.scene.midground")
expect(validateFleetSkinManifest(manifest).scene.light).toBe("watchtide.scene.light")
expect(validateFleetSkinManifest(manifest).captain.stage.stageWidthPercent).toBeGreaterThanOrEqual(34)
expect(validateFleetSkinManifest(manifest).captain.stage.stageWidthPercent).toBeLessThanOrEqual(40)
expect(validateFleetSkinManifest(manifest).captain.stage.maxWidthPx).toBeLessThanOrEqual(560)
expect(validateFleetSkinManifest(manifest).captain.stage.minWidthPx).toBe(360)
```

Observe the root element and assert `--fleet-scene-backdrop`, `--fleet-scene-midground`, `--fleet-scene-foreground`, `--fleet-scene-light`, captain asset variables, and `data-fleet-skin` change in one MutationObserver delivery after required preload succeeds.

- [ ] **Step 2: Run RED**

Run: `corepack pnpm run test src/skins/fleet-skin-schema.test.ts src/components/FleetSkinProvider.test.tsx`

Expected: FAIL on schema version, missing roles, and absent CSS variables.

- [ ] **Step 3: Implement the exact typed structures**

```ts
export interface SafeAreaInsets {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

export interface StageCaptainComposition extends CaptainCompositionBase {
  readonly stageWidthPercent: number
  readonly minWidthPx: 360
  readonly maxWidthPx: number
  readonly contentSafeArea: SafeAreaInsets
  readonly captionSafeArea: SafeAreaInsets
}

export interface CompanionCaptainComposition extends CaptainCompositionBase {
  readonly companionWidthPx: number
}

export interface CompactCaptainComposition extends CaptainCompositionBase {
  readonly compactSizePx: number
}
```

Bound every safe-area side to `0..45`. Add `scene.midground` and `scene.light` to the closed roles. Require base, uniform, static, backdrop, midground, foreground, light, and crest for each built-in crew.

- [ ] **Step 4: Update all ten literal manifests and the total registry**

Do not generate manifests by spreading one base skin and changing colors. Give each stage composition its own focus and safe areas. Use 34%–40%, 360 px minimum, 560 px maximum; retain 240–300 px companion and at-most-72 px compact values.

- [ ] **Step 5: Extend the provider's one-shot variable map**

```ts
variables["--fleet-scene-backdrop"] = cssUrl(fleetSkinAssetUrl(manifest.scene.backdrop))
variables["--fleet-scene-midground"] = cssUrl(fleetSkinAssetUrl(manifest.scene.midground))
variables["--fleet-scene-foreground"] = cssUrl(fleetSkinAssetUrl(manifest.scene.foreground))
variables["--fleet-scene-light"] = cssUrl(fleetSkinAssetUrl(manifest.scene.light))
variables["--fleet-captain-stage-min-width"] = `${manifest.captain.stage.minWidthPx}px`
variables["--fleet-captain-stage-max-width"] = `${manifest.captain.stage.maxWidthPx}px`
```

Required preload includes all four scene layers and captain base/uniform/static. A missing required layer must roll back to the old complete skin.

- [ ] **Step 6: Run GREEN, security regressions, and commit**

```powershell
corepack pnpm run test src/skins/fleet-skin-schema.test.ts src/skins/fleet-skin-assets.test.ts src/skins/fleet-skins.test.ts src/skins/fleet-skin-css.test.ts src/components/FleetSkinProvider.test.tsx
corepack pnpm run ts-check
git add -- src/skins src/components/FleetSkinProvider.tsx src/components/FleetSkinProvider.test.tsx
git commit -m "feat: deepen the fleet skin contract"
```

---

### Task 5: Integrate the Captain Visually Instead of Rendering a Floating Card

**Files:**

- Modify: `src/components/captain/CaptainHost.tsx`
- Modify: `src/components/captain/CaptainHost.test.tsx`
- Modify: `src/components/captain/LayeredCaptainRenderer.tsx`
- Modify: `src/components/captain/LayeredCaptainRenderer.test.tsx`
- Modify: `src/styles/captain.css`
- Modify: `src/styles/captain-stage.css`
- Modify: `src/styles/fleet-skins.css`
- Modify: `src/styles/app-shell.css`
- Modify: `src/components/app-shell/AppShell.tsx`

**Interfaces:**

- Consumes: Task 4 scene and safe-area variables.
- Produces: one integrated stage plane, one deck companion, and one compact entry without duplicated host state.

- [ ] **Step 1: Write failing DOM and style-contract tests**

Assert stage mode has no floating-card class, no decorative border/background, and no content reservation; deck retains content reservation; compact stays within 72 px. Assert the renderer exposes `data-content-safe-area` and `data-caption-safe-area` derived from the manifest, not route code.

```tsx
expect(stageHost.classList).toContain("captain-host--integrated")
expect(stageHost.querySelector(".captain-host__decorative")).toHaveAttribute("data-integrated", "true")
expect(content).toHaveAttribute("data-captain-reserved", "false")
expect(deckContent).toHaveAttribute("data-captain-reserved", "true")
```

- [ ] **Step 2: Run RED**

Run: `corepack pnpm run test src/components/captain/CaptainHost.test.tsx src/components/captain/LayeredCaptainRenderer.test.tsx`

Expected: FAIL because stage still uses overlay card chrome and old bounds.

- [ ] **Step 3: Add all four global scene layers**

```tsx
<div className="oo-fleet-scene" aria-hidden="true">
  <div className="oo-fleet-scene-backdrop" />
  <div className="oo-fleet-scene-midground" />
  <div className="oo-fleet-scene-scrim" />
  <div className="oo-fleet-scene-foreground" />
  <div className="oo-fleet-scene-light" />
</div>
```

The scene remains pointer-inert and below navigation, content, captain controls, dialogs, and window chrome.

- [ ] **Step 4: Implement integrated stage CSS**

Use a borderless transparent stage host, full-height person composition, fleet-specific rim light, and a separate glass command deck. Do not put the captain back into a rounded rectangular picture card. Keep captions outside the face safe area and controls on an explicit control rail.

```css
.captain-host--integrated .captain-host__decorative {
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: visible;
}
.captain-host--integrated {
  width: clamp(
    var(--fleet-captain-stage-min-width),
    var(--fleet-captain-stage-width),
    var(--fleet-captain-stage-max-width)
  );
}
```

- [ ] **Step 5: Preserve collision and accessibility downgrades**

If a stage face/caption/controls safe area intersects a dialog, composer, permission confirmation, or window control, downgrade the effective mode to compact. Do not move the host with unbounded transforms. `prefers-reduced-motion` removes breathing, parallax, particles, and decorative transitions.

- [ ] **Step 6: Run GREEN, type-check, and commit**

```powershell
corepack pnpm run test src/components/captain/CaptainHost.test.tsx src/components/captain/LayeredCaptainRenderer.test.tsx src/components/app-shell/CaptainAppShellSurface.test.tsx
corepack pnpm run ts-check
git add -- src/components/captain src/components/app-shell/AppShell.tsx src/styles
git commit -m "feat: render the captain as an integrated stage"
```

---

### Task 6: Establish the Watchtide Quality Bar, Then Complete All Ten Visual Families

**Required skill:** `imagegen` for any raster replacement. Inspect the current asset before editing it; retain a current asset only when it passes the exact checklist below.

**Files:**

- Modify as required: `resources/xingchao/skins/<crew>/*.webp`
- Modify: `resources/xingchao/skins/PROVENANCE.md`
- Modify: `src/skins/fleet-skins.ts`
- Modify: `src/styles/fleet-skins.css`
- Modify: `src/styles/captain-stage.css`
- Modify: `tests/visual/VisualHarness.tsx`
- Modify: `tests/visual/visual.css`

**Interfaces:**

- Produces: ten visibly distinct complete skins using one functional component tree.
- The watchtide stage is the master composition; it does not become a base manifest copied into the other nine.

- [ ] **Step 1: Add the failing seven-layer distinction test**

```ts
for (const skin of Object.values(builtinFleetSkins)) {
  expect(requiredAssetIds(skin)).toHaveLength(8)
  expect(skin.captain.stage.contentSafeArea.left + skin.captain.stage.contentSafeArea.right).toBeLessThan(70)
}
expect(new Set(skins.map((skin) => skin.scene.midground)).size).toBe(10)
expect(new Set(skins.map((skin) => skin.scene.light)).size).toBe(10)
expect(new Set(skins.map((skin) => JSON.stringify(skin.surfaces))).size).toBe(10)
expect(new Set(skins.map((skin) => skin.captain.motionStyle)).size).toBe(10)
```

- [ ] **Step 2: Run the current watchtide stage and capture a diagnostic screenshot**

Run: `corepack pnpm run visual:build`

Open the isolated harness with `crew=watchtide&mode=stage`. Inspect captain scale, face crop, command-deck readability, light integration, texture repetition, and 1440×900/1920×1080 safe areas. This screenshot is diagnostic and must not replace the accepted baseline yet.

- [ ] **Step 3: Bring watchtide to the master quality bar**

The accepted watchtide result must have: captain at 34%–40%; face unobstructed; no picture-card frame; brass/navy materials across navigation, command deck, cards, inputs, and controls; scene lighting matching the captain; readable center-left work area; restrained ocean/particle motion; and distinct reduced-motion/high-contrast equivalents.

- [ ] **Step 4: Audit and refine the other nine families**

Use the exact visual identities from the spec. For every crew, inspect the existing backdrop, midground, foreground, light, captain base, uniform, and static fallback. Replace any asset with face drift, malformed anatomy, text artifacts, weak theme identity, inconsistent light direction, poor safe area, low-resolution scaling, visible chroma halo, or repeated motif.

Do not accept palette-only differentiation. Update each literal's surfaces, typography, navigation, graph language, motion, audio cue, safe areas, and captain composition so the fleet remains identifiable with its name hidden.

- [ ] **Step 5: Record every retain/replace decision**

For retained assets, append a 2026-08-30 re-review decision. For replacements, preserve the old provenance row and add a new row with prompt/tool/edit/license and explicit rejection reason for discarded attempts.

- [ ] **Step 6: Run tests and commit the ten-family visual system**

```powershell
corepack pnpm run test src/skins/fleet-skins.test.ts src/skins/fleet-skin-assets.test.ts src/skins/fleet-skin-css.test.ts
corepack pnpm run ts-check
git add -- resources/xingchao/skins src/skins/fleet-skins.ts src/styles/fleet-skins.css src/styles/captain-stage.css tests/visual/VisualHarness.tsx tests/visual/visual.css
git commit -m "feat: complete ten captain stage skins"
```

---

### Task 7: Connect Fleet/Input Semantics and Preserve the Safe Voice Policy

**Files:**

- Modify: `src/captain/captain-types.ts`
- Modify: `src/captain/captain-reducer.ts`
- Modify: `src/captain/captain-reducer.test.ts`
- Modify: `src/components/app-shell/useCaptainAppEvents.ts`
- Modify: `src/components/app-shell/useCaptainAppEvents.test.tsx`
- Modify: `src/components/FleetSkinProvider.tsx`
- Modify: `src/captain/captain-voice.ts`
- Modify: `src/captain/captain-voice.test.ts`

**Interfaces:**

- Adds semantic events: `input.focused`, `fleet.switching`, `fleet.activated`, `fleet.failed` and source `fleet`.
- Preserves the renderer-only `CaptainSnapshot`; pages still cannot request expressions or animations.

- [ ] **Step 1: Write failing priority and voice tests**

```ts
it("restores executing after fleet activation reporting expires", () => {
  let state = createCaptainState(0)
  state = captainReducer(state, event("tool.started", { id: "tool", expiresAt: 100 }))
  state = captainReducer(state, event("fleet.switching", { id: "fleet", source: "fleet", sequence: 1 }))
  state = captainReducer(state, event("fleet.activated", { id: "fleet", source: "fleet", sequence: 2, expiresAt: 10 }))
  expect(state.snapshot.state).toBe("reporting")
  expect(tickCaptainState(state, 11).snapshot.state).toBe("executing")
})

it("never speaks a fleet event until the user explicitly enables voice", () => {
  const intent = {
    id: "fleet-activated",
    category: "completion",
    messageKey: "captain.voice.completion",
    params: {},
  } as const
  const muted = captainVoiceReducer(createCaptainVoiceState(), { type: "request", intent })
  expect(muted.caption).toEqual(intent)
  expect(muted.queue).toEqual([])
})
```

Also test that one-click mute cancels current speech and clears the queue; enabling output never requests microphone permission; raw input, credentials, file contents, and tool output are not event fields.

- [ ] **Step 2: Run RED**

Run: `corepack pnpm run test src/captain/captain-reducer.test.ts src/captain/captain-voice.test.ts src/components/app-shell/useCaptainAppEvents.test.tsx`

Expected: FAIL on the new event union and provider bridge.

- [ ] **Step 3: Implement semantic mapping**

Map `fleet.switching → thinking`, `fleet.activated → reporting`, `fleet.failed → warning`, and `input.focused → listening`. Keep `failure / warning > permission > reporting > executing > thinking > listening > success > idle`. FleetSkinProvider emits only bounded IDs/status; it never passes URLs, error stacks, or user data.

- [ ] **Step 4: Preserve the safe speech contract**

Use the existing system TTS queue. Automatic speech remains limited to welcome, permission, warning, failure, and completion/activation events after explicit enablement. Captions render regardless of TTS availability.

- [ ] **Step 5: Run GREEN, type-check, and commit**

```powershell
corepack pnpm run test src/captain/captain-reducer.test.ts src/captain/captain-voice.test.ts src/components/app-shell/useCaptainAppEvents.test.tsx src/components/FleetSkinProvider.test.tsx
corepack pnpm run ts-check
git add -- src/captain src/components/app-shell/useCaptainAppEvents.ts src/components/app-shell/useCaptainAppEvents.test.tsx src/components/FleetSkinProvider.tsx
git commit -m "feat: connect captain fleet interaction states"
```

---

### Task 8: Rebuild the Fifty Visual Baselines and Five-Viewport Acceptance Matrix

**Files:**

- Create: `tests/visual/window-sizes.ts`
- Modify: `tests/visual/visual-case.ts`
- Modify: `tests/visual/VisualHarness.tsx`
- Modify: `tests/visual/visual.css`
- Modify: `tests/visual/fleet-skins.visual.spec.ts`
- Modify: `tests/visual/baselines/*.png`
- Modify: `tests/e2e/fleet-skins.electron.spec.ts`

**Interfaces:**

- Produces: exactly 50 required fleet/mode/accessibility baselines plus deterministic layout assertions at five viewports.
- The test harness must use production providers, renderer, stage component, and CSS; no hand-built substitute captain.

- [ ] **Step 1: Write failing viewport and integrity assertions**

```ts
export const FLEET_VIEWPORTS = Object.freeze([
  { width: 1024, height: 640 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
] as const)
```

At each viewport assert: one host; no face/composer/dialog/window-control overlap; stage width within 34%–40% and 360–560 px when stage is eligible; deck width 240–300 px; compact at most 72 px; no horizontal document overflow.

- [ ] **Step 2: Run RED against old baselines**

Run: `corepack pnpm run visual:test`

Expected: FAIL because the intended composition differs from the old floating-card snapshots.

- [ ] **Step 3: Update snapshots only after human inspection**

Run: `corepack pnpm run visual:update`

Inspect all 50 PNGs individually. Reject any baseline with a small top-right captain, mixed-skin frame, hidden input, weak contrast, face crop, low-resolution stretch, repeated texture, text artifact, or unapproved asset. Snapshot generation alone is not acceptance.

- [ ] **Step 4: Add Electron end-to-end cases**

Cover fleet choice, cross-route continuity, restart restoration, explicit speech enablement, one-click mute, required-asset rollback, reduced motion, high contrast, and zero renderer-console errors. Keep the isolated local URL/network policy checks.

- [ ] **Step 5: Run GREEN and commit**

```powershell
corepack pnpm run visual:test
corepack pnpm run e2e:fleet-skins
git add -- tests/visual tests/e2e/fleet-skins.electron.spec.ts
git commit -m "test: verify captain stage visual quality"
```

---

### Task 9: Run the Desktop Acceptance Gate and Record Honest Completion Evidence

**Files:**

- Create: `docs/verification/captain-stage-visual-quality-2026-08-30.md`
- Modify: `docs/implementation-status.md`
- Modify if user-facing behavior changed: `README.md`

**Interfaces:**

- Produces: a command-by-command verification record, screenshot review count, desktop smoke result, and explicit incomplete/blocker list.
- Does not publish, push, create a Release, or mark completion if any fleet fails.

- [ ] **Step 1: Run focused tests**

```powershell
corepack pnpm run test src/captain/captain-layout.test.ts src/captain/captain-reducer.test.ts src/captain/captain-voice.test.ts src/skins/fleet-skin-schema.test.ts src/skins/fleet-skin-assets.test.ts src/skins/fleet-skins.test.ts src/skins/fleet-skin-css.test.ts src/components/captain/CaptainStageLayout.test.tsx src/components/captain/CaptainHost.test.tsx src/components/captain/LayeredCaptainRenderer.test.tsx src/components/FleetSkinProvider.test.tsx src/components/app-shell/CaptainAppShellSurface.test.tsx src/components/app-shell/useCaptainAppEvents.test.tsx
```

Expected: PASS with no skipped required case.

- [ ] **Step 2: Run repository quality gates**

```powershell
corepack pnpm run lint
corepack pnpm run format
corepack pnpm run ts-check
corepack pnpm run test
corepack pnpm run visual:test
corepack pnpm run e2e:fleet-skins
corepack pnpm run build:app
```

Expected: every command exits 0. Fix only failures caused by this work; report unrelated pre-existing failures instead of hiding them.

- [ ] **Step 3: Run the Electron desktop smoke test**

Start the observable development build using `docs/ai/dev-debugging.md`. Exercise every fleet at least once, visit stage/deck/compact routes, resize through all five target viewports, restart once, enable speech explicitly, trigger one key event, mute it, and inspect main/renderer logs. Record missing resources, console errors, overlap, mixed skins, crash dialogs, and memory behavior.

- [ ] **Step 4: Complete the human visual checklist**

For each fleet record pass/fail for: captain is the visual subject; light integration; three-second hierarchy; input clarity; asset sharpness; hidden-name distinctness; atomic switch; reduced motion; high contrast. Ten complete rows are mandatory.

- [ ] **Step 5: Update status and verification documentation**

State “精致化完整皮肤首版完成” only if all ten rows, all fifty baselines, five viewports, Electron smoke, build, and tests pass. Otherwise state `未完成` and list the exact blocking fleet/check.

- [ ] **Step 6: Commit the evidence**

```powershell
git add -- docs/verification/captain-stage-visual-quality-2026-08-30.md docs/implementation-status.md README.md
git commit -m "docs: verify captain stage visual quality"
```

Do not push or publish. End with `git status --short --branch` and report every remaining local change.
