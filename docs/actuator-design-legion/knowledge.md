# Six working rules

These rules guide a check plan. They are not a product approval or a substitute for project-specific engineering data. Source IDs and hashes are listed in [sources.json](sources.json); outcomes use the vocabulary in [acceptance.md](acceptance.md).

## R1 — Register inputs and assumptions before choosing geometry

Record the input/output reference shafts, units, continuous and peak loads, speed range, duty and reversal, accuracy/backlash, allowed deformation, life target, environment, lubrication, installation envelope, and manufacturing process. Keep physical load history separate from a software-normalized spectrum and state whether weights represent time or cycles. Register every missing input as a numbered assumption with an owner and a closure condition. A concept comparison may use an assumption; acceptance may not quietly treat it as a confirmed requirement.

Reusable output: an input register with requirement ID, value/unit, evidence, assumption status, and acceptance criterion.

sourceId: SRC-INPUT-01

## R2 — Preserve the evidence tier and the method's limits

Label original visual evidence, OCR/extracted text, derivation, project assumption, and verified measurement separately. Confirm a formula, unit, material property, or ambiguous drawing feature against the original source before using it as a design input. Carry the source version and applicability into the calculation. Historical examples, conflicting source values, unexecuted software examples, and synthetic signals cannot provide current allowable stresses, life, or NVH approval.

Reusable output: a claim register connecting each conclusion to its evidence tier, sourceId, uncertainty, and required project validation.

sourceId: SRC-EVIDENCE-01

Supporting sourceIds: SRC-LIBRARY-GAPS-01, SRC-INPUT-01

## R3 — Validate interfaces and protected geometry after every space-cut repair

Establish common coordinates, axes, mounting faces, interface dimensions, and clearance requirements before adding detail. Test the smallest functional assembly first. Before a clearance cut, name the faces, minimum walls, and mounting features that must survive. Afterwards inspect a local section, remaining wall thickness, external closure, interfaces, and interference together. A successful rebuild, positive volume, or one solid does not detect every broken wall.

Reusable output: a before/after repair record with the protected boundaries, measured results, section evidence, and the affected export/drawing versions.

sourceId: SRC-GEOMETRY-01

## R4 — Verify assembly instances against the BOM and inspect interference evidence

Compare expected quantities with actual instances and reference paths, including nested components where required. Read back placements; distinguish fixed presentation positions from valid engineering mates or motion constraints. Record rebuild result, missing references, interference pairs, affected regions, and the collision-check configuration. Classifying an intersection as a contact, intended overlap, or unresolved conflict does not itself close its engineering requirement.

Reusable output: an instance/BOM comparison and an interference register with a disposition, rationale, and follow-up criterion for each pair.

sourceId: SRC-ASSEMBLY-01

Supporting sourceIds: SRC-GEOMETRY-01

## R5 — Reopen a relocated native package and check each document type

Work on a controlled copy in a separate location. Demonstrate that the copy resolves its own references without falling back to the original tree. Reopen and rebuild parts, assemblies, and drawings; compare relevant solid counts, volume references, instance state, drawing dimensions, and section visibility. Keep the test's source version and environment. An interrupted extra reopen remains incomplete even when an earlier relocation check passed.

Reusable output: a per-file relocation report with resolved-reference locations, rebuild outcomes, document-specific checks, and interrupted attempts.

sourceId: SRC-PORTABLE-01

Supporting sourceIds: SRC-HAND-REOPEN-01

## R6 — Separate STEP readability, shape validity, numerical agreement, and release

Check STEP with an independent reader/kernel for read status, valid B-representation, expected solid count, and declared numerical comparisons. Separately test native re-import for parts and assemblies. Fix the comparison reference, units, integration settings, and threshold before running the check. The recorded actuator case kept a relative-volume threshold of 1e-5 unchanged despite failures; an additional native accuracy setting was a measurement, not an automatic replacement for the reference.

Numerical agreement does not establish wall thickness, tooth accuracy, strength, endurance, thermal behavior, NVH, or manufacturing readiness. Those require their own project evidence.

Reusable output: a STEP matrix with a separate result for each criterion and an explicit release decision linked to unresolved requirements.

sourceId: SRC-STEP-CHECK-01

Supporting sourceIds: SRC-ACTUATOR-STEP-01, SRC-ACTUATOR-SCOPE-01, SRC-LIBRARY-GAPS-01
