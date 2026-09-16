# Third-Party Notices

Wanta incorporates and redistributes open-source components. The entries below document the key
runtime components that Wanta starts or places directly in a packaged application's resources.
They do not replace the license files shipped inside npm dependencies. A complete generated report
for all transitive build and runtime dependencies remains part of release preparation.

## OpenCode

Wanta uses [OpenCode](https://github.com/anomalyco/opencode) as its local Agent engine:

- `opencode-ai@1.18.10` — packaged executable and local `opencode serve` sidecar;
- `@opencode-ai/sdk@1.18.10` — HTTP/SSE client used by the Electron main process;
- `@opencode-ai/plugin@1.18.10` — tool API bundled into Wanta's Agent tool runtime.

License: MIT. Copyright (c) 2025 opencode.

Wanta is not a fork of OpenCode. It embeds the pinned OpenCode runtime and builds desktop lifecycle,
security isolation, model configuration, permissions, sessions, Connector tools, and artifact UI
around it.

## oo CLI and Bundled Skills

Wanta downloads and packages `@oomol-lab/oo-cli@1.7.1` platform binaries from the public npm
registry. The default package also contains four Skills exported by that distribution:

- `oo`;
- `oo-find-skills`;
- `oo-create-skill`;
- `oo-publish-skill`.

Source: [oomol-lab/oo-cli](https://github.com/oomol-lab/oo-cli). License: MIT.

The CLI and Skills are included by default so official OOMOL Connector and endpoint-compatible,
self-hosted OpenConnector deployments can use the same invocation path. Local BYOK mode does not
register Connector tools or inject the oo runtime environment.

## WeCom CLI and Skills

Wanta packages the official `@wecom/cli@0.1.9` platform binary and the matching `wecomcli-*`
Skills from source commit `72e14f7695f34d28f1ff23ea504ddd2210a87c13` for the local WeCom Direct
provider.

Source: [WecomTeam/wecom-cli](https://github.com/WecomTeam/wecom-cli). License: MIT. Copyright (c)
2026 WeCom.

## DingTalk Workspace CLI and Skills

Wanta packages the official DingTalk Workspace CLI (`dws`) version 1.0.55 and the matching stable
mono Skill from the same release for the local DingTalk Direct provider.

Source: [DingTalk-Real-AI/dingtalk-workspace-cli](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli).
License: Apache License 2.0; the complete license text is included in this repository's
[`LICENSE`](LICENSE) file. Copyright 2026 Alibaba Group.

The upstream platform archives include the following `NOTICE`, reproduced here as required:

```text
DingTalk Workspace CLI (dws)
Copyright 2026 Alibaba Group

This product includes software developed at
DingTalk (https://www.dingtalk.com/).
```

The CLI keeps account tokens encrypted through its platform credential backend. Wanta supplies
private configuration and ciphertext directories and exposes only redacted account and connection
state to the renderer.

## Lark CLI and Skills

The package includes Lark CLI 1.0.81 and its bundled Skills. The fixed upstream version's
[LICENSE](https://github.com/larksuite/cli/blob/v1.0.81/LICENSE) is MIT.
Copyright (c) 2026 Lark Technologies Pte. Ltd.

## ripgrep

The package includes ripgrep 14.1.1 (`rg.exe`). Upstream permits either Unlicense or MIT;
this distribution uses the [MIT option](https://github.com/BurntSushi/ripgrep/blob/14.1.1/LICENSE-MIT).
Copyright (c) 2015 Andrew Gallant.

## Bundled JavaScript License Files

The following code is compiled into application bundles, so its original npm package directory
may not be present in the installed application. Corresponding license files are retained under
the installed `resources/licenses/` directory:

- `khroma@2.1.0`: MIT, Copyright (c) 2019-present Fabio Spampinato, Andrew Maney;
  `khroma-LICENSE.txt`.
- `@univerjs/telemetry@0.25.1`: Apache-2.0, Copyright 2023-present DreamNum;
  `Univer-telemetry-LICENSE.txt`.
- `@anthropic-ai/claude-agent-sdk@0.3.226`: Anthropic PBC, all rights reserved;
  `Claude-Agent-SDK-LICENSE.txt` preserves its reference to
  [Anthropic's applicable agreements](https://code.claude.com/docs/en/legal-and-compliance).
  This component is not covered by this project's Apache-2.0 or the MIT notice below. Including
  the notice does not establish compliance with all applicable commercial terms.

These additions address identified omissions; they do not claim a completed inventory of all
transitive bundled code.

## MIT License Text

The following text applies to the OpenCode, oo CLI, WeCom CLI, Lark CLI and ripgrep entries above:

```text
MIT License

Copyright (c) 2025 opencode
Copyright (c) 2026 OOMOL Lab
Copyright (c) 2026 WeCom
Copyright (c) 2026 Lark Technologies Pte. Ltd.
Copyright (c) 2015 Andrew Gallant

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Each copyright line above applies to its corresponding component family.

## First-party IPC

Typed Electron IPC is implemented in `electron/ipc/` under this repository's Apache-2.0
license. The former `@oomol/connection@0.2.28` and
`@oomol/connection-electron-adapter@0.2.12` dependencies have been removed. The replacement
was implemented from the application's own contracts and tests, without consulting or copying
those packages' source or declarations. This does not grant permission to redistribute older
builds that still contain the removed packages.

## Other Dependencies and Assets

The repository also depends on Electron, React, Univer, wiki-graph, Streamdown, Iconify data, fonts,
and other direct and transitive packages under their respective licenses. Product names, service
logos, and trademarks are not licensed merely because an open-source package contains a reference
or icon. See [TRADEMARKS.md](TRADEMARKS.md).
