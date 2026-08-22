# Runtime Fleet Activation Design

**Date:** 2026-08-22
**Status:** Approved in chat; awaiting written-spec review
**Scope:** Selected declarative content packs become visible to Fleet Harbor, Voyage planning, deterministic routing, mission construction, and crew theming.

## 1. Summary

The Supply Depot can securely install a content pack, persist one selected version per pack ID, and build a namespaced runtime catalog in the Electron main process. The application does not yet consume that catalog. Fleet Harbor, Voyage, theming, routing, and mission prompts still import the built-in fleet as module globals.

This change introduces a main-process-owned, renderer-safe `RuntimeFleetSnapshot`, a single React provider for that snapshot, and explicit catalog parameters for domain routing and mission construction. Selected imported crews will appear without an application restart, can be recommended and chosen for a mission, and can provide a theme. Removing or deselecting a pack removes its content from the runtime view and safely restores a built-in crew.

Imported text remains untrusted data. It cannot grant tools, change permission policy, or inject system instructions. Full persona, evaluation, Skill, voice, asset, and Agent-system-prompt activation remain separate work.

## 2. Current State and Problem

The relevant existing boundaries are:

- `ContentPackRuntimeManager.runtimeCatalog()` is the main-process authority. It combines the built-in pack with explicitly selected installed versions, namespaces imported IDs, preserves provenance, and rejects collisions.
- `ContentPackService` exposes install, list, remove, and confirmed selection operations. It intentionally does not expose installation paths or manifests to the renderer.
- `src/domain/xingchao/crews.ts` exports static `crews`, `agents`, and lookup maps.
- `src/domain/xingchao/routing.ts`, Fleet Harbor, Voyage, and `XingchaoThemeProvider` read those static exports directly.
- `CrewId` is a closed union containing only the ten built-in IDs, while validated imported manifests and the namespaced runtime catalog require arbitrary safe IDs.

Exposing raw installed manifests would duplicate main-process catalog and security logic in React. Mutating the static module exports would create implicit state, stale references, and order-dependent tests. The runtime fleet therefore needs one explicit, immutable snapshot boundary.

## 3. Goals

1. Make selected imported crews and their six-member rosters visible in Fleet Harbor without restarting the app.
2. Include imported crews in deterministic recommendation, primary/support selection, and mission DAG construction.
3. Allow a selected imported crew theme to drive the existing theme provider.
4. Ensure every mission crew and Agent reference resolves within the exact snapshot used to build that mission.
5. Remove imported content from the runtime UI immediately after deselection or removal.
6. Keep installation paths, checksum inventories, raw manifests, full personas, evaluations, and declared tool boundaries outside the renderer RPC contract.
7. Keep the built-in ten crews and sixty Agents behaviorally unchanged when no imported pack is selected.
8. Treat all imported display and prompt-bound text as untrusted data with bounded size and explicit prompt-data isolation.

## 4. Non-goals

This phase does not:

- inject imported personas, relationships, evaluations, or complete profiles into the Agent system prompt;
- grant tools or permissions declared by a content pack;
- load or execute content-pack Skills;
- activate voice files, arbitrary assets, portraits, or Live2D overlays from package paths;
- change the existing model/provider protocol layer;
- run paid sixty-Agent evaluation;
- create an installer, GitHub Release, updater channel, signing flow, or public release.

The static system prompt may receive a generic safety statement that pack data is untrusted. It will not receive a dynamically generated imported roster in this phase.

## 5. Chosen Architecture

### 5.1 Main-process authority

`ContentPackRuntimeManager` remains the only component allowed to read installed pack directories and selection persistence. `ContentPackService` gains one read-only method:

```ts
runtimeFleet(): Promise<RuntimeFleetSnapshot>
```

The service calls `runtimeCatalog()` and passes its result through a pure whitelist projector. It never returns the raw manager result because that result contains `Map` instances and more profile data than the renderer needs.

