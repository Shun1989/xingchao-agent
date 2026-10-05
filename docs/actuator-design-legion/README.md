# Actuator Design Legion knowledge

This directory is the public knowledge companion to the six-member Actuator Design Legion content pack. It contains original methods distilled from private engineering work and sanitized case records. Application source beta.3 binds five fixed public files as Mission reference context. It does not include CAD files, source drawings, third-party books, executable Skills, or a SOLIDWORKS connection.

## Activate the crew

Use the source-preview-v0.1.0-beta.3 application source build, version 0.1.0-beta.3, with content pack 1.0.1 and independent knowledge binding version 1.0.0. This source includes the beta app-version compatibility fix and the knowledge binding. Existing 0.1.0-beta.1 installer binaries lack the compatibility fix: pack import can succeed while selecting it fails. The beta.2 source contains the compatibility fix but has no knowledge binding.

This preview distributes source and content assets, not a desktop installer. It does not provide an installer upgrade or directly upgrade an existing beta.1 installation. Build and run the corrected application source before following the selection steps below.

Build the importable content archive from the repository root:

    node --experimental-strip-types scripts/build-actuator-legion-pack.ts

1. In Xingchao Navigation, open Supply Depot and import the generated archive at release/content-packs/actuator-design-legion/1.0.1/actuator-design-legion-1.0.1.xcp. The manifest is build input; it is not the file to import.
2. On the installed 1.0.1 pack, click Select and review the native confirmation before confirming use.
3. Create a Mission voyage chart for the task and set Actuator Design Legion as its primary crew. Fleet crew selection is separate from the pack's native confirmation and the Mission primary-crew choice.
4. Review the plan and confirm the voyage. The main process verifies the fixed application-owned knowledge files and appends their actual text, sourceIds, version and digest to the existing execution text.

The pack declares six responsibilities: design inputs, transmission calculations, parametric modeling, assembly inspection, drawings/BOM, and acceptance curation. They are role definitions; their tool declarations are not proof of an available tool or runtime permission.

## Runtime knowledge boundary

Automatic context binding applies only when the primary crew matches the installed and selected actuator-design-legion 1.0.1 pack. Pack 1.0.0 and other primary crews retain their existing execution context; choosing the Legion only as support does not inject the knowledge. Pack identity matching is not an author signature.

The main process reads only application-owned `knowledge.md`, `cases.json`, `acceptance.md`, `sources.json`, and `design-input.json`, validating each file's SHA-256 and size against the compiled main-process allowlist. The public `runtime-binding.json` is informational and is not read as a trust source. It does not retrieve arbitrary imported-pack files, private source records or model files. The content is public original guidance supplied as reference data, not an instruction or permission source.

The main process stores binding version 1.0.0 and its digest as a reserved constraint in the existing Mission ledger, without adding IPC or ledger fields. One of the 32 constraint slots is host-owned, allowing at most 31 user constraints for a bound Legion Mission. Every retry and dispatch revalidates the files and binding; a changed binding requires a new plan. It cannot silently replace the evidence for an admitted Mission.

This adds task context. It does not install or execute complete Skills, grant tools or permissions, activate a persona, connect SOLIDWORKS, or train a model. Paid model calls, real CAD execution and manufacturing acceptance were not run for this slice.

## Use the knowledge in a workspace chat

For a Codex chat outside the application's confirmed Mission path, retrieval is still explicit. With this repository as its workspace, use a task such as:

> Read docs/actuator-design-legion/README.md, knowledge.md, acceptance.md, and the relevant cases.json entries. Produce a design-input register and a check plan for this project's actuator. Cite sourceIds, distinguish confirmed inputs from assumptions, and mark checks without current evidence as not-run or needs-project-validation. This task is limited to input review and planning; do not start CAD.

When the repository is elsewhere, supply its real location. A file path in a persona or a manifest is only a reference; the automatic Mission binding above uses application-owned fixed files instead of following those paths.

## Files

| File                                         | Use                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| [README.md](README.md)                       | Activation steps, runtime boundary and explicit workspace use          |
| [knowledge.md](knowledge.md)                 | Six reusable rules, each with a traceable sourceId                     |
| [cases.json](cases.json)                     | Sanitized failures, saved successes, and their verification boundaries |
| [acceptance.md](acceptance.md)               | Inputs, CAD, assembly, STEP, drawing, and packaging checks             |
| [growth.md](growth.md)                       | Current capability and the next execution-binding priority             |
| [sources.json](sources.json)                 | Public source IDs, file hashes, categories, and audit date             |
| [design-input.json](design-input.json)       | Original blank input/check-plan template; unknown values stay null     |
| [runtime-binding.json](runtime-binding.json) | Binding identity/version and SHA-256/size for the five runtime files   |

The standalone `actuator-design-legion-1.0.1-knowledge.zip` contains these eight documentation/metadata files, the `.xcp` archive and license files. The `.xcp` remains manifest-only; importing it does not load arbitrary knowledge files from the archive.

Public source IDs resolve to a local private provenance map, not to downloadable originals. The audit read and hashed source records on 2026-10-05. It did not run CAD, re-export STEP, reopen native files, or perform physical testing. A saved result remains evidence for its recorded version and scope.

## Add a new case

Use the record shape in cases.json. Give the case a new ID, preserve a sanitized trigger, identify the artifact version privately, declare the criterion before running a check, and record its result separately from the current review. Include failure evidence and unresolved requirements. Re-run the affected checks after a repair; retain the old failed record.

Only publish original method summaries and sanitized observations with permission. The private source library includes third-party materials without a blanket redistribution license. Keep PDFs, models, drawings, private paths, part identifiers, material grades, suppliers, and product dimensions out of this directory.
