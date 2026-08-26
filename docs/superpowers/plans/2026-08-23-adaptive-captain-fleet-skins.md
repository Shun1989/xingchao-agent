# Adaptive Captain and Complete Fleet Skins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a verifiable first version in which the captain persists across the desktop app, reacts to application and voice state, and all ten built-in fleets atomically switch the complete scene, component language, captain presentation, motion, and silent-by-default audio policy.

**Architecture:** `FleetSkinProvider` becomes the sole renderer owner of a validated built-in skin manifest and a transactional switch reducer. `CaptainOrchestrator` independently reduces semantic application events into a read-only snapshot consumed by one global `CaptainHost`; the initial `LayeredCaptainRenderer` implements the stable renderer boundary that a later Live2D renderer can replace. Imported content-pack crews remain data-only and receive a safe legacy palette without gaining access to skin assets.

**Tech Stack:** TypeScript 6, Zod 4, React 19, Motion 12, Electron 42, Vite 8, Vitest 4 with happy-dom, Playwright 1.62 against the bundled Electron runtime, oxlint, oxfmt.

**Spec:** `docs/superpowers/specs/2026-08-23-adaptive-captain-fleet-skins-design.md`

## Global Constraints

- Use Node.js `>=22.22.2` and the repository-pinned `pnpm@11.21.0`.
- Follow strict RED → GREEN → REFACTOR. Do not implement production behavior before observing the intended test fail.
- Keep `RuntimeFleetProvider` authoritative for available crews. The active crew/skin selection has one persistence key and one committed value.
- Only the ten IDs in `BUILTIN_CREW_IDS` may resolve a `FleetSkinManifest`. Imported crews must never activate image, audio, font, CSS, HTML, URL, filesystem path, or executable content.
- Asset references are closed `FleetSkinAssetId` values backed by static imports. A manifest must not accept path or URL strings.
- Required-resource failure leaves the previous skin, DOM tokens, captain assets, audio policy, and persisted selection unchanged.
- Voice is silent by default, captions are always available, microphone permission is unrelated, and raw user text, credentials, file content, and tool output are never automatically spoken.
- The first version is a layered renderer, not Live2D/Cubism. UI copy and docs must use accurate wording.
- `prefers-reduced-motion` removes breathing, parallax, particles, and decorative transitions. High-contrast mode provides explicit alternate tokens.
- All ten skins must pass manifest completeness, the 50-image visual baseline, Electron end-to-end tests, build, and desktop smoke before the product is called complete.
- Asset creation must use original generated or authored work. Record generation method, source, license, and modifications in `resources/xingchao/skins/PROVENANCE.md`.
- Do not create a GitHub Release, installer publication, public promotion, or remote push as part of this plan. Local task commits are allowed.

---

## File Map

- `src/skins/fleet-skin-schema.ts`: closed manifest, semantic token, layout, motion, audio, and accessibility types plus Zod validation.
- `src/skins/fleet-skin-assets.ts`: static imports and the only asset-ID-to-URL registry.
- `src/skins/fleet-skins.ts`: ten complete built-in manifests and safe imported-crew fallback resolution.
- `src/skins/fleet-skin-switch.ts`: pure atomic-switch reducer and persistence decisions.
- `src/components/FleetSkinProvider.tsx` and `src/components/fleet-skin-context.ts`: preload orchestration, DOM token commit, rollback, and public renderer API.
- `src/styles/fleet-skins.css`: semantic shell/component variables, scene layers, materials, transition, reduced-motion, and high-contrast rules.
- `src/captain/captain-types.ts`: semantic events, priorities, snapshots, display modes, and renderer contract.
- `src/captain/captain-reducer.ts`: task-isolated, priority-aware state reducer with expiry and restoration.
- `src/captain/captain-voice.ts`: silent-by-default policy and queue reducer.
- `src/components/captain/CaptainOrchestrator.tsx`: context owner and event dispatch API.
- `src/components/captain/CaptainHost.tsx`: one global adaptive host, captions, controls, and safe placement.
- `src/components/captain/LayeredCaptainRenderer.tsx`: layered motion renderer.
- `src/components/captain/CaptainBoundary.tsx`: static fallback and diagnostic boundary.
- `src/components/app-shell/useCaptainAppEvents.ts`: maps existing route/chat/task/tool/permission state to semantic captain events without embedding presentation logic in `AppShell.tsx`.
- `resources/xingchao/skins/<crew-id>/`: original background, captain, overlay, crest, and static fallback assets for each built-in crew.
- `resources/xingchao/skins/PROVENANCE.md`: per-file source, generation, license, and modification record.
- `tests/visual/`: deterministic Electron visual harness, Playwright config/specs, and 50 reviewed PNG baselines.
- `tests/e2e/fleet-skins.electron.spec.ts`: selection, cross-route continuity, restart restore, voice, rollback, and accessibility flows.
- `docs/implementation-status.md`: evidence-backed completion state and remaining Live2D non-goal.

---

### Task 1: Define the Closed Skin Contract

**Files:**

- Create: `src/skins/fleet-skin-schema.ts`
- Create: `src/skins/fleet-skin-schema.test.ts`

**Interfaces:**

- Produces: `FleetSkinManifest`, `FleetSkinAssetId`, `FleetSkinTokens`, `CaptainComposition`, `validateFleetSkinManifest`, and `requiredAssetIds`.
- Consumes: `BuiltinCrewId` only; it must not accept general `CrewId` for a skin identity.

- [ ] **Step 1: Write failing schema and trust-boundary tests**

Create tests with one fully literal fixture and assert every unsafe reference fails:

