# Catatin — Kilo Code Agent Context

This file is intentionally concise. Detailed requirements live in `docs/context/`.

## Local Workspace First

Use the opened local VS Code workspace as the primary source of implementation truth.

Do not fetch/reconstruct the source code from GitHub when local files are available.

## Context Files

Read these before substantial implementation:
- `docs/context/Catatin_Master_PRD_v3.2.md`
- `docs/context/Catatin_Detail_Flowcharts_PC_Mobile_v3.2.md`
- `docs/context/Catatin_Backend_Revision_Plan_v1.md`
- `docs/context/Catatin_AI_Coding_Context.md`

## Execution

Work one revision at a time.

Before coding:
- inspect affected files
- inspect schema/migrations if relevant
- identify impact

After coding:
- run relevant tests
- run typecheck/build
- report exact changes
- report risks
- STOP

## Critical Financial Rule

Credit-card purchase = expense + liability increase.

Credit-card payment = transfer/settlement + liability decrease.

Credit-card payment MUST NOT create a second expense.

## Safety

Never reset/delete financial data to make a migration easier.
Never read or expose secrets.
Never silently change APIs or schema.
