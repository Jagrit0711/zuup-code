import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TerminalPanel, { type PanelTab } from "@/components/ide/TerminalPanel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { __resetEditorSettingsStoreForTests, updateEditorSettings } from "@/lib/editorSettings";

function renderPanel(requestTab?: { tab: PanelTab; nonce: number }) {
  const ui = (tab?: { tab: PanelTab; nonce: number }) => (
    <TooltipProvider>
      <TerminalPanel onClear={vi.fn()} onCommand={vi.fn()} isRunning={false} requestTab={tab} />
    </TooltipProvider>
  );
  const utils = render(ui(requestTab));
  return { ...utils, rerenderWith: (tab: { tab: PanelTab; nonce: number }) => utils.rerender(ui(tab)) };
}

const selectedTab = () => screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true");

describe("TerminalPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetEditorSettingsStoreForTests();
  });
  afterEach(() => {
    __resetEditorSettingsStoreForTests();
  });

  it("switches tab when requestTab's nonce changes", () => {
    const { rerenderWith } = renderPanel();
    expect(selectedTab()?.textContent).toBe("Terminal");

    rerenderWith({ tab: "problems", nonce: 1 });
    expect(selectedTab()?.textContent).toContain("Problems");

    act(() => screen.getByRole("tab", { name: "Output" }).click());
    expect(selectedTab()?.textContent).toBe("Output");

    // Same request again with a new nonce switches back.
    rerenderWith({ tab: "problems", nonce: 2 });
    expect(selectedTab()?.textContent).toContain("Problems");
  });

  it("uses the saved terminal font size", () => {
    act(() => updateEditorSettings({ terminalFontSize: 16 }));
    renderPanel();
    expect(document.getElementById("panel-terminal")?.style.fontSize).toBe("16px");
  });
});