```ts
it.each(["https://example.com/a.png", "../secrets.png", "C:\\secret.png", "data:text/html,x"])(
  "rejects an arbitrary asset reference: %s",
  (asset) => {
    expect(() =>
      validateFleetSkinManifest({ ...validManifest, scene: { ...validManifest.scene, backdrop: asset } }),
    ).toThrow(/asset/i)
  },
)

it("requires all three captain compositions and accessibility overrides", () => {
  const input = structuredClone(validManifest) as Record<string, unknown>
  delete (input.captain as Record<string, unknown>).compact
  expect(() => validateFleetSkinManifest(input)).toThrow(/compact/i)
})

it("does not permit an imported crew ID", () => {
  expect(() =>
    validateFleetSkinManifest({ ...validManifest, identity: { ...validManifest.identity, crewId: "pack--crew" } }),
  ).toThrow(/crewId/i)
})
```

- [ ] **Step 2: Run RED**

```powershell
corepack pnpm run test src/skins/fleet-skin-schema.test.ts
```

Expected: FAIL because the schema module is absent.

- [ ] **Step 3: Implement the closed contract**

Build the closed asset ID set from the two existing literal unions, never from manifest input:

```ts
const FLEET_SKIN_ASSET_ROLES = [
  "scene.backdrop",
  "scene.foreground",
  "captain.base",
  "captain.uniform",
  "captain.static",
  "crest",
] as const

type FleetSkinAssetRole = (typeof FLEET_SKIN_ASSET_ROLES)[number]
export type FleetSkinAssetId = `${BuiltinCrewId}.${FleetSkinAssetRole}`
export const FLEET_SKIN_ASSET_IDS = BUILTIN_CREW_IDS.flatMap((crewId) =>
  FLEET_SKIN_ASSET_ROLES.map((role) => `${crewId}.${role}` as FleetSkinAssetId),
)
const fleetSkinAssetIdSet = new Set<string>(FLEET_SKIN_ASSET_IDS)
const assetIdSchema = z.custom<FleetSkinAssetId>(
  (value) => typeof value === "string" && fleetSkinAssetIdSet.has(value),
  "Unknown fleet skin asset ID",
)

export interface FleetSkinManifest {
  schemaVersion: "1.0.0"
  identity: { crewId: BuiltinCrewId; name: string; version: string; description: string; crest: FleetSkinAssetId }
  palette: {
    canvas: string
    panel: string
    elevated: string
    primary: string
    secondary: string
    accent: string
    text: string
    mutedText: string
    success: string
    warning: string
    danger: string
    focus: string
  }
  surfaces: {
    sidebar: SurfaceToken
    titlebar: SurfaceToken
    content: SurfaceToken
    card: SurfaceToken
    dialog: SurfaceToken
    input: SurfaceToken
    overlay: SurfaceToken
  }
  typography: { heading: FontToken; body: FontToken; numeric: FontToken; label: FontToken }
  scene: {
    backdrop: FleetSkinAssetId
    foreground: FleetSkinAssetId
    scrim: string
    focalPoint: `${number}% ${number}%`
  }
  navigation: { selectedShape: "pill" | "ticket" | "frame" | "underline"; divider: "line" | "notch" | "nodes" | "none" }
  captain: {
    layers: FleetSkinAssetId[]
    stage: CaptainComposition
    companion: CaptainComposition
    compact: CaptainComposition
    staticFallback: FleetSkinAssetId
    motionStyle:
      | "command"
      | "editorial"
      | "studio"
      | "engineering"
      | "precision"
      | "operations"
      | "tribunal"
      | "mentor"
      | "media"
      | "lifestyle"
  }
  motion: { switchMs: number; parallaxPx: number; particleDensity: number; feedbackMs: number }
  audio: {
    cue: "bell" | "paper" | "glass" | "relay" | "scale" | "stamp" | "gavel" | "beacon" | "wave" | "breeze"
    ambient: "none"
  }
  accessibility: { highContrast: FleetSkinTokens; reducedMotion: { switchMs: 0; parallaxPx: 0; particleDensity: 0 } }
}
```

The validator must enforce CSS hex/oklch/color-mix values through explicit patterns, version `1.0.0`, `switchMs` in `250..450`, stage width `32..38`, companion width `240..300`, compact size `<=72`, required asset roles, and the exact built-in ID union.

- [ ] **Step 4: Complete manifest-level validation**

Add tests that `FLEET_SKIN_ASSET_IDS` contains exactly `10 × 6 = 60` closed IDs, `requiredAssetIds` deduplicates the required roles, every asset ID prefix equals its manifest crew ID, captain layers contain base and uniform, and static fallback cannot equal a scene asset. Keep filesystem and URL resolution out of this module.

- [ ] **Step 5: Run GREEN**

```powershell
corepack pnpm run test src/skins/fleet-skin-schema.test.ts
corepack pnpm run ts-check
```

