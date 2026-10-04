# Reusable acceptance method

Declare purpose first: concept display, kinematic demonstration, engineering review, or manufacturing release. Choose criteria appropriate to that purpose and register every deliverable version. This directory supplies a method; the source audit on 2026-10-05 performed no CAD or physical checks.

## Status vocabulary

| Status                   | Meaning                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| recorded-pass            | A saved record meets a named criterion for its recorded artifact version and scope; it is not a current rerun        |
| recorded-fail            | A saved record shows a named criterion failed; retain it after repairs                                               |
| not-run                  | The check was not attempted for the stated scope/version                                                             |
| incomplete               | A check or deliverable was started or exists in part, but its completion criterion is not established                |
| needs-project-validation | A general method or historical observation needs evidence under the target project's inputs and operating conditions |

Keep the saved result and the current-review result in separate fields. When a new check runs, create a new dated record with the artifact hash, environment, criterion, measured result, and evidence; do not rewrite the historical outcome. A passed subset cannot close an untested whole.

## Gates and evidence

| Gate        | Check                                                                                                                                                     | Retain                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Input       | Requirement IDs, units/reference shafts, load spectrum, environment, material state, life/precision targets, assumptions and source versions              | Input register, ambiguity list, source/assumption links; unresolved release-critical inputs remain open                 |
| Native CAD  | Rebuild errors, units, expected solids, dimensions/features, wall thickness, protected faces, closure, and sections after geometry changes                | Versioned native artifact hash, numerical report, local CAD views/sections, before/after repair record                  |
| Assembly    | Reference integrity, instance quantities versus BOM, placement readback, fixed/mated state, rebuild, interference configuration and results               | Instance/BOM matrix, transforms, missing-reference list, interference regions and dispositions                          |
| Portability | Controlled relocated copy; original-reference fallback excluded; parts, assemblies, and drawings reopened and rebuilt                                     | Per-file reference resolution and document-specific results, interrupted attempts, environment/version                  |
| STEP        | Independent read and B-representation validity, expected solids, declared volume comparisons, native part re-import, native assembly re-import            | Separate format/shape/count/numerical/re-import outcomes, kernel/settings, export and reference hashes                  |
| Drawing/BOM | CAD/calculation/drawing/BOM versions agree; views, sections and dimensions are visible and associated; manufacturing annotation coverage fits the purpose | Drawing checklist, dimension readback, rendered sheet review, BOM quantity/version matrix, open annotation requirements |
| Delivery    | File inventory and hashes, package completeness, evidence links, explicit open items and scope                                                            | Manifest, delivery receipt, requirements status, release decision                                                       |

Sources: SRC-INPUT-01, SRC-EVIDENCE-01, SRC-GEOMETRY-01, SRC-ASSEMBLY-01, SRC-PORTABLE-01, SRC-STEP-CHECK-01.

## Numerical comparison

For a positive declared reference volume, use relative_error = abs(imported_volume - reference_volume) / reference_volume, with units and integration settings recorded. Handle zero, near-zero, invalid, and signed-volume references explicitly before comparing. A tolerance belongs to a criterion and version; choose it before the run rather than changing it to erase a failure.

The saved actuator case used a strict relative-volume criterion below 1e-5. Its summary reported valid STEP format alongside numerical failures and no native assembly roundtrip. Preserve all these outcomes. Other projects must justify their own tolerances; this case's threshold is not a universal manufacturing standard. Sources: SRC-STEP-CHECK-01, SRC-ACTUATOR-STEP-01.

## Motion and drawing boundaries

Record pose/path samples and solver settings. A collision check at selected poses or transition points supports only those samples. Continuous clearance requires a justified sweep, conservative bound, or other project-appropriate method. Analytical kinematics does not establish a native motion-study replay, force/stress, controls, endurance, or physical operation. Sources: SRC-HAND-POSE-01, SRC-HAND-PATH-01, SRC-ENGINE-MOTION-01, SRC-ENGINE-KINEMATICS-01.

Review drawings and manufacturing drawings have different completion criteria. Before manufacturing release, close the required material/process state, datums, tolerances, fits, tooth definition where relevant, inspection conditions, and drawing independence/association requirements. CAD or PDF generation alone does not close these items. Sources: SRC-INPUT-01, SRC-ACTUATOR-SCOPE-01.

## New-case record

For each criterion save: case ID, artifact/version hash, purpose, sourceIds, input and assumption IDs, environment/tool version, method/settings, acceptance threshold, measured result, dated evidence locator, status, open issue, and next verification action. Keep sensitive paths, identifiers, dimensions and materials in the project's private record.

Use cases.json as a small public summary. The private project owns the detailed evidence. Resolve every sourceId and check its hash before relying on it. When sources disagree, preserve both, identify the affected claim, and request evidence that resolves the conflict; do not pick the more favorable value.

Manufacturing release stays open while any release-critical input, geometry, strength/life/thermal/NVH, assembly, exchange, or drawing requirement lacks its required evidence. Actual engineering data and applicable current standards are project-specific. The library's saved examples did not include licensed KISSsoft execution or physical life/NVH tests. Source: SRC-LIBRARY-GAPS-01.
