"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { effectiveFe, effectiveBe } from "@/lib/optimizer";

const NAV_ITEMS = [
  { id: "traditional", label: "Traditional dev" },
  { id: "spec-driven", label: "Spec-driven AI" },
  { id: "comparison", label: "Head-to-head" },
  { id: "when-to-use", label: "When to use what" },
  { id: "running-a-pilot", label: "Running a pilot" },
];

function usePersonalization() {
  const { squads, projects, cycleOverheadPct, cycleLengthWeeks } = useStore();

  const totalPeople = squads.reduce((s, sq) => s + sq.members.length, 0);
  const totalTeams = squads.length;
  const totalFeCap = squads.reduce((s, sq) => s + effectiveFe(sq), 0);
  const totalBeCap = squads.reduce((s, sq) => s + effectiveBe(sq), 0);
  const totalEngineers = squads.reduce(
    (s, sq) => s + sq.members.filter((m) => m.role === "fe" || m.role === "be").length,
    0,
  );
  const totalProjects = projects.length;
  const overheadMonthsPerYear = totalEngineers * (cycleOverheadPct / 100) * 12;
  const hasData = totalPeople > 0 && totalProjects > 0;

  return {
    totalPeople,
    totalTeams,
    totalFeCap,
    totalBeCap,
    totalEngineers,
    totalProjects,
    cycleOverheadPct,
    cycleLengthWeeks,
    overheadMonthsPerYear,
    hasData,
  };
}

function PersonalizedCallout({ children, show }: { children: React.ReactNode; show: boolean }) {
  if (!show) return null;
  return (
    <div className="my-4 p-4 rounded-lg border-2 border-violet-200 bg-violet-50/60">
      <div className="text-[0.65rem] font-bold text-violet-600 uppercase tracking-wider mb-1">Your data</div>
      <div className="text-sm text-violet-800">{children}</div>
    </div>
  );
}

function SectionHeader({ id, title }: { id: string; title: string }) {
  return (
    <h2 id={id} className="text-lg font-bold mt-12 mb-4 pt-4 border-t scroll-mt-20">
      {title}
    </h2>
  );
}

function ComparisonRow({ label, traditional, ai }: { label: string; traditional: string; ai: string }) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 py-2 border-b last:border-b-0">
      <div className="text-sm font-medium">{label}</div>
      <div className="text-sm text-slate-600">{traditional}</div>
      <div className="text-sm text-violet-700">{ai}</div>
    </div>
  );
}

