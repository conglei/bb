import { describe, expect, it } from "vitest";
import type { ProjectPluginEntry } from "@bb/server-contract";
import {
  buildProjectUpdateRequest,
  formatProjectIcon,
  formatProjectPluginOwner,
  formatProjectPluginStateLine,
} from "./project.js";

function entry(overrides: Partial<ProjectPluginEntry>): ProjectPluginEntry {
  return {
    pluginId: "kept",
    name: "Kept",
    icon: null,
    enabled: false,
    source: "default",
    hasProjectSettings: false,
    scope: "any",
    ownerProjectId: null,
    ownerProjectName: null,
    ...overrides,
  };
}

describe("project plugins output", () => {
  it("shows an owner only for single-scope plugins", () => {
    expect(formatProjectPluginOwner(entry({}))).toBe("-");
    expect(formatProjectPluginOwner(entry({ scope: "single" }))).toBe("none");
    expect(
      formatProjectPluginOwner(
        entry({
          scope: "single",
          ownerProjectId: "proj_b",
          ownerProjectName: "Beta",
        }),
      ),
    ).toBe("Beta (proj_b)");
    expect(
      formatProjectPluginOwner(
        entry({ scope: "single", ownerProjectId: "proj_b" }),
      ),
    ).toBe("proj_b");
  });

  it("reports a move from the previous owner when enabling a single-scope plugin", () => {
    const moved = formatProjectPluginStateLine({
      projectId: "proj_a",
      pluginId: "kept",
      entry: entry({
        enabled: true,
        source: "project",
        scope: "single",
        ownerProjectId: "proj_a",
        ownerProjectName: "Alpha",
      }),
      previousOwner: { projectId: "proj_b", name: "Beta" },
    });
    expect(moved).toBe(
      "Plugin kept is on for project proj_a (project override); moved from project Beta (proj_b), where it is now off",
    );

    const first = formatProjectPluginStateLine({
      projectId: "proj_a",
      pluginId: "kept",
      entry: entry({
        enabled: true,
        source: "project",
        scope: "single",
        ownerProjectId: "proj_a",
      }),
      previousOwner: null,
    });
    expect(first).toBe(
      "Plugin kept is on for project proj_a (project override); this project owns it and it is off everywhere else",
    );
  });

  it("names the owner when a single-scope plugin is off here and keeps the plain line for any-scope plugins", () => {
    expect(
      formatProjectPluginStateLine({
        projectId: "proj_a",
        pluginId: "kept",
        entry: entry({
          scope: "single",
          ownerProjectId: "proj_b",
          ownerProjectName: "Beta",
        }),
        previousOwner: null,
      }),
    ).toBe(
      "Plugin kept is off for project proj_a (plugin default); owner: Beta (proj_b)",
    );
    expect(
      formatProjectPluginStateLine({
        projectId: "proj_a",
        pluginId: "git",
        entry: entry({ pluginId: "git", enabled: true }),
        previousOwner: null,
      }),
    ).toBe("Plugin git is on for project proj_a (plugin default)");
    expect(
      formatProjectPluginStateLine({
        projectId: "proj_a",
        pluginId: "git",
        entry: undefined,
        previousOwner: null,
      }),
    ).toBe("Plugin git override cleared for project proj_a");
  });
});

describe("project update flags", () => {
  it("maps --name, --icon, and --clear-icon onto the update request", () => {
    expect(buildProjectUpdateRequest({ name: "Kept" })).toEqual({
      name: "Kept",
    });
    expect(buildProjectUpdateRequest({ icon: "Beaker" })).toEqual({
      icon: "Beaker",
    });
    expect(buildProjectUpdateRequest({ clearIcon: true })).toEqual({
      icon: null,
    });
    expect(
      buildProjectUpdateRequest({ name: "Kept", clearIcon: true }),
    ).toEqual({ name: "Kept", icon: null });
  });

  it("refuses an empty update and conflicting icon flags", () => {
    expect(() => buildProjectUpdateRequest({})).toThrow(/No changes requested/);
    expect(() =>
      buildProjectUpdateRequest({ icon: "Beaker", clearIcon: true }),
    ).toThrow(/either --icon or --clear-icon/);
  });

  it("prints the default marker when no icon is set", () => {
    expect(formatProjectIcon(null)).toBe("default");
    expect(formatProjectIcon("Beaker")).toBe("Beaker");
  });
});
