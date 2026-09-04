import { describe, expect, it } from "vitest"
import { resolveCaptainWorkspaceLayout } from "./captain-layout.ts"

describe("resolveCaptainWorkspaceLayout", () => {
  it.each([
    [{ route: "fleet", viewportWidth: 1440 }, ["stage", "stage", 360, 560, true, false]],
    [{ route: "voyage", viewportWidth: 1280 }, ["stage", "stage", 360, 560, true, false]],
    [{ route: "chat", viewportWidth: 1440, chatIsEmpty: true }, ["stage", "stage", 360, 560, true, false]],
    [{ route: "chat", viewportWidth: 1440, chatIsEmpty: false }, ["deck", "companion", 240, 300, false, true]],
    [{ route: "skills", viewportWidth: 1440 }, ["deck", "companion", 240, 300, false, true]],
    [{ route: "settings", viewportWidth: 1920 }, ["compact", "compact", 0, 72, false, false]],
    [{ route: "fleet", viewportWidth: 1279 }, ["compact", "compact", 0, 72, false, false]],
  ] as const)("resolves %o", (input, expected) => {
    const result = resolveCaptainWorkspaceLayout({
      activeProject: false,
      activeSessionId: null,
      activeTask: false,
      chatIsEmpty: false,
      modalOpen: false,
      ...input,
    })
    expect([
      result.workspaceMode,
      result.displayMode,
      result.minWidth,
      result.maxWidth,
      result.integrated,
      result.reservesContent,
    ]).toEqual(expected)
  })

  it.each([
    ["fleet", 1279, "compact"],
    ["fleet", 1280, "stage"],
    ["skills", 1179, "compact"],
    ["skills", 1180, "deck"],
  ] as const)("keeps the %s boundary deterministic at %i px", (route, viewportWidth, workspaceMode) => {
    expect(
      resolveCaptainWorkspaceLayout({
        activeProject: false,
        activeSessionId: null,
        activeTask: false,
        chatIsEmpty: false,
        modalOpen: false,
        route,
        viewportWidth,
      }).workspaceMode,
    ).toBe(workspaceMode)
  })

  it("downgrades modal and active chat contexts without leaking route policy to renderers", () => {
    expect(
      resolveCaptainWorkspaceLayout({
        activeProject: false,
        activeSessionId: null,
        activeTask: false,
        chatIsEmpty: true,
        modalOpen: true,
        route: "fleet",
        viewportWidth: 1440,
      }).workspaceMode,
    ).toBe("compact")
    expect(
      resolveCaptainWorkspaceLayout({
        activeProject: true,
        activeSessionId: "project-session",
        activeTask: false,
        chatIsEmpty: true,
        modalOpen: false,
        route: "chat",
        viewportWidth: 1440,
      }).workspaceMode,
    ).toBe("deck")
  })
})
