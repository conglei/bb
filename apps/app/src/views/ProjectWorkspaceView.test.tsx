// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExperimentalProjectViewProps } from "@get-bb/plugin-sdk";
import {
  resetPluginSlotStoreForTest,
  setPluginSlotRegistrations,
} from "@/lib/plugin-slots";
import {
  markPluginFrontendsSettled,
  resetPluginFrontendBootStateForTest,
} from "@/lib/plugin-frontend-boot-state";
import { PROJECT_VIEW_ROUTE_PATH } from "@/lib/route-paths";
import { resetAllCrashedPluginSlotsForTest } from "@/components/plugin/PluginSlotMount";
import { makePluginRegistrationSet } from "@/test/fixtures/plugins";
import { ProjectWorkspaceView } from "./ProjectWorkspaceView";

const sidebarNavigationMock = vi.hoisted(() => ({
  data: {
    sections: [],
    personalProject: {
      id: "proj_personal",
      name: "Personal",
      threads: [],
    },
    projects: [
      {
        id: "proj_kept",
        name: "Kept",
        threads: [
          {
            id: "thr_1",
            title: "Route the inbox",
            titleFallback: null,
            updatedAt: 2_000,
          },
          {
            id: "thr_2",
            title: null,
            titleFallback: "Older run",
            updatedAt: 1_000,
          },
        ],
      },
    ],
  } as unknown,
}));

vi.mock("@/hooks/queries/sidebar-navigation-query", () => ({
  useSidebarNavigation: () => ({ data: sidebarNavigationMock.data }),
}));

function RoutedProjectWorkspaceView() {
  const params = useParams<{ projectId: string; viewKey: string }>();
  return (
    <ProjectWorkspaceView
      projectId={params.projectId ?? ""}
      viewKey={params.viewKey ?? ""}
    />
  );
}

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route
          path={PROJECT_VIEW_ROUTE_PATH}
          element={<RoutedProjectWorkspaceView />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  resetPluginSlotStoreForTest();
  resetPluginFrontendBootStateForTest();
  resetAllCrashedPluginSlotsForTest();
});

describe("ProjectWorkspaceView", () => {
  it("shows the project name, the core Threads view first, and the project's threads", () => {
    renderAt("/projects/proj_kept/views/core.threads");

    expect(screen.getByTestId("project-workspace-title").textContent).toBe(
      "Kept",
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Threads"]);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    const titles = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.includes("/threads/"))
      .map((link) => link.textContent);
    expect(titles[0]).toContain("Route the inbox");
    expect(titles[1]).toContain("Older run");
  });

  it("lists plugin views as tabs and renders the active one with the project id", () => {
    function Today({ projectId, isCompactViewport }: ExperimentalProjectViewProps) {
      return (
        <output data-testid="today">
          {projectId}:{String(isCompactViewport)}
        </output>
      );
    }
    setPluginSlotRegistrations(
      "kept",
      makePluginRegistrationSet({
        projectViews: [
          { id: "today", title: "Today", icon: "Inbox", component: Today },
        ],
      }),
    );

    renderAt("/projects/proj_kept/views/kept.today");

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Threads", "Today"]);
    expect(tabs[0]?.getAttribute("href")).toBe(
      "/projects/proj_kept/views/core.threads",
    );
    expect(tabs[1]?.getAttribute("href")).toBe(
      "/projects/proj_kept/views/kept.today",
    );
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("today").textContent).toBe("proj_kept:false");
  });

  it("stays quiet for an unknown view until plugin frontends settle", () => {
    renderAt("/projects/proj_kept/views/ghost.inbox");

    expect(screen.queryByTestId("project-view-unavailable")).toBeNull();
    act(() => markPluginFrontendsSettled());
    expect(screen.getByTestId("project-view-unavailable")).toBeDefined();
    expect(screen.getAllByRole("tab")).toHaveLength(1);
  });

  it("isolates a crashing view behind the slot boundary", () => {
    function Broken(): never {
      throw new Error("boom");
    }
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    setPluginSlotRegistrations(
      "kept",
      makePluginRegistrationSet({
        projectViews: [
          { id: "today", title: "Today", icon: "Inbox", component: Broken },
        ],
      }),
    );

    renderAt("/projects/proj_kept/views/kept.today");

    expect(screen.getByText(/plugin kept crashed/)).toBeDefined();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });
});
