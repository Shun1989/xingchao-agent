# Weekly version management and GitHub publication

The user authorizes weekly versioned GitHub releases after substantive, verified project progress. This extends the existing `github-2` schedule; it does not authorize unrelated promotion, paid calls, modifying source CAD projects, or publishing private engineering material.

## Destination and history

- Publish only to the verified project `origin`, currently `Shun1989/xingchao-agent`. Check `gh auth status`, repository identity and write permission each run. Never publish to Wanta upstream.
- Preserve unrelated changes. Stage only explained, verified task files; fetch and check divergence before ordinary pushes. Do not force push, move existing tags, overwrite assets, merge branches automatically or manufacture commits when there is no meaningful change.
- The release tag must resolve to the final verified commit already pushed to origin. Keep source commits, tag publication and release publication distinct in the report.

## Version scopes

| Scope                                                 | Version and release                                                                                                                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application behavior                                  | Bump the application semantic version according to the actual change. Use `v<version>` only with accepted application/update assets; otherwise publish a clearly labeled `source-preview-v<version>` prerelease. |
| Legion content and original knowledge only            | Increment the content manifest version and use `actuator-design-legion-v<version>`. Label it as a content/knowledge preview, not a new desktop binary. Do not alter updater metadata.                            |
| No deliverable change or failed required verification | No new tag or release. Report the evidence and blocker.                                                                                                                                                          |

Content-pack versions are immutable. The reproducible builder refuses to overwrite different bytes at the same version. The first legion pack is `1.0.0`; its knowledge documents describe recorded source checks, not new CAD execution.

Publish source/content previews with `--prerelease --latest=false` and the non-SemVer tag prefixes above. The current beta updater explicitly scans the `beta` channel and skips non-SemVer tags; `--latest=false` alone does not isolate its prerelease scan. Do not publish an installer-free preview under an ordinary application `v<version>` tag. Recheck this assumption if updater discovery changes.

## Release gates

1. Run proportionate tests, type checking, lint, formatting and build checks. Inspect the staged diff for unrelated changes, private paths, credentials, original PDFs, customer geometry and proprietary parameters.
2. Push the verified commit and a new tag without replacing history. Create the GitHub release as a draft with `--verify-tag` and explicit English release notes.
3. Attach only verified deliverables with SHA-256 checksums. Inspect the draft's tag/commit, prerelease flag, asset names, sizes, upload state and digests before publication.
4. Publish the draft only after those checks pass. Query GitHub again to confirm the public URL, `draft=false`, expected tag, commit and assets. A successful CLI exit is insufficient evidence.
5. Report the commit, branch, tag, release URL, attachment verification and missing acceptance separately. Authentication or permissions failures retain local work and block publication; they do not authorize another repository.

Source/content previews are allowed when clearly scoped. Desktop installers still require the applicable signature or explicitly authorized unsigned-beta status, provenance, archive, licensing and install/upgrade/uninstall checks in [the application release runbook](release.md). A renderer build does not satisfy those gates. Never upload an old installer under a new version or claim a content preview is an application update.

## Legion growth

Read new results from the user-authorized SolidWorks task and compare source hashes with the private provenance index. Keep the source project read-only. Promote only original, reusable, appropriately verified lessons; preserve failures and conflicting evidence. Public records contain sanitized descriptions and source IDs, while local provenance retains private paths. Raw textbooks, models and full conversations are not release assets.

The next legion priority is explicit knowledge/Skill execution binding. SolidWorks execution and manufacturing acceptance remain separate future gates. The existing Star stop condition remains in force: no synthetic change or release after the valid threshold has been reached.