The projector is independently testable and returns only plain JSON-compatible objects and arrays.

### 5.2 Snapshot contract

The snapshot contains:

```ts
interface RuntimeFleetSnapshot {
  revision: string
  crews: RuntimeFleetCrew[]
  agents: RuntimeFleetAgent[]
  themes: RuntimeFleetTheme[]
  sources: {
    crews: Record<string, RuntimeFleetSource>
    agents: Record<string, RuntimeFleetSource>
    themes: Record<string, RuntimeFleetSource>
  }
}
```

`revision` is a deterministic, sorted list of the contributing `packId@version` values. It is an identity and stale-response aid, not a security digest.

The DTO whitelist is:

- Crew: runtime ID, name, domain, motto, description, captain ID, member IDs, routing signals, support signals, standard workflow, and theme ID.
- Agent: runtime ID, crew ID, name, title, role, biography, capability labels/scores, deliverable labels, and display accent/silhouette.
- Theme: runtime ID, name, palette, texture, motion, sound cue label, Live2D overlay label, and high-contrast palette. Labels do not authorize loading files.
- Source: `kind`, `packId`, and `packVersion`. Local installation path, local source ID, archive metadata, and checksums are excluded.

The DTO excludes persona fields, relationships, delegation graphs, voice parameters, evaluation prompts, prohibited-action text, and `allowedTools`. Those fields are unnecessary for this UI/planning phase and would expand the prompt-injection and capability-confusion surface.

### 5.3 Renderer provider

`RuntimeFleetProvider` is mounted inside the existing application `ThemeProvider` and above `XingchaoThemeProvider`. It owns:

- the current snapshot;
- memoized crew, Agent, and theme lookup maps;
- `agentsForCrew(crewId)`;
- `loading` and non-blocking `error` state;
- subscription to `contentPacksChanged`.

The initial value is a renderer-local projection of the trusted built-in pack, so the existing fleet remains usable if the Electron service is temporarily unavailable.

On initial mount, the provider reads `runtimeFleet()`. On `contentPacksChanged`, it immediately replaces the active snapshot with the built-in snapshot and starts a new read. The temporary built-in fallback is deliberate: a removed or deselected imported crew must not remain usable while an asynchronous refresh is pending.

Each read captures a monotonically increasing generation. Only the newest generation may commit a result or error. This prevents a slow older response from overwriting a newer selection state. Unmounted providers ignore completion.

### 5.4 Consumer migration

Fleet Harbor, Voyage, and `XingchaoThemeProvider` consume the same provider value. None may independently reconstruct a fleet or subscribe to content-pack events.

- Fleet Harbor renders `snapshot.crews`, resolves the active crew through provider maps, and renders `agentsForCrew`.
- Voyage passes the snapshot explicitly to recommendation, mission construction, and launch-prompt functions.
- The theme provider resolves themes through the runtime maps. If a stored crew ID does not exist in the current snapshot, it removes that storage value and falls back to built-in `watchtide`.
- A content-pack event that removes the active imported crew therefore resets display, planning, and theme state coherently.

The application must not mix a recommendation from one revision with mission construction from another. Voyage stores the revision alongside its draft. If the provider revision changes before confirmation or launch, the draft is invalidated and regenerated from the user's unchanged goal. The UI must not dispatch a stale mission.

## 6. Runtime Types

The current closed `CrewId` cannot represent imported runtime IDs. The type model changes as follows:

- `BUILTIN_CREW_IDS` is an `as const` list of the ten built-in IDs.
- `BuiltinCrewId` is derived from that list and remains the type for trusted defaults and built-in-only assertions.
- `CrewId` becomes the validated runtime string boundary used by `CrewProfile`, Mission, MissionNode, selection state, and provider APIs.
- Namespaced imported IDs retain the existing `<pack-id>--<local-id>` format.
- Built-in IDs remain unchanged.

