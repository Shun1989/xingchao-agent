import type { ManagedSkillGroup } from "./common.ts"

import assert from "node:assert/strict"
import path from "node:path"
import { test } from "vitest"
import { buildLocalMachineSkillDeletePlan } from "./delete-plan.ts"

test("buildLocalMachineSkillDeletePlan includes agent hosts and registry sources", () => {
  const home = path.resolve("home", "me")
  const agentRoot = path.join(home, ".agents", "skills")
  const claudeRoot = path.join(home, ".claude", "skills")
  const globalRegistryRoot = path.join(home, ".config", "oo", "skills", "registry")
  const wantaRegistryRoot = path.join(home, ".config", "wanta", "agent", "oo-store", "config", "skills", "registry")
  const group: ManagedSkillGroup = {
    externalHosts: [],
    hosts: [
      {
        agentId: "wanta",
        agentName: "Wanta",
        kind: "registry",
        packageName: "@oomol/example",
        path: path.join(agentRoot, "example"),
        scope: "runtime",
        sourcePath: path.join(wantaRegistryRoot, "example"),
        status: "installed",
        version: "1.0.0",
      },
      {
        agentId: "claude-code",
        agentName: "Claude Code",
        kind: "registry",
        packageName: "@oomol/example",
        path: path.join(claudeRoot, "example"),
        scope: "external",
        sourcePath: path.join(globalRegistryRoot, "example"),
        status: "installed",
        version: "1.0.0",
      },
    ],
    id: "example",
    kind: "registry",
    name: "example",
    packageName: "@oomol/example",
    runtimeHosts: [],
    version: "1.0.0",
  }

  const plan = buildLocalMachineSkillDeletePlan({
    agentSkillRoots: [agentRoot, claudeRoot],
    globalRegistrySkillRoot: globalRegistryRoot,
    group,
    wantaRegistrySkillRoot: wantaRegistryRoot,
  })

  assert.deepEqual(plan.storeTargets, [
    {
      kind: "wanta",
      packageName: "@oomol/example",
      skillId: "example",
    },
    {
      kind: "global",
      packageName: "@oomol/example",
      skillId: "example",
    },
  ])
  assert.deepEqual(
    plan.targets.map((target) => `${target.kind}:${path.normalize(target.path)}`).sort(),
    [
      `agent-host:${path.join(agentRoot, "example")}`,
      `agent-host:${path.join(claudeRoot, "example")}`,
      `global-registry-source:${path.join(globalRegistryRoot, "example")}`,
      `wanta-registry-source:${path.join(wantaRegistryRoot, "example")}`,
    ].sort(),
  )
})

test("buildLocalMachineSkillDeletePlan skips registry store work for local skills", () => {
  const home = path.resolve("home", "me")
  const codexRoot = path.join(home, ".codex", "skills")
  const localSkillPath = path.join(codexRoot, "local-skill")
  const group: ManagedSkillGroup = {
    externalHosts: [],
    hosts: [
      {
        agentId: "codex",
        agentName: "Codex",
        kind: "local",
        path: localSkillPath,
        scope: "external",
        status: "installed",
      },
    ],
    id: "local-skill",
    kind: "local",
    name: "local-skill",
    runtimeHosts: [],
  }

  const plan = buildLocalMachineSkillDeletePlan({
    agentSkillRoots: [codexRoot],
    globalRegistrySkillRoot: path.join(home, ".config", "oo", "skills", "registry"),
    group,
    wantaRegistrySkillRoot: path.join(home, ".config", "wanta", "agent", "oo-store", "config", "skills", "registry"),
  })

  assert.deepEqual(plan.storeTargets, [])
  assert.deepEqual(plan.targets, [
    {
      kind: "agent-host",
      path: localSkillPath,
    },
  ])
})
