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
    title: "Welcome to Portfolio Optimizer",
    description:
      "This tool helps you plan and optimize your team's project delivery. It figures out the best order to work on projects based on your team capacity and priorities.",
  },
  {
    title: "1. Set up your teams",
    description:
      "Start by defining your squads (teams). Each squad has members with roles (FE, BE, PM) and allocation percentages. This determines your delivery capacity.",
    target: "squads",
  },
  {
    title: "2. Add your projects",
    description:
      "Add projects with their requirements (how many FE/BE engineers, duration) and business value. The optimizer uses this to prioritize work.",
    target: "projects",
  },
  {
    title: "3. Configure your planning horizon",
    description:
      "Set the time window for planning (start date, number of months), your sprint cycle length, and choose a prioritization objective (WSJF is the default — it balances value and effort).",
    target: "settings",
  },
  {
    title: "4. View the optimized schedule",
    description:
      "The Schedule tab shows a Gantt chart of your optimized delivery plan. Projects are color-coded by squad and ordered by priority. If projects can't fit, they're listed as deferred with reasons.",
    target: "views",
  },
  {
    title: "5. Run a Monte Carlo forecast",
    description:
      "The Forecast tab runs hundreds of simulations with random variations (estimation errors, rework, interruptions) to show how likely your plan is to succeed. Adjust the uncertainty sliders to match your reality.",
    target: "views",
  },
  {
    title: "Quick start: Load sample data",
    description:
      "Don't have your own data yet? Click \"Load sample data\" in the top-right to see the tool in action with a realistic example of 3 squads and 10 projects.",
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
