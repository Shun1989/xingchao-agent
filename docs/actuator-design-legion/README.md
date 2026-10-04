# Actuator Design Legion knowledge

This directory is the explicit knowledge companion to the six-member Actuator Design Legion content pack. It contains original methods distilled from private engineering work and sanitized case records. It does not include CAD files, source drawings, third-party books, executable Skills, or a SOLIDWORKS connection.

## Activate the crew

Use an application source build that includes the beta app-version compatibility fix from the source-preview-v0.1.0-beta.2 preview. The application source version is 0.1.0-beta.2; the six-member content pack remains 1.0.0. Existing 0.1.0-beta.1 installer binaries do not contain this fix: pack import can succeed while selecting it fails.

This preview distributes source and content assets, not a desktop installer. It does not provide an installer upgrade or directly upgrade an existing beta.1 installation. Build and run the corrected application source before following the selection steps below.

Build the importable content archive from the repository root:

    node --experimental-strip-types scripts/build-actuator-legion-pack.ts

1. In Xingchao Navigation, open Supply Depot and import the generated archive at release/content-packs/actuator-design-legion/1.0.0/actuator-design-legion-1.0.0.xcp. The manifest is build input; it is not the file to import.
2. On the installed 1.0.0 pack, click Select and review the native confirmation before confirming use.
3. In Fleet, choose Actuator Design Legion and create a voyage chart for the task. Fleet crew selection is separate from the pack's native confirmation.
4. Give the selected agent an explicit task and the relevant knowledge-file paths. Importing or selecting a crew does not load this directory into Codex, install a Skill, grant tools, or start CAD.

The pack declares six responsibilities: design inputs, transmission calculations, parametric modeling, assembly inspection, drawings/BOM, and acceptance curation. They are role definitions; their tool declarations are not proof of an available tool or runtime permission.

## Use the knowledge explicitly

In a Codex chat with this repository as its workspace, use a task such as:

> Read docs/actuator-design-legion/README.md, knowledge.md, acceptance.md, and the relevant cases.json entries. Produce a design-input register and a check plan for this project's actuator. Cite sourceIds, distinguish confirmed inputs from assumptions, and mark checks without current evidence as not-run or needs-project-validation. This task is limited to input review and planning; do not start CAD.

When the repository is elsewhere, supply its real location. A file path in a persona or a manifest is only a reference; it is not automatic retrieval.

## Files

| File                                   | Use                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------- |
| [knowledge.md](knowledge.md)           | Six reusable rules, each with a traceable sourceId                     |
| [cases.json](cases.json)               | Sanitized failures, saved successes, and their verification boundaries |
| [acceptance.md](acceptance.md)         | Inputs, CAD, assembly, STEP, drawing, and packaging checks             |
| [growth.md](growth.md)                 | Current capability and the next execution-binding priority             |
| [sources.json](sources.json)           | Public source IDs, file hashes, categories, and audit date             |
| [design-input.json](design-input.json) | Original blank input/check-plan template; unknown values stay null     |

Public source IDs resolve to a local private provenance map, not to downloadable originals. The audit read and hashed source records on 2026-10-05. It did not run CAD, re-export STEP, reopen native files, or perform physical testing. A saved result remains evidence for its recorded version and scope.

## Add a new case

Use the record shape in cases.json. Give the case a new ID, preserve a sanitized trigger, identify the artifact version privately, declare the criterion before running a check, and record its result separately from the current review. Include failure evidence and unresolved requirements. Re-run the affected checks after a repair; retain the old failed record.

Only publish original method summaries and sanitized observations with permission. The private source library includes third-party materials without a blanket redistribution license. Keep PDFs, models, drawings, private paths, part identifiers, material grades, suppliers, and product dimensions out of this directory.
