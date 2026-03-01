import { useState, useCallback } from "react";
import CodeEditor from "@/components/ide/CodeEditor";
import Sidebar from "@/components/ide/Sidebar";
import TopBar from "@/components/ide/TopBar";
import OutputPanel from "@/components/ide/OutputPanel";
import HtmlPreview from "@/components/ide/HtmlPreview";
import { getLanguageById } from "@/lib/languages";

const Index = () => {
  const [activeLanguageId, setActiveLanguageId] = useState("python");
  const [codes, setCodes] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    return initial;
  });
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const activeLanguage = getLanguageById(activeLanguageId);
  const currentCode = codes[activeLanguageId] ?? activeLanguage.defaultCode;

  const handleCodeChange = useCallback(
    (value: string) => {
      setCodes((prev) => ({ ...prev, [activeLanguageId]: value }));
    },
    [activeLanguageId]
  );

  const handleLanguageChange = useCallback((id: string) => {
    setActiveLanguageId(id);
  }, []);

  const handleRun = useCallback(async () => {
    setIsRunning(true);
    setOutput([`>>> Running ${activeLanguage.label}...`, ""]);

    // Simulate execution delay
    await new Promise((r) => setTimeout(r, 600));

    if (activeLanguageId === "javascript" || activeLanguageId === "typescript") {
      try {
        const logs: string[] = [];
        const mockConsole = {
          log: (...args: any[]) => logs.push(args.map(String).join(" ")),
          error: (...args: any[]) => logs.push("❌ " + args.map(String).join(" ")),
          warn: (...args: any[]) => logs.push("⚠ " + args.map(String).join(" ")),
        };
        const fn = new Function("console", currentCode);
        fn(mockConsole);
        setOutput((prev) => [
          ...prev,
          ...logs,
          "",
          "✅ Execution completed successfully.",
        ]);
      } catch (err: any) {
        setOutput((prev) => [
          ...prev,
          `Error: ${err.message}`,
          "",
          "❌ Execution failed.",
        ]);
      }
    } else if (activeLanguageId === "html") {
      setOutput((prev) => [
        ...prev,
        "✅ HTML rendered in preview panel.",
      ]);
    } else {
      // Simulate output for non-JS languages
      const simulatedOutputs: Record<string, string[]> = {
        python: [
          "Hello, Engineer! Welcome to Zuup Code 🚀",
          "1 squared = 1",
          "2 squared = 4",
          "3 squared = 9",
          "4 squared = 16",
          "5 squared = 25",
        ],
        c: [
          "Zuup Code initialized!",
          "LED on pin 13 ready.",
          "Blink!",
          "Blink!",
          "Blink!",
        ],
        java: [
          "Hello from Zuup Code! 🚀",
          "1 squared = 1",
          "2 squared = 4",
          "3 squared = 9",
          "4 squared = 16",
          "5 squared = 25",
        ],
        cpp: [
          "Hello from Zuup Code! 🚀",
          "Skill: Arduino",
          "Skill: Embedded C",
          "Skill: PCB Design",
        ],
        rust: [
          "Hello from Zuup Code! 🚀",
          "1. Embedded Systems",
          "2. Hardware",
          "3. IoT",
        ],
        css: ["✅ CSS parsed successfully. No errors found."],
      };

      const simulated = simulatedOutputs[activeLanguageId] || [
        "✅ Code compiled successfully.",
      ];
      setOutput((prev) => [
        ...prev,
        ...simulated,
        "",
        "✅ Execution completed (simulated).",
        "⚠ Note: Connect a backend for real execution.",
      ]);
    }

    setIsRunning(false);
  }, [activeLanguageId, activeLanguage, currentCode]);

  const handleClearOutput = useCallback(() => {
    setOutput([]);
  }, []);

  const showHtmlPreview = activeLanguageId === "html";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      {/* Top Bar */}
      <TopBar
        activeLanguage={activeLanguage}
        onRun={handleRun}
        onLanguageChange={handleLanguageChange}
        isRunning={isRunning}
      />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          activeLanguage={activeLanguageId}
          onSelectLanguage={handleLanguageChange}
        />

        {/* Editor + Output */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Editor area */}
          <div className="flex-1 overflow-hidden">
            <CodeEditor
              language={activeLanguage.monacoId}
              value={currentCode}
              onChange={handleCodeChange}
            />
          </div>

          {/* Output / Preview */}
          <div className="h-56 shrink-0">
            {showHtmlPreview ? (
              <HtmlPreview code={currentCode} />
            ) : (
              <OutputPanel
                output={output}
                onClear={handleClearOutput}
                isRunning={isRunning}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
