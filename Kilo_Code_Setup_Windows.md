# Catatin — Kilo Code + VS Code Windows Setup

## Recommended Workspace

Open the actual local Catatin project folder in VS Code, for example:

D:\Coding Vibe ai\Catatin v3

Do not open only a parent folder or a copied partial folder.

## Context Layout

Put the context documents in:

docs/
└── context/
    ├── Catatin_Master_PRD_v3.2.md
    ├── Catatin_Detail_Flowcharts_PC_Mobile_v3.2.md
    ├── Catatin_Backend_Revision_Plan_v1.md
    └── Catatin_AI_Coding_Context.md

Keep these files versioned with the project.

## Kilo Project Rules

This package provides:

.kilo/
├── rules/
│   └── catatin-core.md
└── rules-code/
    └── catatin-code.md

and:

kilo.jsonc
AGENTS.md

Kilo Code supports project-specific rules and `kilo.jsonc` instruction references. Project rules are loaded for the workspace. AGENTS.md is also supported.

## Model

Use your configured DeepSeek V4 Flash model for normal implementation work.

For high-risk financial/database revisions:
- prefer a planning/analysis pass first
- then implementation
- keep approval for destructive commands enabled

Do not configure a model name in project files because provider/model IDs can differ between Kilo configurations.

## Recommended Kilo Workflow

### Step 0 — Open Workspace
Open the local Catatin folder in VS Code.

### Step 1 — Verify Context
Ask Kilo:

"Read AGENTS.md and all files in docs/context. Do not modify anything. Summarize the current architecture, the approved revision plan, and the files likely affected by Revision 01."

This is an analysis-only task.

### Step 2 — Revision 01
Use the prompt from the revision plan:
"Execute Revision 01 only. Inspect the local workspace first. Do not use GitHub as the implementation source. Do not continue to Revision 02."

### Step 3 — Review
Review Kilo's changed-file diff.

Run tests/typecheck/build.

If correct, commit.

### Step 4 — Next Revision
Repeat for Revision 02, then 03, etc.

Never ask the agent to execute Revision 01–08 in one turn.

## Windows Safety

Before database migrations:
- stop the local backend if necessary
- make a backup of the development database
- confirm the database path
- run migration against a safe copy first when practical

Do not allow an agent to run destructive production commands automatically.

## Git Workflow

Recommended branch names:

revision/01-db-safety
revision/02-transaction-domain
revision/03-credit-card-statement
revision/04-installment
revision/05-unified-bills
revision/06-dashboard
revision/07-frontend
revision/08-testing

Commit after each accepted revision.

## First Prompt

Use:

"Read AGENTS.md and the complete docs/context directory. Inspect the local workspace only; do not use GitHub for source inspection. Do not modify files. Audit the current implementation against Revision 01 and report: current schema, affected files, migration risks, test plan, and whether Revision 01 can be implemented safely. STOP."
