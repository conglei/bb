// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sdk } from "@/lib/sdk";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { makeProjectResponse } from "@/test/fixtures/projects";
import {
  filterProjectIconChoices,
  ProjectIconPicker,
} from "./ProjectIconPicker";

vi.mock("@/lib/sdk", () => ({
  sdk: {
    projects: {
      update: vi.fn(),
    },
  },
}));

function renderPicker(icon: string | null) {
  const { wrapper } = createQueryClientTestHarness();
  return render(<ProjectIconPicker projectId="proj_kept" icon={icon} />, {
    wrapper,
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProjectIconPicker", () => {
  it("saves the chosen icon through the project update mutation", async () => {
    vi.mocked(sdk.projects.update).mockResolvedValue(
      makeProjectResponse({ id: "proj_kept", icon: "Beaker" }),
    );
    renderPicker(null);

    const trigger = screen.getByRole("button", { name: "Change project icon" });
    expect(trigger.querySelector('[data-icon="FolderGit"]')).not.toBeNull();
    fireEvent.click(trigger);

    fireEvent.change(await screen.findByPlaceholderText("Search icons"), {
      target: { value: "beak" },
    });
    fireEvent.click(await screen.findByRole("option", { name: "Beaker" }));

    await waitFor(() =>
      expect(sdk.projects.update).toHaveBeenCalledWith({
        projectId: "proj_kept",
        icon: "Beaker",
      }),
    );
  });

  it("clears the icon from the No icon entry and skips a no-op pick", async () => {
    vi.mocked(sdk.projects.update).mockResolvedValue(
      makeProjectResponse({ id: "proj_kept", icon: null }),
    );
    renderPicker("Beaker");

    const trigger = screen.getByRole("button", { name: "Change project icon" });
    expect(trigger.querySelector('[data-icon="Beaker"]')).not.toBeNull();
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("option", { name: "Beaker" }));
    expect(sdk.projects.update).not.toHaveBeenCalled();

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByTestId("project-icon-none"));
    await waitFor(() =>
      expect(sdk.projects.update).toHaveBeenCalledWith({
        projectId: "proj_kept",
        icon: null,
      }),
    );
  });

  it("falls back to the folder glyph for an unknown icon name", () => {
    renderPicker("NotARealIcon");
    const trigger = screen.getByRole("button", { name: "Change project icon" });
    expect(trigger.querySelector('[data-icon="FolderGit"]')).not.toBeNull();
  });
});

describe("filterProjectIconChoices", () => {
  it("matches case-insensitively on a substring and returns all for blank", () => {
    const choices = ["Beaker", "FolderGit", "GitBranch"];
    expect(filterProjectIconChoices("git", choices)).toEqual([
      "FolderGit",
      "GitBranch",
    ]);
    expect(filterProjectIconChoices("  ", choices)).toEqual(choices);
    expect(filterProjectIconChoices("zzz", choices)).toEqual([]);
  });
});
