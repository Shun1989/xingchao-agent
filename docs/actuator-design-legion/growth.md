# Capability and growth

## Current state

The content pack defines six professional responsibilities, routing signals, deliverables, evaluation prompts, and a shared palette. This directory adds six source-linked methods, representative cases, an acceptance vocabulary, a source-hash index and a fixed runtime binding. The beta.3 Mission path supplies verified public reference context; workspace chats outside that path can still explicitly request the files with access.

The source-preview-v0.1.0-beta.3 preview pairs application source version 0.1.0-beta.3 with content pack version 1.0.1 and independent knowledge binding version 1.0.0. Crew selection requires a source build containing the beta app-version compatibility fix. Existing beta.1 installers lack the fix and may import a pack successfully but fail to select it. The beta.2 source contains that fix but has no knowledge binding. This preview supplies source and content assets, with no new desktop installer or direct installer upgrade.

In the corrected beta.3 source build, import and select 1.0.1, set the Legion as the Mission primary crew, and confirm the voyage. The main process checks SHA-256 and size for the app-owned `knowledge.md`, `cases.json`, `acceptance.md`, `sources.json`, and `design-input.json`, then appends their actual text, sourceIds, binding version and digest to the existing execution text. It retains the version/digest as a reserved constraint in the existing ledger without new IPC or ledger fields, and revalidates on every retry and dispatch. A changed binding requires replanning.

Only a primary crew matching the installed pack ID and version 1.0.1 receives this context. Old 1.0.0 packs, other primary crews and support-only Legion selection do not. Identity matching is not an author signature; the loader reads fixed app-owned public original guidance, not arbitrary imported files, private provenance records or model files. The standalone knowledge ZIP contains eight documentation/metadata files including `runtime-binding.json`; the `.xcp` remains manifest-only.

Current capability is input review, evidence organization, planning, and scoped interpretation of saved records. This binding adds reference context; it is not complete Skills execution or model learning. It does not grant tools or permissions, install executable Skills or personas, create specialist runtime sessions, or bind SOLIDWORKS tools. A declared capability level or tool name does not prove measured execution capability.

The source audit reviewed saved records and original method notes. Paid model calls, CAD execution, fresh native reopen, new STEP export/re-import, licensed transmission-software execution, manufacturing acceptance and physical life/NVH validation were not run in this slice.

## Single next priority: read-only planning Skill bridge

Bridge a real project-scoped, read-only planning Skill to the execution adapter. Build on the verified knowledge context and make actual tool availability, permission scope, source references and input/check-plan evidence observable. SOLIDWORKS remains a later execution integration rather than a capability supplied by this pack.

The planning bridge is reviewable when a bounded task demonstrates all of the following:

1. The chosen role consumes the bound file/version and exposes the sourceIds it actually used.
2. The runtime discovers actual tools and permissions; persona declarations do not create either.
3. A planning-only task reads knowledge and produces an input/check plan without starting CAD.
4. The read-only scope and generated planning evidence are observable, including failure, interruption, missing tools and stale evidence; no status silently changes to passed.

A later CAD bridge will require a separately scoped execution task, one CAD writer, designated project/output paths and versioned evidence. The current context binding and next planning bridge do not establish that execution capability. Promote capability claims only from measured results.

## Promote experience with evidence

A new observation starts as a project case. Preserve its trigger, failed version, repair, criterion, result, and applicability. Only generalize it after a scoped rerun supports the repair and an independent check or additional project establishes the claimed range. Keep contradictory cases and unresolved items.

Promotion changes a method only within demonstrated bounds. It does not turn a kinematic example into strength/life approval, discrete clearance into continuous clearance, or a readable STEP into manufacturing release. Source methods: SRC-GEOMETRY-01, SRC-HAND-PATH-01, SRC-ACTUATOR-STEP-01, SRC-LIBRARY-GAPS-01.