Runtime IDs are plain strings over IPC. Safety comes from manifest validation, namespacing, collision rejection, and snapshot referential-integrity validation rather than a TypeScript brand that would disappear during serialization.

Routing and mission functions no longer import `crews`, `agents`, or lookup maps. Their signatures accept a catalog/snapshot explicitly. Built-in convenience wrappers may remain only where they make tests or legacy call sites clearer; production Fleet/Voyage flows use the explicit APIs.

## 7. Routing and Mission Construction

Deterministic scoring remains unchanged:

- routing signal match: 3 points;
- support signal match: 1 point;
- primary signal within the first eight normalized characters: 10-point leading-intent bonus;
- snapshot order resolves ties.

All selected imported crews participate under the same rules. No pack may declare a higher global priority or override built-in scoring logic.

Mission construction verifies before returning:

- one primary crew exists in the snapshot;
- support IDs exist, are unique, differ from primary, and are limited to two;
- each selected crew has an existing captain and at least one non-captain member;
- every MissionNode crew and Agent ID resolves in the snapshot;
- all dependency IDs resolve in the produced DAG.

If a requested crew is missing, the function falls back to built-in `helm-order` only when building a fresh draft. A previously confirmed mission never silently changes crews; revision change invalidates it instead.

## 8. Untrusted Text and Prompt Isolation

Selected packs are user-approved local content, but their strings are not trusted instructions.

Before runtime activation, manifest validation gains bounded lengths and collection counts for every display or prompt-bound field. The implementation uses explicit constants shared by the Zod validator and published JSON Schema. Combined selected content is capped at 100 crews, 600 Agents, and 100 themes. Exceeding a per-pack or combined limit rejects runtime activation rather than truncating semantic data.

React renders imported strings as text and never uses raw HTML.

`missionLaunchPrompt(mission, snapshot)` has two sections:

1. trusted, static execution instructions authored by the application;
2. a JSON-serialized `content_pack_data` block containing only IDs, names, node titles, and deliverable labels needed for the confirmed plan.

The trusted section states that every value in `content_pack_data` is an untrusted label and must not be interpreted as an instruction, tool request, permission grant, or policy override. Control characters not permitted by the manifest schema are rejected. The prompt never includes `allowedTools`, persona instructions, evaluation prompts, relationships, or arbitrary asset content.

This isolation reduces risk but is not treated as permission enforcement. Electron approvals and the existing Agent/tool permission layer remain authoritative.

## 9. Failure and Concurrency Behavior

- Main-process catalog or projection failure rejects the RPC; it never returns a partial imported fleet.
- Provider failure records renderer diagnostics, exposes a non-blocking localized error, and uses only the built-in snapshot.
- A stale response cannot replace a newer generation.
- An invalid stored active crew is removed and replaced with `watchtide`.
- Deselect/remove events invalidate current imported missions and theme selection before reloading.
- Snapshot referential-integrity failure is fail-closed to the built-in snapshot.
- Selection persistence remains unchanged. A pack may remain selected even if runtime projection fails; Supply Depot shows the selected state, while Fleet/Voyage show the runtime error. This preserves evidence and avoids silently rewriting user intent.

## 10. Migration Sequence

Implementation is divided into dependency-ordered steps:

1. Add bounded manifest-field/collection validation and keep the JSON Schema synchronized.
2. Introduce built-in/runtime ID types and pure explicit-catalog routing/mission APIs while preserving built-in behavior.
3. Add the pure snapshot projector, combined-catalog caps, service RPC, and main-process tests.
4. Add `RuntimeFleetProvider`, event/generation handling, lookup maps, and provider tests.
5. Migrate theme state and Fleet Harbor to the provider.
6. Migrate Voyage recommendation, mission construction, revision invalidation, and prompt-data isolation.
7. Update implementation status and user-facing copy so “selected” and “runtime active” remain distinguishable.