Expected: PASS with 60 closed IDs and no dependency on raster files.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- src/skins/fleet-skin-schema.ts src/skins/fleet-skin-schema.test.ts
git commit -m "feat: define fleet skin contract"
```

---

### Task 2: Produce Original Layered Assets for All Ten Fleets

**Required skill:** `imagegen` for raster creation. Inspect every generated image before accepting it.

**Files:**

- Create: `src/skins/fleet-skin-assets.ts`
- Create: `src/skins/fleet-skin-assets.test.ts`
- Create: `resources/xingchao/skins/PROVENANCE.md`
- Create for each exact crew ID: `scene-backdrop.webp` (1920×1080), `scene-foreground.webp` (1920×1080 with transparency), `captain-base.webp` (1600×2200 with transparency), `captain-uniform.webp` (1600×2200 with transparency), `captain-static.webp` (1200×1600), and `crest.svg` (128×128 viewBox).
- Crew directories: `watchtide`, `ink-sail`, `brocade-harbor`, `forge-vessel`, `golden-scale`, `helm-order`, `iron-code`, `lighthouse`, `phantom-wave`, `rest-harbor`.

- [ ] **Step 1: Add failing registry and binary-integrity tests**

In `fleet-skin-assets.test.ts`, assert the registry key set equals `FLEET_SKIN_ASSET_IDS`, URLs contain no `http:`, `https:`, `data:`, or `..`, and every key resolves. Read each source file and assert exact inventory, WebP/SVG magic, non-zero size, maximum raster edge `4096`, alpha for foreground/captain layers, and no duplicated SHA-256 among the ten backdrops or ten captain bases.

- [ ] **Step 2: Run RED**

```powershell
corepack pnpm run test src/skins/fleet-skin-assets.test.ts
```

Expected: FAIL because the registry and 60 source files are absent.

- [ ] **Step 3: Generate the ten visual families**

Use one consistent original captain identity and the approved direction matrix. Every prompt must include: original adult East Asian female captain, same face and proportions as the accepted internal Lanxi reference, waist-up three-quarter command pose, face unobstructed, no text, no logo, no watermark, no copyrighted character, desktop UI safe area, cinematic but readable lighting. Apply the per-fleet direction exactly:

```text
watchtide: deep-sea bridge, star charts, brass navigation instruments, navy command uniform
ink-sail: dark-red study, rice paper, ink traces, editorial burgundy uniform
brocade-harbor: iridescent design studio, jade glass, coral light, jade-cyan design uniform
forge-vessel: engineering hangar, gunmetal grid, electric-blue terminals, technical uniform
golden-scale: obsidian trading deck, gold scales, emerald data lines, deep-green precision uniform
helm-order: warm-white operations room, archives, stamps, process lines, blue-gray uniform
iron-code: legal chamber, wine-red dossiers, rigid ivory borders, burgundy tribunal uniform
lighthouse: indigo knowledge tower, warm library light, index stars, mentor uniform
phantom-wave: neon audiovisual bay, waveform and spectrum tracks, violet-cyan creator uniform
rest-harbor: sunlit living bay, linen, travel maps, sage green, lifestyle uniform
```

Create each backdrop without a character. Create `captain-base` as the consistent face/body layer and `captain-uniform` as an aligned transparent costume/light-detail layer. Create foreground decoration that keeps the center-left work area and captain face clear. `captain-static` is a flattened, color-correct fallback, not a screenshot of the layered renderer.

- [ ] **Step 4: Author crests and normalize assets**

Author ten simple original SVG crests using only paths/circles, `currentColor`, no embedded raster, script, external reference, text, or metadata payload. Convert accepted raster outputs to WebP with retained alpha and visually inspect at 100% and fit-to-window. Do not mechanically stretch images to target size; crop to the declared safe focal point.

- [ ] **Step 5: Implement the total static registry**

Statically import all 60 files. Use a typed `registerCrewAssets(crewId, files)` helper with `Record<FleetSkinAssetRole, string>`, call it once for each exact built-in crew ID, merge the ten records under `satisfies Record<FleetSkinAssetId, string>`, and export only `fleetSkinAssetUrl(id)` plus the readonly registry. No computed import or input-derived path is permitted.

- [ ] **Step 6: Record provenance**

For every file, record: relative path, creation date, `AI-generated original` or `project-authored SVG`, tool/model name, prompt family, human edits, license `Apache-2.0 project asset`, and reviewer decision. Record the existing `lanxi-key-art.png` separately as a migration-only source and do not reuse it as ten different fleet assets.

- [ ] **Step 7: Run asset integrity and visual inspection**

```powershell
corepack pnpm run test src/skins/fleet-skin-assets.test.ts
corepack pnpm run ts-check
```

Expected: PASS with 60 unique registered files and no unsafe SVG reference. Inspect all 50 raster files; reject face drift, malformed hands, text artifacts, seam mismatch between base/uniform, transparency halos, and foreground overlap of the work safe area.

- [ ] **Step 8: Commit Task 2**

```powershell
git add -- src/skins/fleet-skin-assets.ts src/skins/fleet-skin-assets.test.ts resources/xingchao/skins
git commit -m "feat: define complete fleet skin assets"
```

---

### Task 3: Declare and Validate All Ten Complete Manifests

**Files:**

- Create: `src/skins/fleet-skins.ts`
- Create: `src/skins/fleet-skins.test.ts`

**Interfaces:**

- Produces: `builtinFleetSkins`, `resolveFleetSkin(crewId)`, `isBuiltinFleetSkinId(crewId)`.
- Imported crew behavior: `resolveFleetSkin("pack--crew")` returns `null`; it never silently maps to a complete built-in skin.

- [ ] **Step 1: Write the completeness matrix test**

```ts
it("has one valid and visually distinct manifest for every built-in crew", () => {
  expect(Object.keys(builtinFleetSkins).sort()).toEqual([...BUILTIN_CREW_IDS].sort())
  const manifests = BUILTIN_CREW_IDS.map((id) => validateFleetSkinManifest(builtinFleetSkins[id]))
  expect(new Set(manifests.map((skin) => skin.scene.backdrop)).size).toBe(10)
  expect(new Set(manifests.map((skin) => skin.captain.layers.join("|"))).size).toBe(10)
  expect(new Set(manifests.map((skin) => skin.typography.heading.family)).size).toBeGreaterThanOrEqual(4)
  expect(new Set(manifests.map((skin) => skin.navigation.selectedShape)).size).toBeGreaterThanOrEqual(4)
})

