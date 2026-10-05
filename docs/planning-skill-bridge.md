# Explicit installed-Skill bridge in beta.4

This slice connects an explicitly selected, already installed local Skill to a knowledge-bound Actuator Design Legion Mission. Verification and this slice's acceptance checks do not call a model; normal accepted Mission dispatch still uses the existing model-backed Agent pipeline. Selecting a Skill does not install or publish Skills, activate content-pack Skill declarations, grant CAD access, or enforce a read-only execution sandbox. No SolidWorks execution was performed for this slice.

## User entry

1. Build application source `0.1.0-beta.4`; import and select the unchanged `actuator-design-legion` content pack `1.0.1`.
2. Check existing local Skill installation on the Skills page. This bridge offers no installation action and creates no new domain Skill.
3. In Mission Chart, generate a plan and select Actuator Design Legion as the primary crew. The optional Skill field lists inventory groups with exactly one installed runtime host; none is selected by default.
4. Explicitly check up to four Skills and confirm the launch. Each `SKILL.md` is limited to 64 KiB, with 128 KiB combined. The host revalidates actual availability; a displayed inventory entry is not proof of kernel registration.

A disappearing selected entry blocks launch until the user repairs installation or explicitly clears the selection. New plans, crew changes and successful launches clear selections. History retries do not automatically reuse a Skill; replan to select again. The main dispatch path also verifies explicit selections supplied on an existing retry, but the history UI does not expose such a selection control.

## Verification and recorded evidence

- The main-only resolver refreshes inventory without writing its manifest. It matches the exact group ID and one installed runtime host, never renderer names, descriptions, group version guesses or source-only paths.
- It reads a regular UTF-8 `SKILL.md`, rejects symlink/junction/escaping paths, bounds the read, checks file identity before and after reading, and hashes the complete original bytes, including YAML frontmatter. The new reader is bounded; the inherited inventory scanner itself has not been redesigned or given a new global size limit.
- The actual frontmatter supplies the name and `metadata.version`/`metadata.packageName`; freshly scanned runtime-host metadata is the fallback. Undeclared version or package remains `null`, not a fabricated release. The version is a declaration, not a package signature.
- Real OpenCode `GET /skill` and `GET /experimental/tool/ids` responses must succeed and be structurally valid. The selected name, actual absolute location and frontmatter-free body must agree, and the `skill` tool must be registered. Body comparison only normalizes CRLF and surrounding whitespace; the raw document SHA remains byte-exact.
- The resolver reads again after the query. A changed digest, path or metadata fails. A main-only monotonic runtime revision and adapter identity are checked before generation and submission, so restart or replacement cannot reuse old registration evidence.
- Actual selected document text is escaped JSON in the existing system prompt; ID, name, declared version, package and SHA-256 are appended to the authoritative Mission execution text. This uses existing Agent conversation history, not a new durable Skill ledger or immutable retry pin. Fixed app-owned knowledge remains pinned independently at `1.0.0`.
- Missing, changed, ambiguous, oversized or unsupported selections fail before task submission. Rejected Mission dispatches do not trigger automatic title-model calls. Local optimistic Mission retries return to Mission Chart rather than falling through to ordinary chat. Ordinary chat behavior is unchanged.

The bridge applies only after the host reconstructs a stored Mission with a valid fixed knowledge binding and the installed `actuator-design-legion@1.0.1` primary crew. Other primary crews, support-only use and legacy pack `1.0.0` do not activate it. External BYOA sessions cannot accept this verified system path and are rejected for selected-Skill Legion dispatches.

## What real discovery proves

`smoke:planning-skills` starts the installed OpenCode `1.18.10` four times using disposable home/config/data/cache roots, an existing local plugin dependency and an unreachable dummy model endpoint. It queries discovery only; it never sends a prompt or executes a Skill/CAD workflow.

Observed behavior: discovery strips YAML frontmatter but preserves body whitespace; one running sidecar caches an earlier body even after the file changes. Same-name locations are merged by OpenCode, so name alone cannot establish the source. Restart reveals updated text; a sole alternative location resolves the same name to that alternative file. The host therefore checks path and body, not merely presence. OpenCode also includes a `<built-in>` Skill location; that sentinel cannot match a selected local absolute document path.

This is a query-time document snapshot, not proof of future tool use, model compliance, authorship or engineering correctness. A later disk change, automatic context compaction or subsequent unbound chat is not an immutable historical Skill replay guarantee. Registration does not grant permissions or establish read-only behavior. The highest-priority next slice is host-enforced read-only planning and verifiable input/check-plan artifacts; SolidWorks execution remains separate.

## Reproduce

```powershell
.\node_modules\.bin\vitest.cmd run electron/skills/planning-document.test.ts electron/skills/planning-resolver.test.ts electron/agent/planning-skills.test.ts electron/chat/planning-skill-context.test.ts electron/chat/node.test.ts src/routes/Voyage/index.test.tsx src/components/app-shell/use-composer-submission.test.tsx src/components/app-shell/mission-retry-routing.test.ts
node --experimental-strip-types scripts/planning-skill-runtime-smoke.ts
```

Publication still follows [the weekly release policy](weekly-release-policy.md). Application source advances to beta.4; content pack `1.0.1` and fixed knowledge `1.0.0` are unchanged and their existing immutable release bytes are retained. No new installer or paid-provider/CAD acceptance is included.