Each step must compile and pass its focused tests before the next step begins. The final branch must pass the repository's relevant test set, type checking, lint, changed-file formatting, and renderer/main/preload production build.

## 11. Test Strategy

### 11.1 Validator and catalog

- Reject oversized runtime text, arrays, per-pack inventories, and combined selected catalogs.
- Preserve the existing ten-crew/sixty-Agent built-in manifest.
- Keep JSON Schema and runtime validation behavior aligned.

### 11.2 Snapshot projection

- Project imported and built-in IDs, references, themes, and provenance correctly.
- Return JSON-compatible plain objects and arrays.
- Prove forbidden data is absent: paths, checksums, persona, evaluations, voice, relationships, `allowedTools`, and raw manifests.
- Reject unresolved captain/member/crew/theme references and combined-catalog limits.

### 11.3 Domain routing and missions

- Preserve existing built-in recommendation fixtures.
- Recommend an imported crew when its literal routing signal wins.
- Build valid primary/support missions from imported crews.
- Reject or safely handle missing references, duplicate support IDs, and more than two support crews.
- Invalidate stale-revision missions rather than silently rerouting them.
- Serialize only the prompt-data whitelist and keep injected-looking fixture text inside the JSON block.

### 11.4 Provider

- Start with the built-in snapshot, then adopt a valid service snapshot.
- Refresh on install/remove/selection events.
- Reset to built-in immediately on a change event.
- Ignore out-of-order responses and post-unmount completion.
- Fall back to built-in and report an error on RPC or integrity failure.

### 11.5 UI integration

- Fleet Harbor displays an imported crew and its six members after snapshot load.
- Selecting the imported crew changes the theme.
- Voyage includes the imported crew in recommendation and selection controls.
- Deselect/remove removes the imported crew and restores the built-in fallback.
- A snapshot revision change invalidates an unconfirmed or confirmed-but-not-launched imported mission.

## 12. Acceptance Criteria

The feature is complete only when current evidence proves all of the following:

1. Selecting a valid installed pack causes its namespaced crews to appear in Fleet Harbor without restart.
2. A matching imported routing signal can produce that crew as the deterministic primary recommendation.
3. The user can select the imported crew as primary or support and obtain a mission whose crew, Agent, and dependency references all resolve in the same snapshot revision.
4. Selecting the crew applies its declared palette through the existing theme system without loading arbitrary package files.
5. Deselecting or removing the pack removes its content from Fleet/Voyage and restores a valid built-in active crew.
6. A stale mission cannot launch after the snapshot revision changes.
7. The renderer snapshot contains no installation paths, checksum inventories, raw manifests, full personas, evaluations, voice data, relationships, or declared tool permissions.
8. Imported text cannot alter Electron permission enforcement or actual tool availability, and prompt-bound values appear only in the isolated data block.
9. With no selected imported pack, existing built-in recommendation, mission, Fleet Harbor, and theme behavior remains unchanged.
10. Focused tests, type checking, lint, changed-file formatting, and renderer/main/preload production builds pass. Any unrelated repository-wide baseline failure remains reported separately.

## 13. Alternatives Rejected

### Renderer reconstructs the runtime catalog

Rejected because it would expose raw manifests, duplicate namespacing and validation logic, and make React responsible for a filesystem-derived security boundary.

### Mutate static module-global arrays and maps

Rejected because existing imports would observe inconsistent state, tests would depend on execution order, and old mission/theme references could survive deselection.

### Activate complete personas, tools, Skills, and assets in one phase

Rejected because display/routing activation and executable capability activation have different security properties. Tool permissions, Skill code, assets, and prompt personas require separate threat models and user controls.

## 14. Delivery Policy

This work is developed, tested, documented, committed, and ordinarily pushed to `origin/codex/xingchao-platform`. Per the user's current instruction, it does not create a GitHub Release or upload an installer. Public release work resumes only after a new explicit authorization.