it("does not grant imported content a skin", () => {
  expect(resolveFleetSkin("aurora-pack--watchtide")).toBeNull()
})
```

- [ ] **Step 2: Run RED**

```powershell
corepack pnpm run test src/skins/fleet-skins.test.ts
```

Expected: FAIL because the manifest registry is absent.

- [ ] **Step 3: Define ten literal manifests**

Do not generate manifests by changing only palette fields. Each literal must independently specify all manifest sections. Use these required structural distinctions:

| Crew           | Surface material             | Heading             | Navigation shape | Motion style | Cue    |
| -------------- | ---------------------------- | ------------------- | ---------------- | ------------ | ------ |
| watchtide      | translucent brass/navy glass | serif               | frame            | command      | bell   |
| ink-sail       | opaque paper/grain           | editorial serif     | ticket           | editorial    | paper  |
| brocade-harbor | jade glass/soft glow         | rounded sans        | pill             | studio       | glass  |
| forge-vessel   | gunmetal/grid                | monospace           | frame            | engineering  | relay  |
| golden-scale   | obsidian/gold hairline       | financial serif     | underline        | precision    | scale  |
| helm-order     | warm archive/card stock      | neutral sans        | ticket           | operations   | stamp  |
| iron-code      | wine dossier/ivory edge      | high-contrast serif | frame            | tribunal     | gavel  |
| lighthouse     | indigo book cloth/warm paper | reading serif       | underline        | mentor       | beacon |
| phantom-wave   | dark glass/neon spectrum     | geometric sans      | pill             | media        | wave   |
| rest-harbor    | linen/sunlit paper           | humanist serif      | nodes            | lifestyle    | breeze |

Each high-contrast token set must meet 4.5:1 text contrast and 3:1 focus/non-text contrast; add a local luminance helper in the test and assert literals rather than trusting the manifest author.

- [ ] **Step 4: Run GREEN and type checking**

```powershell
corepack pnpm run test src/skins/fleet-skins.test.ts src/skins/fleet-skin-schema.test.ts src/skins/fleet-skin-assets.test.ts
corepack pnpm run ts-check
```

Expected: PASS for exactly ten complete manifests and imported-crew refusal.

- [ ] **Step 5: Commit Task 3**

```powershell
git add -- src/skins/fleet-skins.ts src/skins/fleet-skins.test.ts
git commit -m "feat: declare ten complete fleet skins"
```

---

### Task 4: Implement the Atomic Switch Reducer

**Files:**

- Create: `src/skins/fleet-skin-switch.ts`
- Create: `src/skins/fleet-skin-switch.test.ts`

**Interfaces:**

- Produces: `FleetSkinSwitchState`, `FleetSkinSwitchEvent`, `fleetSkinSwitchReducer`, `beginFleetSkinSwitch`, and `committedCrewId`.

- [ ] **Step 1: Write failing transaction tests**

Cover: all required resources ready → one commit; one required failure → old committed skin unchanged; stale generation ignored; optional foreground failure → commit with degraded optional effect; persistence command emitted only after commit; invalid stored ID → watchtide recovery.

```ts
it("rolls back the complete transaction when one required asset fails", () => {
  const loading = reduce(initial("watchtide"), {
    type: "request",
    crewId: "ink-sail",
    generation: 2,
    required: inkRequired,
  })
  const failed = reduce(loading, {
    type: "asset.failed",
    generation: 2,
    assetId: "ink-sail.captain.base",
    required: true,
  })
  expect(failed.committedCrewId).toBe("watchtide")
  expect(failed.pending).toBeNull()
  expect(failed.effect).toEqual({ type: "report-error", code: "required-asset-failed" })
})
```

- [ ] **Step 2: Run RED**

```powershell
corepack pnpm run test src/skins/fleet-skin-switch.test.ts
```

Expected: FAIL because the reducer is absent.

- [ ] **Step 3: Implement a pure generation-aware reducer**

State keeps `committedCrewId`, `committedManifest`, `pending`, `phase`, `error`, and one declarative `effect`. No DOM, storage, timer, image, or React calls are allowed inside the reducer. Required assets are backdrop, captain base, uniform, static fallback, crest, and fonts; foreground is optional.

- [ ] **Step 4: Run GREEN**

```powershell
corepack pnpm run test src/skins/fleet-skin-switch.test.ts
```

Expected: PASS, including stale-generation and rollback cases.

- [ ] **Step 5: Commit Task 4**

```powershell
git add -- src/skins/fleet-skin-switch.ts src/skins/fleet-skin-switch.test.ts
git commit -m "feat: make fleet skin switching atomic"
```

---

### Task 5: Replace Palette Switching with `FleetSkinProvider`

**Files:**

- Create: `src/components/fleet-skin-context.ts`
- Create: `src/components/FleetSkinProvider.tsx`
- Create: `src/components/FleetSkinProvider.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/XingchaoThemeProvider.tsx`
- Modify: `src/components/xingchao-theme-context.ts`
- Modify: `src/components/XingchaoThemeProvider.test.tsx`
- Modify: `src/routes/Fleet/index.tsx`
- Modify: `src/routes/Fleet/index.test.tsx`

**Interfaces:**

- Public context: `activeCrewId: CrewId`, `skin: FleetSkinManifest | null`, `requestCrew`, `phase`, `pendingCrewId`, `error`, `retry`, and `preloadCrew`. `skin === null` is the explicit safe state for an imported crew.
- `XingchaoThemeProvider` becomes a temporary compatibility adapter that reads this context; it must not persist or mutate independently.

- [ ] **Step 1: Write failing provider integration tests**

Inject a `loadAsset(url)` dependency. Assert no DOM/storage change before every required promise resolves, a single DOM commit after resolution, full rollback on rejection, last-request-wins, hover preload without selection, restart restore, corrupted selection recovery, and imported crew safe palette without skin assets.

- [ ] **Step 2: Run RED**

```powershell
corepack pnpm run test src/components/FleetSkinProvider.test.tsx src/components/XingchaoThemeProvider.test.tsx src/routes/Fleet/index.test.tsx
```

Expected: FAIL because selection currently persists immediately and only five variables change.

- [ ] **Step 3: Implement the provider and a single DOM commit**

Build one `Record<string, string>` from the committed manifest, then apply it inside one `useLayoutEffect`:

```ts
const commitSkinToRoot = (root: HTMLElement, crewId: BuiltinCrewId, vars: Record<string, string>) => {
  root.dataset.fleetSkin = crewId
  root.style.cssText += Object.entries(vars)
    .map(([name, value]) => `${name}:${value}`)
    .join(";")
}
```

Use the reducer generation to ignore late preloads. Persist `storageKey("activeCrew")` only after `commit`. On failure, expose a retryable Chinese error and leave the old root dataset/variables untouched. Imported crews continue to use their renderer-safe `RuntimeFleetTheme` through the compatibility adapter, set `data-fleet-skin="legacy-imported"`, and never call `fleetSkinAssetUrl`.

- [ ] **Step 4: Migrate Fleet Harbor selection**

Fleet cards call `requestCrew` for built-ins and `preloadCrew` on pointer/focus. Remove local `LanxiStage`; reserve the right-side stage area for the global `CaptainHost`. Show `切换中` only for the pending card and show the rollback error near the selector.

- [ ] **Step 5: Run GREEN and regression tests**

```powershell
corepack pnpm run test src/components/FleetSkinProvider.test.tsx src/components/XingchaoThemeProvider.test.tsx src/routes/Fleet/index.test.tsx src/app-entry.test.ts
corepack pnpm run ts-check
```

Expected: PASS with no immediate persistence and no imported asset activation.

- [ ] **Step 6: Commit Task 5**

```powershell
git add -- src/App.tsx src/components/fleet-skin-context.ts src/components/FleetSkinProvider.tsx src/components/FleetSkinProvider.test.tsx src/components/XingchaoThemeProvider.tsx src/components/xingchao-theme-context.ts src/components/XingchaoThemeProvider.test.tsx src/routes/Fleet/index.tsx src/routes/Fleet/index.test.tsx
git commit -m "feat: activate global fleet skin runtime"
```

---

### Task 6: Apply Semantic Skin Tokens Across the Shared Shell

**Files:**

- Create: `src/styles/fleet-skins.css`
- Modify: `src/index.css`
- Modify: `src/styles/theme.css`
- Modify: `src/styles/app-shell.css`
- Modify: `src/styles/ui.css`
- Modify: `src/components/app-shell/AppShell.tsx`
- Modify: `src/components/app-shell/AppShellNavigationSidebar.tsx`
- Modify: `src/routes/Fleet/index.tsx`
- Modify: `src/routes/Voyage/index.tsx`
- Modify: `src/routes/Supply/index.tsx`
- Create: `src/skins/fleet-skin-css.test.ts`

- [ ] **Step 1: Write the semantic coverage test**

Assert the manifest-to-CSS mapper produces all required global variables (`--background`, `--foreground`, `--card`, `--popover`, `--border`, `--input`, `--ring`, `--oo-content-surface`, `--oo-sidebar`, `--oo-toolbar`, `--oo-surface`, `--oo-overlay-shadow`, scene URLs, typography, radii) for every skin, and source files no longer use the five legacy `--xingchao-*` variables.

- [ ] **Step 2: Run RED**

```powershell
corepack pnpm run test src/skins/fleet-skin-css.test.ts
```

Expected: FAIL because semantic coverage and the new stylesheet do not exist.

- [ ] **Step 3: Implement shared scene and material layers**

Add `data-fleet-skin` and semantic classes to the outer `oo-app-chrome`, titlebar, sidebar, content surface, cards, inputs, dialogs, and overlays. Render backdrop/scrim/foreground once behind the shell with `pointer-events:none`. Page components retain function and layout; they consume semantic variables and never branch on crew IDs.

- [ ] **Step 4: Implement accessibility modes**

Use `@media (prefers-reduced-motion: reduce)` to remove parallax, particles, breathing, and decorative transition. Add `data-fleet-contrast="high"` overrides from the manifest. Ensure visible focus remains at least 3:1 and text variables meet AA.

- [ ] **Step 5: Run GREEN, lint, and type checking**

```powershell
corepack pnpm run test src/skins/fleet-skin-css.test.ts src/routes/Fleet/index.test.tsx
corepack pnpm run ts-check
corepack pnpm run lint
```

Expected: PASS and `rg -- '--xingchao-' src` returns no production matches.

- [ ] **Step 6: Commit Task 6**

```powershell
git add -- src/index.css src/styles/fleet-skins.css src/styles/theme.css src/styles/app-shell.css src/styles/ui.css src/components/app-shell/AppShell.tsx src/components/app-shell/AppShellNavigationSidebar.tsx src/routes/Fleet/index.tsx src/routes/Voyage/index.tsx src/routes/Supply/index.tsx src/skins/fleet-skin-css.test.ts
git commit -m "feat: skin the complete desktop shell"
```

---

### Task 7: Build the Priority-aware Captain Reducer

**Files:**

- Create: `src/captain/captain-types.ts`
- Create: `src/captain/captain-reducer.ts`
- Create: `src/captain/captain-reducer.test.ts`
- Modify: `src/live2d/lanxi-state.ts`
- Modify: `src/live2d/lanxi-state.test.ts`

**Interfaces:**

- Produces: `CaptainEvent`, `CaptainSnapshot`, `CaptainDisplayMode`, `CaptainRendererProps`, `captainReducer`, and `tickCaptainState`.
- Preserves the eight public state names.

- [ ] **Step 1: Write failing precedence and isolation tests**

Test the literal precedence `failure/warning > reporting > executing > thinking > listening > success > idle`, expiry restoration, two concurrent task IDs, dismissal of one warning without clearing another task, late event rejection by sequence, and mouth level only during reporting.

```ts
it("restores executing after a higher-priority report expires", () => {
  const executing = dispatch(initial, event("task.started", "task-1", 0, 60_000))
  const reporting = dispatch(executing, event("speech.started", "task-1", 10, 2_000))
  expect(reporting.snapshot.state).toBe("reporting")
  expect(tickCaptainState(reporting, 2_001).snapshot.state).toBe("executing")
})
```

- [ ] **Step 2: Run RED**

```powershell
corepack pnpm run test src/captain/captain-reducer.test.ts src/live2d/lanxi-state.test.ts
```

Expected: FAIL because the current mutable controller cannot restore concurrent states.

- [ ] **Step 3: Implement semantic event reduction**

Events contain `id`, `type`, `source`, `taskId`, `sequence`, `startedAt`, `expiresAt`, and a safe caption key/parameters. Store active events by ID, derive presentation deterministically, and never store raw chat/tool content. Map state to expression in one readonly table. Keep `LanxiStateController` as a deprecated adapter over the pure reducer until all callers migrate.

- [ ] **Step 4: Run GREEN**

```powershell
corepack pnpm run test src/captain/captain-reducer.test.ts src/live2d/lanxi-state.test.ts
corepack pnpm run ts-check
```

- [ ] **Step 5: Commit Task 7**

```powershell
git add -- src/captain/captain-types.ts src/captain/captain-reducer.ts src/captain/captain-reducer.test.ts src/live2d/lanxi-state.ts src/live2d/lanxi-state.test.ts
git commit -m "feat: orchestrate captain state priorities"
```

---

### Task 8: Implement the Silent-by-default Voice Policy

**Files:**

- Create: `src/captain/captain-voice.ts`
- Create: `src/captain/captain-voice.test.ts`
- Create: `src/hooks/useCaptainSpeech.ts`
- Create: `src/hooks/useCaptainSpeech.test.tsx`
- Modify: `src/i18n/app-messages.zh.ts`
- Modify: `src/i18n/app-messages.en.ts`

**Interfaces:**

- Produces: `CaptainVoiceSettings`, `CaptainSpeechIntent`, `captainVoiceReducer`, and `useCaptainSpeech`.

- [ ] **Step 1: Write failing policy tests**

Cover default mute, explicit enable, only `welcome/confirmation/completion/risk/manual` categories, captions while muted, one-click mute cancelling current and queued speech, fleet switch cancellation, task cancellation, window cleanup, unavailable `speechSynthesis`, volume/rate bounds, and sensitive payload refusal.

- [ ] **Step 2: Run RED**

```powershell
corepack pnpm run test src/captain/captain-voice.test.ts src/hooks/useCaptainSpeech.test.tsx
```

Expected: FAIL because voice is currently an unconditional button-local call in `LanxiStage`.

- [ ] **Step 3: Implement reducer and Web Speech adapter**

Persist only `{ enabled, clickOnly, volume, rate }` under `storageKey("captainVoice")`. Queue only catalogued localized message IDs and sanitized parameters. `useCaptainSpeech` owns `SpeechSynthesisUtterance`, dispatches `speech.started/finished/failed`, and calls `speechSynthesis.cancel()` on mute, skin change, task cancel, and unmount. It must never request microphone access.

- [ ] **Step 4: Run GREEN**

```powershell
corepack pnpm run test src/captain/captain-voice.test.ts src/hooks/useCaptainSpeech.test.tsx
corepack pnpm run ts-check
```

- [ ] **Step 5: Commit Task 8**

```powershell
git add -- src/captain/captain-voice.ts src/captain/captain-voice.test.ts src/hooks/useCaptainSpeech.ts src/hooks/useCaptainSpeech.test.tsx src/i18n/app-messages.zh.ts src/i18n/app-messages.en.ts
git commit -m "feat: add explicit captain voice controls"
```

---

### Task 9: Implement the Layered Renderer and Static Boundary

**Files:**

- Create: `src/components/captain/LayeredCaptainRenderer.tsx`
- Create: `src/components/captain/LayeredCaptainRenderer.test.tsx`
- Create: `src/components/captain/CaptainBoundary.tsx`
- Create: `src/components/captain/CaptainBoundary.test.tsx`
- Create: `src/styles/captain.css`
- Modify: `src/index.css`
- Delete after migration: `src/components/LanxiStage.tsx`

- [ ] **Step 1: Write failing renderer-contract tests**

Assert layer ordering (`scene → base → uniform → expression/light → foreground`), `CaptainRendererProps` only, state/expression data attributes, reporting mouth cadence, no animation in reduced motion, non-interactive decorative layers, and boundary fallback using the current skin’s `captain.staticFallback`.

- [ ] **Step 2: Run RED**

```powershell
corepack pnpm run test src/components/captain/LayeredCaptainRenderer.test.tsx src/components/captain/CaptainBoundary.test.tsx
```

Expected: FAIL because the stable renderer boundary and layered implementation are absent.

- [ ] **Step 3: Implement the stable boundary**

`CaptainRendererProps` contains only `snapshot`, `skin`, `mode`, `reducedMotion`, and `onRendererEvent`. Use Motion transforms for breathing, blink, gaze, and parallax; cap parallax from the manifest; reporting mouth movement uses a deterministic CSS/clock envelope. Do not claim audio waveform analysis. `CaptainBoundary` catches render errors, reports only skin ID/state/error class, and renders the static fallback with the permanent caption/control layer still present.

- [ ] **Step 4: Run GREEN and remove the legacy local stage**

```powershell
corepack pnpm run test src/components/captain/LayeredCaptainRenderer.test.tsx src/components/captain/CaptainBoundary.test.tsx src/routes/Fleet/index.test.tsx
corepack pnpm run ts-check
```

Expected: PASS and `rg -n 'LanxiStage' src` returns no matches.

- [ ] **Step 5: Commit Task 9**

```powershell
git add -- src/components/captain src/styles/captain.css src/index.css src/routes/Fleet/index.tsx src/routes/Fleet/index.test.tsx
git rm -- src/components/LanxiStage.tsx
git commit -m "feat: render layered adaptive captain"
```

---

### Task 10: Mount One Adaptive Captain Host and Wire Real App Events

**Files:**

- Create: `src/components/captain/captain-context.ts`
- Create: `src/components/captain/CaptainOrchestrator.tsx`
- Create: `src/components/captain/CaptainHost.tsx`
- Create: `src/components/captain/CaptainHost.test.tsx`
- Create: `src/components/app-shell/useCaptainAppEvents.ts`
- Create: `src/components/app-shell/useCaptainAppEvents.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/app-shell/AppShell.tsx`
- Modify: `src/components/app-shell/app-shell-types.ts`
- Modify: `src/routes/Fleet/index.tsx`
- Modify: `src/routes/Voyage/index.tsx`

- [ ] **Step 1: Write failing adaptive-layout tests**

Assert stage mode on fleet/voyage/new-or-empty chat at width `>=1280`, companion mode on active chat/task/project/skills/connections at width `>=1180`, compact on settings/modal or narrower widths, exact stage/companion/compact bounds, one host mount across route changes, and no overlap with elements marked `data-captain-safe-control`.

- [ ] **Step 2: Write failing event-mapping tests**

Map only existing safe application state: route change, chat listening/submitted/streaming/error, agent starting/running/error, task launch/completion/failure, pending permission, tool activity, and voice events. Assert captions use message IDs, never message body, command text, filesystem path, question text, or permission metadata.

- [ ] **Step 3: Run RED**

```powershell
corepack pnpm run test src/components/captain/CaptainHost.test.tsx src/components/app-shell/useCaptainAppEvents.test.tsx
```

Expected: FAIL because the host and mapping hook are absent.

- [ ] **Step 4: Implement provider placement and host**

Provider order becomes:

```tsx
<RuntimeFleetProvider>
  <FleetSkinProvider>
    <CaptainOrchestrator>
      <AuthProvider>…</AuthProvider>
    </CaptainOrchestrator>
  </FleetSkinProvider>
