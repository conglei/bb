// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExperimentalCodeFenceRendererProps } from "@get-bb/plugin-sdk";
import { MemoryRouter } from "react-router-dom";
import { RouteNavigationProvider } from "@/components/ui/app-route-anchor";
import { resetAllCrashedPluginSlotsForTest } from "@/components/plugin/PluginSlotMount";
import {
  resetPluginSlotStoreForTest,
  setPluginSlotRegistrations,
} from "@/lib/plugin-slots";
import { makePluginRegistrationSet } from "@/test/fixtures/plugins";
import { PluginMarkdown } from "./PluginMarkdown";

vi.mock("@/lib/app-navigation-host", () => ({
  useAppNavigationHost: () => ({
    openUrl: () => true,
    openFilePreview: () => {},
  }),
}));

function UiFence(props: ExperimentalCodeFenceRendererProps) {
  return (
    <div
      data-testid="ui-fence"
      data-code={props.code}
      data-status={props.status}
      data-message-id={props.message.id}
      data-thread-id={props.message.threadId}
      data-project-id={props.message.projectId ?? ""}
    />
  );
}

const CONTENT = ["Before", "", "```ui", "Card()", "```", "", "After"].join(
  "\n",
);

function registerUiFence() {
  setPluginSlotRegistrations(
    "genui",
    makePluginRegistrationSet({
      codeFenceRenderers: [
        { id: "genui", languages: ["ui"], component: UiFence },
      ],
    }),
  );
}

function mount(props: Partial<Parameters<typeof PluginMarkdown>[0]> = {}) {
  return render(
    <MemoryRouter>
      <RouteNavigationProvider>
        <PluginMarkdown content={CONTENT} {...props} />
      </RouteNavigationProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  resetAllCrashedPluginSlotsForTest();
  resetPluginSlotStoreForTest();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("PluginMarkdown code fences", () => {
  it("mounts registered fence renderers under the given identity", () => {
    registerUiFence();
    const view = mount({
      experimental_codeFences: {
        id: "brf_1",
        threadId: "thr_1",
        projectId: "proj_1",
      },
    });

    const fence = screen.getByTestId("ui-fence");
    expect(fence.getAttribute("data-code")).toBe("Card()");
    expect(fence.getAttribute("data-status")).toBe("closed");
    expect(fence.getAttribute("data-message-id")).toBe("brf_1");
    expect(fence.getAttribute("data-thread-id")).toBe("thr_1");
    expect(fence.getAttribute("data-project-id")).toBe("proj_1");
    expect(view.container.textContent).toContain("Before");
    expect(view.container.textContent).toContain("After");
  });

  it("keeps bb's code block without an identity", () => {
    registerUiFence();
    const view = mount();

    expect(screen.queryByTestId("ui-fence")).toBeNull();
    expect(view.container.textContent).toContain("Card()");
  });

  it("keeps bb's code block when no plugin claims the language", () => {
    const view = mount({
      experimental_codeFences: { id: "brf_1", threadId: "thr_1" },
    });

    expect(screen.queryByTestId("ui-fence")).toBeNull();
    expect(view.container.textContent).toContain("Card()");
  });
});