export default function LearnPage() {
  const p = usePersonalization();

  return (
    <div className="flex max-w-[1200px] mx-auto px-6 py-8 gap-8">
      {/* Sidebar nav */}
      <nav className="hidden lg:block w-48 shrink-0 sticky top-8 self-start space-y-1">
        <Link href="/" className="text-xs font-semibold text-violet-600 hover:text-violet-800 mb-4 block">
          &larr; Back to optimizer
        </Link>
        {NAV_ITEMS.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="block text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            {item.label}
          </a>
        ))}
      </nav>

      {/* Main content */}
      <main className="flex-1 min-w-0 max-w-[720px]">
        <Link href="/" className="lg:hidden text-xs font-semibold text-violet-600 hover:text-violet-800 mb-6 block">
          &larr; Back to optimizer
        </Link>

        <h1 className="text-2xl font-bold tracking-tight">
          Traditional vs. Spec-Driven AI Development
        </h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          A comprehensive comparison of two fundamentally different approaches to building software.
          {p.hasData ? " Personalized with your actual team data." : " Load data in the optimizer to see personalized insights."}
        </p>

        {/* ── Section 1: Traditional ── */}
        <SectionHeader id="traditional" title="Traditional Software Development" />

        <p className="text-sm leading-relaxed text-foreground/80">
          For the past two decades, most software teams have followed some variant of Agile methodology.
          Whether it&apos;s Scrum, Kanban, SAFe, or a homegrown process, the core pattern is similar:
          work in short cycles (sprints), with specialized roles, and regular ceremonies to coordinate.
        </p>

        <h3 className="text-sm font-semibold mt-6 mb-2">The sprint lifecycle</h3>
        <div className="flex flex-wrap gap-2 my-3">
          {["Sprint Planning", "Daily Standups", "Development", "Code Review", "QA / Testing", "Sprint Review", "Retrospective"].map((step, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[0.6rem] font-bold text-slate-600">{i + 1}</div>
              <span className="text-xs text-slate-700">{step}</span>
              {i < 6 && <span className="text-muted-foreground">&rarr;</span>}
            </div>
          ))}
        </div>

        <p className="text-sm leading-relaxed text-foreground/80 mt-3">
          Each sprint (typically 1-4 weeks) follows this cycle. The ceremony overhead &mdash; planning, standups,
          reviews, retrospectives &mdash; typically consumes 15-25% of a team&apos;s productive time. The longer the
          sprint, the less overhead proportionally, but the slower the feedback loop.
        </p>

        <PersonalizedCallout show={p.hasData}>
          Your teams use {p.cycleLengthWeeks}-week sprints with {p.cycleOverheadPct}% overhead.
          That&apos;s roughly <strong>{p.overheadMonthsPerYear.toFixed(1)} person-months per year</strong> spent
          in meetings and ceremonies instead of building.
        </PersonalizedCallout>

        <h3 className="text-sm font-semibold mt-6 mb-2">Role specialization</h3>
        <p className="text-sm leading-relaxed text-foreground/80">
          Traditional teams have specialized roles: frontend engineers, backend engineers, QA engineers,
          DevOps engineers, designers, and product managers. Each person focuses on their domain.
          This creates deep expertise but also creates <strong>bottlenecks</strong> &mdash; if all your backend
          engineers are busy, frontend work that depends on an API sits waiting.
        </p>

        <PersonalizedCallout show={p.hasData}>
          Your {p.totalTeams} team{p.totalTeams !== 1 ? "s" : ""} have {p.totalPeople} people total,
          with {p.totalEngineers} engineers providing{" "}
          {p.totalFeCap.toFixed(1)} effective frontend and {p.totalBeCap.toFixed(1)} effective backend capacity.
          Any imbalance between FE and BE demand creates idle capacity on one side.
        </PersonalizedCallout>

        <h3 className="text-sm font-semibold mt-6 mb-2">Estimation and velocity</h3>
        <p className="text-sm leading-relaxed text-foreground/80">
          Teams estimate work in story points or hours, track velocity (how much they complete per sprint),
          and use this to forecast delivery. The problem: estimates are consistently wrong. Studies show
          software projects take 2-3x longer than estimated on average. Velocity fluctuates with team changes,
          tech debt, and interruptions.
        </p>

        <h3 className="text-sm font-semibold mt-6 mb-2">Scaling challenges</h3>
        <p className="text-sm leading-relaxed text-foreground/80">
          As organizations grow, they add more teams, which creates coordination overhead: cross-team
          dependencies, architectural reviews, integration testing, release coordination. Brook&apos;s Law
          (&ldquo;adding people to a late project makes it later&rdquo;) reflects the reality that communication
          costs grow quadratically with team size.
        </p>

        {/* ── Section 2: Spec-Driven AI ── */}
        <SectionHeader id="spec-driven" title="Spec-Driven AI Development" />

        <p className="text-sm leading-relaxed text-foreground/80">
          A fundamentally different approach is emerging: instead of breaking work into user stories for
          specialized teams, you write a detailed specification and AI generates the implementation.
          A human reviews, adjusts, and ships. The cycle is hours, not weeks.
        </p>

        <h3 className="text-sm font-semibold mt-6 mb-2">The daily cycle</h3>
        <div className="flex flex-wrap gap-2 my-3">
          {["Define the spec", "AI generates code", "Human reviews", "AI writes tests", "Deploy to staging", "Verify & ship"].map((step, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-violet-200 flex items-center justify-center text-[0.6rem] font-bold text-violet-700">{i + 1}</div>
              <span className="text-xs text-violet-800">{step}</span>
              {i < 5 && <span className="text-violet-400">&rarr;</span>}
            </div>
          ))}
        </div>

        <p className="text-sm leading-relaxed text-foreground/80 mt-3">
          The entire cycle &mdash; from spec to production &mdash; can happen in a single day for well-scoped features.
          There are no standups, no sprint planning, no retrospectives. The spec IS the planning.
          The code review IS the quality gate. The AI-generated tests ARE the verification.
        </p>

        <h3 className="text-sm font-semibold mt-6 mb-2">The full-stack AI engineer</h3>
        <p className="text-sm leading-relaxed text-foreground/80">
          With AI assistance, a single engineer can work across the entire stack: frontend, backend, database,
          infrastructure, testing. AI handles the boilerplate and domain-specific syntax; the human provides
          architecture decisions, business logic, and quality judgment. The FE/BE bottleneck disappears.
        </p>

        <h3 className="text-sm font-semibold mt-6 mb-2">The PM as spec writer</h3>
        <p className="text-sm leading-relaxed text-foreground/80">
          In this model, the Product Manager&apos;s most critical skill becomes writing precise, detailed specifications.
          A good spec is worth more than a good sprint plan because the spec directly becomes the implementation guide.
          Ambiguity in a spec = bugs in the output. Precision in a spec = high-quality, predictable delivery.
        </p>

        <h3 className="text-sm font-semibold mt-6 mb-2">Near-zero ceremony overhead</h3>
        <p className="text-sm leading-relaxed text-foreground/80">
          Without sprints, there&apos;s no sprint planning, no estimation poker, no velocity tracking,
          no retrospectives. Communication happens through specs and code reviews. Status is visible
          in the code &mdash; it either passes tests or it doesn&apos;t. This recovers 15-25% of productive time.
        </p>

        {/* ── Section 3: Head-to-Head ── */}
        <SectionHeader id="comparison" title="Head-to-Head Comparison" />

        <div className="border rounded-lg overflow-hidden my-4">
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 py-2 px-3 bg-muted/40 border-b">
            <div className="text-xs font-bold text-muted-foreground">Dimension</div>
            <div className="text-xs font-bold text-slate-600">Traditional</div>
            <div className="text-xs font-bold text-violet-700">Spec-Driven AI</div>
          </div>
          <div className="px-3">
            <ComparisonRow label="Cycle time" traditional="1-4 weeks" ai="Hours to 1 day" />
            <ComparisonRow label="Team per feature" traditional="3-7 specialists" ai="1 engineer + 1 PM" />
            <ComparisonRow label="Ceremony overhead" traditional="15-25% of time" ai="Near zero" />
            <ComparisonRow label="Role bottlenecks" traditional="FE waits for BE, or vice versa" ai="One person does both" />
            <ComparisonRow label="Estimation approach" traditional="Story points, velocity" ai="Spec complexity, AI capability" />
            <ComparisonRow label="Documentation" traditional="Separate effort (often skipped)" ai="The spec IS the documentation" />
            <ComparisonRow label="Onboarding" traditional="Weeks to months" ai="Read the spec, read the code" />
            <ComparisonRow label="Quality approach" traditional="Manual QA, manual code review" ai="AI-generated tests, human review" />
            <ComparisonRow label="Scaling model" traditional="Add more teams (more coordination)" ai="Add more AI-assisted pairs" />
            <ComparisonRow label="Key risk" traditional="Coordination overhead, slow delivery" ai="AI reliability, spec quality" />
          </div>
        </div>

        <PersonalizedCallout show={p.hasData}>
          With your current {p.totalTeams} team{p.totalTeams !== 1 ? "s" : ""} of {p.totalPeople} people:
          a spec-driven approach could potentially deliver the same work
          with {Math.ceil(p.totalTeams * 2)} people ({p.totalTeams} engineer{p.totalTeams !== 1 ? "s" : ""} + {p.totalTeams} PM{p.totalTeams !== 1 ? "s" : ""})
          &mdash; but only if AI makes each engineer roughly {(p.totalEngineers / p.totalTeams).toFixed(1)}x more productive.
          Use the <Link href="/" className="font-semibold text-violet-700 underline">Pilot Simulator</Link> to test this with your actual projects.
        </PersonalizedCallout>

        {/* ── Section 4: When to use what ── */}
        <SectionHeader id="when-to-use" title="When to Use What" />

        <h3 className="text-sm font-semibold mt-4 mb-2">Traditional works well for:</h3>
        <ul className="space-y-1.5 ml-4">
          {[
            "Large, mature codebases where deep domain knowledge is critical",
            "Highly regulated industries (fintech, healthcare) with strict audit requirements",
            "Teams with low AI tooling maturity or organizational resistance to change",
            "Complex systems integration where human judgment at every step is essential",
            "Situations where team-building and knowledge sharing are strategic priorities",
          ].map((item, i) => (
            <li key={i} className="text-sm text-foreground/80 leading-relaxed list-disc">{item}</li>
          ))}
        </ul>

        <h3 className="text-sm font-semibold mt-6 mb-2">Spec-driven AI works well for:</h3>
        <ul className="space-y-1.5 ml-4">
          {[
            "Greenfield projects where there's no legacy code to navigate",
            "Well-defined features with clear requirements and acceptance criteria",
            "Fast-moving products where speed-to-market is the top priority",
            "Small teams that need to punch above their weight",
            "Prototyping and experimentation where rapid iteration matters most",
          ].map((item, i) => (
            <li key={i} className="text-sm text-foreground/80 leading-relaxed list-disc">{item}</li>
          ))}
        </ul>

        <h3 className="text-sm font-semibold mt-6 mb-2">The hybrid approach</h3>
        <p className="text-sm leading-relaxed text-foreground/80">
          Most organizations will end up with a hybrid: traditional teams maintain the core platform and
          handle complex, cross-cutting work, while AI-powered mini squads tackle new features, experiments,
          and rapid iterations. The key is identifying which work benefits most from each approach.
        </p>

        <div className="my-4 p-4 rounded-lg border bg-amber-50/60 border-amber-200/60">
          <p className="text-xs font-bold text-amber-700 mb-1">Important</p>
          <p className="text-sm text-amber-800 leading-relaxed">
            This is not about replacing people. It&apos;s about amplifying what each person can deliver.
            A 5-person team that adopts AI effectively might deliver what used to take 15 people &mdash;
            meaning those 5 people create 3x the value, not that 10 people lose their jobs.
          </p>
        </div>

        {/* ── Section 5: Running a pilot ── */}
        <SectionHeader id="running-a-pilot" title="Running a Pilot Programme" />

        <p className="text-sm leading-relaxed text-foreground/80">
          Don&apos;t transform everything at once. Start with a controlled pilot to gather real data
          about what works for your organization.
        </p>

        <h3 className="text-sm font-semibold mt-6 mb-2">1. Choose the right project</h3>
        <p className="text-sm leading-relaxed text-foreground/80">
          Pick a project that is: <strong>medium complexity</strong> (not trivial, not the hardest thing you do),
          <strong> well-defined</strong> (clear requirements, limited ambiguity),
          <strong> low dependency</strong> (doesn&apos;t block other teams),
          and <strong>representative</strong> (similar to your typical work).
        </p>

        <h3 className="text-sm font-semibold mt-6 mb-2">2. Set up the pilot team</h3>
        <p className="text-sm leading-relaxed text-foreground/80">
          Start with 1 senior engineer + 1 PM. The engineer should be comfortable with AI coding tools
          and willing to work in a spec-driven way. The PM should be able to write detailed, precise specs.
          Both should understand this is an experiment &mdash; learning is as important as delivery.
        </p>

        <h3 className="text-sm font-semibold mt-6 mb-2">3. Define success criteria</h3>
        <ul className="space-y-1.5 ml-4">
          {[
            "Delivery time: did the pilot team deliver faster than estimated for a traditional team?",
            "Quality: are defect rates comparable or better?",
            "Rework: how much code needed to be rewritten after initial AI generation?",
            "Team satisfaction: did the pilot team find the process effective and sustainable?",
            "Spec quality: did the spec-driven approach produce better documentation as a side effect?",
          ].map((item, i) => (
            <li key={i} className="text-sm text-foreground/80 leading-relaxed list-disc">{item}</li>
          ))}
        </ul>

        <h3 className="text-sm font-semibold mt-6 mb-2">4. Run and measure</h3>
        <p className="text-sm leading-relaxed text-foreground/80">
          Run the pilot for 4-8 weeks. Track all the metrics above. Compare against how the same project
          would have been delivered by a traditional team (use the Pilot Simulator for this comparison).
          Be honest about what worked and what didn&apos;t.
        </p>

        <h3 className="text-sm font-semibold mt-6 mb-2">5. Decide and expand</h3>
        <p className="text-sm leading-relaxed text-foreground/80">
          Based on results: expand to more projects if successful, adjust the approach if partially successful,
          or return to traditional if it didn&apos;t work for your context. There&apos;s no shame in finding that
          your domain or team isn&apos;t ready yet &mdash; the tooling improves every month.
        </p>

        <div className="my-8 p-5 rounded-lg border-2 border-violet-200 bg-violet-50/60 text-center">
          <p className="text-sm font-semibold text-violet-800 mb-3">
            Ready to test this with your actual projects?
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
          >
            Open the Pilot Simulator
          </Link>
        </div>

        <div className="h-16" />
      </main>
    </div>
  );
}
