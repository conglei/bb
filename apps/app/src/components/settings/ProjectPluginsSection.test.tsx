// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectPluginEntry } from "@bb/server-contract";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { sdk } from "@/lib/sdk";
import { ProjectPluginsSection } from "./ProjectPluginsSection";

vi.mock("@/lib/sdk", () => ({
  sdk: {
    projects: {
      plugins: { list: vi.fn(), set: vi.fn() },
    },
  },
}));

vi.mock("@/lib/ws", () => ({
  wsManager: { subscribe: vi.fn(), unsubscribe: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function kept(overrides: Partial<ProjectPluginEntry>): ProjectPluginEntry {
  return {
    pluginId: "kept",
    name: "Kept",
    icon: null,
    enabled: false,
    source: "default",
    hasProjectSettings: false,
    scope: "single",
    ownerProjectId: null,
    ownerProjectName: null,
    ...overrides,
  };
}

async function renderSection(entries: ProjectPluginEntry[]) {
  vi.mocked(sdk.projects.plugins.list).mockResolvedValue(entries);
  vi.mocked(sdk.projects.plugins.set).mockResolvedValue(entries);
  const { wrapper } = createQueryClientTestHarness();
  render(<ProjectPluginsSection projectId="proj_a" />, { wrapper });
  await screen.findByTestId("project-plugin-row");
}

describe("ProjectPluginsSection single-scope plugins", () => {
  it("shows the owner-here state with a switch that turns the plugin off", async () => {
    await renderSection([
      kept({
        enabled: true,
        source: "project",
        ownerProjectId: "proj_a",
        ownerProjectName: "Alpha",
      }),
    ]);

    expect(screen.getByText("on in this project")).toBeDefined();
    const toggle = screen.getByRole("switch", {
      name: "Use Kept in this project",
    });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() =>
      expect(sdk.projects.plugins.set).toHaveBeenCalledWith({
        projectId: "proj_a",
        pluginId: "kept",
        enabled: null,
      }),
    );
    expect(screen.queryByRole("button", { name: "Move here" })).toBeNull();
  });

  it("names the current owner and moves the plugin here", async () => {
    await renderSection([
      kept({ ownerProjectId: "proj_b", ownerProjectName: "Beta" }),
    ]);

    expect(screen.getByText("On in project Beta")).toBeDefined();
    expect(screen.queryByRole("switch")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Move here" }));
    await waitFor(() =>
      expect(sdk.projects.plugins.set).toHaveBeenCalledWith({
        projectId: "proj_a",
        pluginId: "kept",
        enabled: true,
      }),
    );
  });

  it("falls back to the owner id when its name is unknown", async () => {
    await renderSection([kept({ ownerProjectId: "proj_b" })]);
    expect(screen.getByText("On in project proj_b")).toBeDefined();
  });

  it("offers to turn on a plugin that is off everywhere", async () => {
    await renderSection([kept({})]);

    expect(screen.getByText("Off everywhere")).toBeDefined();
    expect(screen.queryByRole("switch")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Turn on here" }));
    await waitFor(() =>
      expect(sdk.projects.plugins.set).toHaveBeenCalledWith({
        projectId: "proj_a",
        pluginId: "kept",
        enabled: true,
      }),
    );
  });

  it("keeps the plain switch and reset for any-scope plugins", async () => {
    await renderSection([
      kept({
        pluginId: "git",
        name: "Git",
        enabled: false,
        source: "project",
        scope: "any",
      }),
    ]);

    expect(screen.getByText("project override")).toBeDefined();
    fireEvent.click(
      screen.getByRole("switch", { name: "Use Git in this project" }),
    );
    await waitFor(() =>
      expect(sdk.projects.plugins.set).toHaveBeenCalledWith({
        projectId: "proj_a",
        pluginId: "git",
        enabled: true,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    await waitFor(() =>
      expect(sdk.projects.plugins.set).toHaveBeenLastCalledWith({
        projectId: "proj_a",
        pluginId: "git",
        enabled: null,
      }),
    );
  });
});
