"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "portfolio-optimizer-onboarding-done";

type Step = {
  title: string;
  description: string;
  target?: string;
  action?: string;
};

const STEPS: Step[] = [
  {
    title: "Hi! Let's plan your projects",
    description:
      "This tool figures out the best order to do your work. Tell it about your teams and projects, and it creates an optimized plan.",
  },
  {
    title: "Add your teams",
    description:
      "Each team has people (frontend engineers, backend engineers, product managers). The tool uses this to know how much work your teams can handle.",
    target: "squads",
  },
  {
    title: "Add your projects",
    description:
      "For each project, say how many people it needs and how long it takes. Give it a value score so the tool knows what matters most.",
    target: "projects",
  },
  {
    title: "See the plan",
    description:
      "The Timeline shows when each project starts and finishes. Risk Analysis shows how likely the plan is to work out. Team Comparison shows what happens if you change your team setup.",
    target: "views",
  },
  {
    title: "Want to try it now?",
    description:
      "Load some sample data to see the tool in action right away, or start adding your own teams and projects.",
    action: "load-sample",
  },
];

export function OnboardingWizard({ onLoadSample }: { onLoadSample?: () => void }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) setVisible(true);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, "true");
  }, []);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }, [step, dismiss]);

  const prev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        {/* Modal */}
        <div className="bg-background rounded-xl shadow-2xl border max-w-lg w-full overflow-hidden">
          {/* Progress */}
          <div className="flex gap-1 px-6 pt-5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= step ? "bg-foreground" : "bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Content */}
          <div className="px-6 py-5">
            <h2 className="text-lg font-semibold tracking-tight">{current.title}</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              {current.description}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between px-6 pb-5">
            <button
              onClick={dismiss}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip tour
            </button>

            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  onClick={prev}
                  className="px-4 py-2 text-xs font-medium rounded-lg border hover:bg-muted transition-colors"
                >
                  Back
                </button>
              )}

              {isLast && onLoadSample ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => { onLoadSample(); dismiss(); }}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors"
                  >
                    Load sample data
                  </button>
                  <button
                    onClick={dismiss}
                    className="px-4 py-2 text-xs font-medium rounded-lg border hover:bg-muted transition-colors"
                  >
                    Start from scratch
                  </button>
                </div>
              ) : (
                <button
                  onClick={next}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors"
                >
                  {isLast ? "Get started" : "Next"}
                </button>
              )}
            </div>
          </div>

          {/* Step counter */}
          <div className="px-6 pb-4 text-center">
            <span className="text-[0.65rem] text-muted-foreground">
              {step + 1} of {STEPS.length}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

export function HelpButton() {
  const resetOnboarding = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }, []);

  return (
    <button
      onClick={resetOnboarding}
      className="h-8 px-3 text-xs font-medium rounded-md border hover:bg-muted transition-colors text-muted-foreground"
      title="Show the getting started guide"
    >
      ? Guide
    </button>
  );
}
