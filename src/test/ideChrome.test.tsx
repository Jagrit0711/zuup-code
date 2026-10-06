import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import FileTabs from "@/components/ide/FileTabs";
import StatusBar from "@/components/ide/StatusBar";
import TopBar from "@/components/ide/TopBar";
import EditorEmptyState from "@/components/ide/EditorEmptyState";
import { getLanguageById } from "@/lib/languages";
import type { FileTab } from "@/lib/fileSystem";

const files: FileTab[] = [
  { id: "a", name: "src/main.py", languageId: "python", content: "", isDirty: false },
  { id: "b", name: "index.html", languageId: "html", content: "", isDirty: true },
  { id: "c", name: "notes.md", languageId: "markdown", content: "", isDirty: false },
];

describe("FileTabs", () => {
  it("shows base names, marks the active tab and moves with the arrow keys", () => {
    const onSelect = vi.fn();
    render(<FileTabs files={files} activeFileId="a" onSelectFile={onSelect} onCloseFile={vi.fn()} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["main.py", "index.html", "notes.md"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(onSelect).toHaveBeenCalledWith("b");
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("closes on middle click, Delete and the close button", () => {
    const onClose = vi.fn();
    render(<FileTabs files={files} activeFileId="a" onSelectFile={vi.fn()} onCloseFile={onClose} />);
    const tabs = screen.getAllByRole("tab");
    fireEvent(tabs[1], new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    fireEvent.keyDown(tabs[0], { key: "Delete" });
    fireEvent.click(screen.getByRole("button", { name: "Close notes.md" }));
    expect(onClose.mock.calls.map((c) => c[0])).toEqual(["b", "a", "c"]);
  });
});

describe("StatusBar", () => {
  const base = {
    cursorPosition: { line: 3, col: 7 },
    tabSize: 4,
    languageLabel: "Python",
    isCloudProject: false,
    isSaving: false,
    hasUnsavedChanges: false,
  };

  it("uses plain text segments", () => {
    render(<StatusBar {...base} />);
    expect(screen.getByText("Ln 3, Col 7")).toBeInTheDocument();
    expect(screen.getByText("Spaces: 4")).toBeInTheDocument();
    expect(screen.getByText("Saved in this browser")).toBeInTheDocument();
    expect(screen.queryByText(/problems/i)).not.toBeInTheDocument();
  });

  it("colours problems by severity", () => {
    render(<StatusBar {...base} problems={{ errors: 2, warnings: 1 }} />);
    expect(screen.getByText("2 errors, 1 warning")).toHaveClass("text-danger");
  });
});

describe("TopBar", () => {
  const props = {
    activeLanguage: getLanguageById("python"),
    activeFileName: "main.py",
    projectName: "Physics lab",
    onRun: vi.fn(),
    onSave: vi.fn(),
    onDownload: vi.fn(),
    onShare: vi.fn(),
    onNewFile: vi.fn(),
    onNewProject: vi.fn(),
    onLanguageChange: vi.fn(),
    isRunning: false,
  };
  const renderBar = (extra: Partial<React.ComponentProps<typeof TopBar>> = {}) =>
    render(
      <MemoryRouter>
        <TooltipProvider>
          <TopBar {...props} {...extra} />
        </TooltipProvider>
      </MemoryRouter>,
    );

  it("runs the file", () => {
    const onRun = vi.fn();
    renderBar({ onRun });
    fireEvent.click(screen.getByRole("button", { name: /^Run$/ }));
    expect(onRun).toHaveBeenCalled();
  });

  it("turns Run into Stop while running when a stop handler exists", () => {
    const onStop = vi.fn();
    renderBar({ isRunning: true, onStop });
    fireEvent.click(screen.getByRole("button", { name: /Stop/ }));
    expect(onStop).toHaveBeenCalled();
  });

  it("renames the project in place", () => {
    const onRenameProject = vi.fn();
    renderBar({ onRenameProject });
    fireEvent.click(screen.getByRole("button", { name: "Physics lab" }));
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "Optics lab" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRenameProject).toHaveBeenCalledWith("Optics lab");
  });
});

describe("EditorEmptyState", () => {
  it("offers a new file, uploads and language shortcuts as plain links", () => {
    const onCreate = vi.fn();
    render(
      <EditorEmptyState variant="no-files" onNewFile={vi.fn()} onNewProject={vi.fn()} onCreateWithLanguage={onCreate} onUploadFiles={vi.fn()} />,
    );
    expect(screen.getByRole("heading", { name: "Start with a blank file" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Python/ }));
    expect(onCreate).toHaveBeenCalledWith("python");
    expect(screen.getByRole("button", { name: /Show all \d+ languages/ })).toBeInTheDocument();
  });
});
