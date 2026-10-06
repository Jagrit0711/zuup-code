import type { ReactNode } from "react";

interface StatusBarProps {
  cursorPosition: { line: number; col: number };
  tabSize: number;
  languageLabel: string;
  isCloudProject: boolean;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  onLanguageClick?: () => void;
  /** GitHub sync indicator (repository, branch and status). */
  githubStatus?: ReactNode;
  /** Problems in the active file. Hidden when omitted. */
  problems?: { errors: number; warnings: number };
  /** Opens the problems list. */
  onProblemsClick?: () => void;
  /** Indentation style; defaults to spaces. */
  insertSpaces?: boolean;
  /** Whether the code runner is executing a program. */
  isRunning?: boolean;
  /** Name of the code runner, shown on the right. */
  runnerName?: string;
}

const segment =
  "inline-flex h-full items-center px-2 transition-colors duration-150 hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary";
const plain = "inline-flex h-full items-center px-2";

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const StatusBar = ({
  cursorPosition,
  tabSize,
  languageLabel,
  isCloudProject,
  isSaving,
  hasUnsavedChanges,
  onLanguageClick,
  githubStatus,
  problems,
  onProblemsClick,
  insertSpaces = true,
  isRunning = false,
  runnerName = "Piston",
}: StatusBarProps) => {
  const errors = problems?.errors ?? 0;
  const warnings = problems?.warnings ?? 0;
  const problemsText =
    errors === 0 && warnings === 0
      ? "No problems"
      : [errors ? plural(errors, "error") : null, warnings ? plural(warnings, "warning") : null].filter(Boolean).join(", ");
  const problemsTone = errors ? "text-danger" : warnings ? "text-warning" : "";

  const saveText = isSaving
    ? "Saving"
    : hasUnsavedChanges
      ? "Unsaved changes"
      : isCloudProject
        ? "Saved to your account"
        : "Saved in this browser";

  const ProblemsTag = onProblemsClick ? "button" : "span";

  return (
    <footer
      aria-label="Status"
      className="z-20 flex h-6 w-full min-w-0 shrink-0 select-none items-stretch justify-between gap-2 overflow-hidden whitespace-nowrap border-t border-rule bg-panel px-1 text-[12px] text-muted-foreground"
    >
      <div className="flex min-w-0 items-stretch overflow-hidden">
        {githubStatus && <div className="flex min-w-0 shrink items-stretch [&>*]:px-2">{githubStatus}</div>}
        <span className={`${plain} min-w-0 ${hasUnsavedChanges && !isSaving ? "text-warning" : ""}`} aria-live="polite">
          <span className="truncate">{saveText}</span>
        </span>
        {problems && (
          <ProblemsTag
          {...(onProblemsClick ? { type: "button" as const, onClick: onProblemsClick } : {})}
          className={`hidden sm:inline-flex ${onProblemsClick ? segment : plain} ${problemsTone}`}
        >
          {problemsText}
          </ProblemsTag>
        )}
      </div>

      <div className="flex shrink-0 items-stretch">
        <span className={plain}>
          Ln {cursorPosition.line}, Col {cursorPosition.col}
        </span>
        <span className={`hidden sm:inline-flex ${plain}`}>
          {insertSpaces ? "Spaces" : "Tab size"}: {tabSize}
        </span>
        <span className={`hidden md:inline-flex ${plain}`}>UTF-8</span>
        {onLanguageClick ? (
          <button type="button" onClick={onLanguageClick} className={`${segment} text-foreground`} title="Change language settings">
            {languageLabel}
          </button>
        ) : (
          <span className={`${plain} text-foreground`}>{languageLabel}</span>
        )}
        <span className={`hidden lg:inline-flex ${plain} gap-1.5`} title={`Programs run on the ${runnerName} code runner`}>
          {isRunning ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-warning motion-safe:animate-pulse" aria-hidden="true" />
              <span className="text-foreground">Running on {runnerName}</span>
            </>
          ) : (
            <>{runnerName} ready</>
          )}
        </span>
      </div>
    </footer>
  );
};

export default StatusBar;