</RuntimeFleetProvider>
```

Mount `<CaptainHost />` exactly once alongside the route content in `AppShell`. The host renders permanent captions, voice toggle, one-click mute, manual read, and expand/collapse. Decorative area is `pointer-events:none`; only controls receive pointer events. Mark composer, permission approval, cancel, retry, dialog actions, and window controls as safe controls.

- [ ] **Step 5: Wire the mapping hook without growing presentation logic in `AppShell.tsx`**

Call `useCaptainAppEvents({ route, activeSessionId, displayedStatus, agentStatus, pendingPermissions, activity, error })`. The hook diffs semantic state and dispatches stable event IDs; it does not render and does not read chat messages.

- [ ] **Step 6: Run GREEN and focused regressions**

```powershell
corepack pnpm run test src/components/captain/CaptainHost.test.tsx src/components/app-shell/useCaptainAppEvents.test.tsx src/routes/Fleet/index.test.tsx src/routes/Voyage/index.test.tsx
corepack pnpm run ts-check
corepack pnpm run lint
```

- [ ] **Step 7: Commit Task 10**

```powershell
git add -- src/App.tsx src/components/captain src/components/app-shell/AppShell.tsx src/components/app-shell/app-shell-types.ts src/components/app-shell/useCaptainAppEvents.ts src/components/app-shell/useCaptainAppEvents.test.tsx src/routes/Fleet/index.tsx src/routes/Voyage/index.tsx
git commit -m "feat: keep captain present across the app"
```

---

### Task 11: Add Deterministic 50-image Electron Visual Regression

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `vite.visual.config.ts`
- Create: `tests/visual/index.html`
- Create: `tests/visual/main.tsx`
- Create: `tests/visual/VisualHarness.tsx`
- Create: `tests/visual/electron-main.cjs`
- Create: `tests/visual/playwright.config.ts`
- Create: `tests/visual/fleet-skins.visual.spec.ts`
- Create: `tests/visual/baselines/*.png` (50 reviewed baselines)
- Modify: `.gitignore`

- [ ] **Step 1: Add the pinned screenshot test dependency and scripts**

Add `@playwright/test: "1.62.0"` to dev dependencies; do not download a separate browser. Add:

```json
{
  "scripts": {
    "visual:build": "vite build --config vite.visual.config.ts",
    "visual:test": "pnpm run visual:build && playwright test --config tests/visual/playwright.config.ts",
    "visual:update": "pnpm run visual:build && playwright test --config tests/visual/playwright.config.ts --update-snapshots"
  }
}
```

Run `corepack pnpm install --lockfile-only` and review that only the expected package/lock entries changed.

- [ ] **Step 2: Write the failing visual matrix spec**

Use Playwright’s Electron launcher with the repository’s `.electron-dist/electron.exe` and `tests/visual/electron-main.cjs`. The dedicated main script creates one isolated `BrowserWindow` with `contextIsolation:true`, `nodeIntegration:false`, fixed locale/timezone/animations, and loads the visual Vite build. It must not load the authenticated application or network resources.

```ts
for (const crewId of BUILTIN_CREW_IDS) {
  for (const mode of ["stage", "companion", "compact"] as const) {
    test(`${crewId}-${mode}`, async ({ page }) => {
      await page.goto(harnessUrl({ crewId, mode, contrast: "standard", reducedMotion: false }))
      await expect(page.getByTestId("visual-case-ready")).toHaveAttribute("data-ready", "true")
      await expect(page).toHaveScreenshot(`${crewId}-${mode}.png`, { animations: "disabled", caret: "hide" })
    })
  }
  // One companion baseline for reduced motion and one for high contrast.
}
```

Expected matrix: 30 standard + 10 reduced-motion companion + 10 high-contrast companion = exactly 50 PNGs.

- [ ] **Step 3: Run RED**

```powershell
corepack pnpm run visual:test
```

Expected: FAIL because the harness/baselines are not complete.

- [ ] **Step 4: Implement the isolated harness**

`VisualHarness` renders shared `FleetSkinProvider`, `CaptainHost`, representative sidebar/titlebar/content/card/input/dialog controls, and deterministic `CaptainSnapshot`. Query parameters are validated against closed unions. Freeze current time, disable random particles, wait for `document.fonts.ready` and all images’ `decode()`, then set `data-ready="true"`. Output goes to ignored `tests/visual/test-results/`; only reviewed baselines are tracked.

- [ ] **Step 5: Generate and review baselines**

```powershell
corepack pnpm run visual:update
corepack pnpm run visual:test
```

Expected: first command creates exactly 50 baselines; second passes with zero pixel diffs. Review every baseline for complete scene, component material, correct captain uniform, caption readability, face safe area, and absence of partial previous-skin content. Baselines with obvious AI artifacts or layout collisions must be fixed and regenerated, not approved.

- [ ] **Step 6: Commit Task 11**

```powershell
git add -- package.json pnpm-lock.yaml vite.visual.config.ts tests/visual .gitignore
git commit -m "test: cover complete fleet skin visuals"
```

---

### Task 12: Add Electron End-to-end Acceptance Tests

**Files:**

- Create: `tests/e2e/electron-fixture.ts`
- Create: `tests/e2e/fleet-skins.electron.spec.ts`
- Create: `tests/e2e/fixtures/failing-required-asset.ts`
- Modify: `tests/visual/playwright.config.ts`
- Modify: `package.json`

- [x] **Step 1: Write failing end-to-end scenarios**

Add these exact scenarios:

1. Select each of ten fleets and assert the root skin, backdrop, component token signature, captain uniform, and audio cue commit together.
2. Navigate fleet → voyage → connections → settings and assert selection persists while host mode changes stage → companion → compact without remount.
3. Close/relaunch the isolated Electron app and assert the committed selection restores before the ready marker.
4. Assert initial voice is muted, explicit enable speaks only a catalogued critical event, mute calls cancel, and captions remain.
5. Inject one required-asset loader failure and assert old skin and persisted selection remain.
6. Assert keyboard access, reduced motion, and high contrast.

- [x] **Step 2: Run RED**

```powershell
corepack pnpm run e2e:fleet-skins
```

Expected: FAIL because the script/fixture/scenarios do not exist.

- [x] **Step 3: Implement the isolated test fixture**

Reuse the bundled Electron and a temporary user-data directory created per worker. Stub `speechSynthesis` with a call log, not real audio. Provide a test-only asset loader injection through the harness composition root; never add a production query parameter that disables validation. Add script:

```json
"e2e:fleet-skins": "pnpm run visual:build && playwright test --config tests/visual/playwright.config.ts tests/e2e/fleet-skins.electron.spec.ts"
```

- [x] **Step 4: Run GREEN**

```powershell
corepack pnpm run e2e:fleet-skins
```

Expected: all six scenarios PASS with no console errors, page errors, network requests, or missing resources.

- [x] **Step 5: Commit Task 12**

```powershell
git add -- tests/e2e tests/visual/playwright.config.ts package.json
git commit -m "test: verify fleet skins in Electron"
```

---

### Task 13: Run the Full Gate, Desktop Smoke, and Truthful Documentation

**Files:**

- Modify: `docs/implementation-status.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Create: `docs/verification/adaptive-captain-fleet-skins-2026-08-23.md`

- [x] **Step 1: Run the repository quality gate**

```powershell
corepack pnpm run ts-check
corepack pnpm run lint
corepack pnpm run format
corepack pnpm test
corepack pnpm run visual:test
corepack pnpm run e2e:fleet-skins
corepack pnpm run build
```

Expected: every command exits 0. Fix failures caused by this work. Record unrelated/pre-existing failures verbatim and keep completion blocked until the required gate is green.

- [x] **Step 2: Run desktop smoke at required sizes**

Start the observable worktree development build:

```powershell
corepack pnpm run dev:worktree
```

Inspect renderer/main logs and `wanta/logs/diagnostics.jsonl`. Exercise 1024×640, 1280×720, 1440×900, 1920×1080, and 2560×1440; verify captain placement, input/permission/cancel/retry/window controls, all ten switches, one rollback, cross-page continuity, voice enable/mute, reduced motion, and high contrast. Capture machine-readable screenshots/log references; do not rely only on narration.

- [x] **Step 3: Audit completion evidence**

Run:

```powershell
git status --short
git diff --check
rg -n "TODO|TBD|temporary skin|mock skin|Live2D complete|完整皮肤首版已完成" src resources tests README.md README.zh-CN.md docs/implementation-status.md
```

Expected: no unowned files, whitespace errors, temporary assets, or false Live2D/completion claims. Verify `tests/visual/baselines` contains exactly 50 tracked PNGs and `PROVENANCE.md` covers every tracked skin asset.

- [x] **Step 4: Update documentation according to evidence**

Only if every Task 13 check is green, mark the complete-skin first version complete in `docs/implementation-status.md` and README. Explicitly state “高品质分层动态舰长；预留 Live2D 接口；当前不是 Live2D”. If any check remains red, mark the feature `未完成` or `阻塞` and list the exact missing fleet/check.

- [x] **Step 5: Commit the verified delivery**

```powershell
git add -- docs/implementation-status.md docs/verification/adaptive-captain-fleet-skins-2026-08-23.md README.md README.zh-CN.md
git commit -m "docs: verify adaptive captain first version"
```

- [x] **Step 6: Stop before publication**

Record the final local commit SHA and branch. Do not push, create a Release, build a public installer, or publish promotional content. Publication remains a separate user-approved operation.

---

## Plan Self-review Checklist

- [x] Every design-spec section maps to at least one task and one verification command.
- [x] No task uses a temporary asset, partial skin, DOM snapshot, or manual assertion as a substitute for the required test.
- [x] All ten exact `BUILTIN_CREW_IDS` appear in the asset and manifest work.
- [x] The 50-image equation is explicit: `10 × 3 + 10 reduced-motion + 10 high-contrast`.
- [x] Imported content packs remain unable to activate assets or executable presentation data.
- [x] The atomic switch persists only after complete commit and rolls back all visible state on required failure.
- [x] Captain state priority, expiry, concurrency restoration, voice opt-in, caption persistence, and queue cancellation are all covered.
- [x] Live2D is only an interface seam and non-goal for this version.
- [x] Every production task starts with a focused failing test and ends with a commit.
- [x] No remote push or publication is included.
