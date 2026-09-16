# Windows Release Candidates

The current first-release target is an **unsigned Windows public beta**, authorized on 2026-09-17. Follow [the beta runbook](windows-beta.md) for that path. Public beta artifacts are not signed stable releases and must never be promoted through `latest.yml`.

The `Windows signed stable candidate` workflow is retained for a future signed stable release. It is manually dispatched, runs on Windows x64, and uploads a GitHub Actions artifact. It does not create a tag, push a commit, publish a GitHub Release, or upload an update to any external service. The signing requirements below apply to that stable workflow, not to the separately authorized unsigned beta.

## Individual publisher signing decision

The release owner has chosen to publish as an individual resident in mainland China, not a company, and declined the proposed paid signing budget. Signing procurement is deferred; the research below is retained for a future decision. No account, purchase or identity-verification submission is authorized.

Official documentation checked on 2026-09-16 establishes the following options:

- [Microsoft Artifact Signing](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart) currently limits Public Trust individual onboarding to the United States and Canada. The location of an Azure resource is not a substitute for eligible applicant residency.
- [SSL.com](https://www.ssl.com/products/software-integrity/code-signing/) offers IV certificates for individuals, with the verified individual name displayed and an eSigner cloud-signing option. Regional eligibility and the complete certificate plus signing-service cost must be confirmed before purchase.
- [Certum Standard Code Signing](https://www.certum.eu/en/code-signing-certificates/) supports individual names and a cloud option. Applicant eligibility and the chosen plan's automation requirements must be confirmed before purchase; it is not yet an integrated project provider.

For this applicant, Microsoft Artifact Signing is excluded by its current individual residency requirement. The proposed first enquiry is SSL.com IV plus eSigner because the [IV product](https://www.ssl.com/products/software-integrity/code-signing/iv/) explicitly supports individuals and CI signing. This is a recommendation to verify eligibility, not a confirmed issuance offer or an approved purchase. Its [general CSR country list](https://secure.ssl.com/csrs/country_codes) includes China, but that list alone does not establish acceptance of a particular mainland-China identity document for this product.

Budget snapshot: the one-year IV product is listed at USD 129; the [eSigner IV/OV Tier 1 annual subscription](https://www.ssl.com/guide/esigner-pricing-for-code-signing/) is USD 180 with 240 signings. Their advertised annual sum is USD 309 before taxes, payment charges and excess usage. The certificate fee alone does not include cloud signing. Use the current checkout and a confirmed quote before approving payment. No assurance that this allowance covers all intended release builds has been made.

Pre-purchase enquiry draft (not sent):

> I am an individual software developer resident in mainland China with no registered company. I plan to distribute a Windows x64 Electron application under my verified personal name. Can you currently issue an IV Code Signing certificate to me and enable eSigner for GitHub Actions automation? Please confirm accepted mainland-China identity and address documents, any translation or callback requirements, how my name will appear in the certificate, and the complete first-year and renewal pricing for a one-year IV certificate plus eSigner IV/OV Tier 1. Please also confirm how signing operations are counted and the refund terms if identity validation cannot be completed.

After eligibility and budget approval, integrate the selected cloud signer into electron-builder's signing phase, then verify the actual executable and installer signatures and signed-byte update metadata. Identity documents and live identity checks belong in the provider's official flow, not this repository or chat.

Correction to the initial PFX-only preparation: modern public-trust signing cannot assume an exportable private key. [DigiCert's storage requirements](https://knowledge.digicert.com/general-information/export-a-code-signing-certificate-as-a-pfx-file) and [SSL.com's guidance](https://www.ssl.com/how-to/using-your-code-signing-certificate/) explain the token/HSM/cloud requirement and the inability to export newly issued signing keys as a PFX. The current workflow is therefore an unintegrated signing scaffold for this applicant, not a ready-to-run cloud signing solution. Select the provider, adapt the build-time signer, then retain signature/timestamp validation and regenerate update metadata from the signed bytes. Do not bypass the gate with a self-signed certificate.

## Current PFX scaffold secrets (not the selected production solution)

The existing workflow expects both secrets below. Do not buy a certificate assuming it can supply these files; the selected provider's integration must replace this path when its private key is non-exportable.

- `WIN_CSC_LINK`: the Windows publisher PFX supplied as base64, a file path, or a URL accepted by electron-builder.
- `WIN_CSC_KEY_PASSWORD`: the PFX password.

The workflow fails before dependency installation when either secret is absent. During packaging, `forceCodeSigning` is enabled. The workflow then requires `Get-AuthenticodeSignature` to report `Valid` for both the NSIS installer and the unpacked application executable, requires a timestamp certificate on both signatures, and requires both signatures to use the same publisher certificate. There is no unsigned release fallback and no certificate subject is hard-coded in the repository.

## Candidate contents

The uploaded `xingchao-navigation-<version>-windows-x64-signed-candidate` artifact contains:

- the GitHub-safe installer name referenced by `latest.yml`;
- its differential-update blockmap;
- `latest.yml` for the stable channel;
- `SHA256SUMS.txt` covering every staged file;
- `SIGNING-STATUS.txt` generated only after Authenticode verification succeeds;
- release-size metadata; and
- the project license, notice, third-party notice, and trademark files.

The local electron-builder output uses the product name (`星潮航局-<version>-Setup.exe`). GitHub only accepts a restricted asset-name character set, so electron-builder writes a safe ASCII asset name into `latest.yml`. Candidate staging renames the verified installer and blockmap to that exact update asset name.

Before upload, the workflow runs `scripts/windows-packaged-smoke.ts` directly on the Windows runner. The probe launches the packaged ASAR with an isolated `--user-data-dir`, verifies the first-run UI and Add Model dialog, restarts the app, and verifies profile-marker preservation. It deliberately does not configure a model or call a real provider.

## Stable and beta update behavior

Packaged clients read updates from GitHub repository `Shun1989/xingchao-agent`. Stable clients select GitHub production releases and `latest.yml`. Beta clients allow GitHub prereleases and select `beta.yml`. Switching channels never enables downgrade installation.

This workflow builds only a stable `X.Y.Z` candidate. It does not impose macOS or Linux release acceptance. A future beta release must use a prerelease version such as `X.Y.Z-beta.N`, publish it as a GitHub prerelease, and include the matching `beta.yml` and referenced assets.

## Promotion gates

The Actions artifact is a candidate, not a public release. Passing its packaged smoke test is necessary but does not complete release acceptance. Before manual promotion, the release owner must complete all of the following outside this workflow:

1. Install, upgrade, and uninstall the signed NSIS candidate on supported clean Windows x64 machines. The workflow smoke launches `win-unpacked` and does not exercise installer lifecycle behavior.
2. Complete real-provider task acceptance using the release configuration. The packaged smoke intentionally makes no provider calls.
3. Review the transitive binary and dependency notices for the exact shipped candidate; bundled notice presence is not a legal-content review.
4. Recheck Authenticode publisher identity, timestamp, and `SHA256SUMS.txt` against the approved publisher certificate and downloaded candidate.
5. Create the reviewed `v<version>` GitHub production release and upload the candidate files without renaming or editing them.
6. Verify live GitHub updater behavior from a previously installed build: stable discovery, download, installation, beta selection, and downgrade refusal.

The signed stable release remains blocked while any gate above is incomplete. In particular, unavailable signing credentials, incomplete real-provider acceptance, an unverified installer lifecycle, unverified live updater behavior, or an incomplete transitive-notices review cannot be replaced by a successful build artifact. Do not label an unsigned beta as signed stable or claim an Actions artifact is a public release.
