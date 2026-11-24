# AI Creative Studio

Independent AI creative lab workflow for portfolio experiments. Lives **alongside** Windward OS (`company/`) — studio docs do not replace company governance.

**Founder** = creative director, owner, and final taste.  
**AI** = research, planning, implementation under approval gates.  
**Output** = finished experiments, showcases, and lessons.

## What this is

A reusable operating system for making things with AI: small creative projects with a clear brief, a bounded build, a public showcase, and a written review. Windward is Project 001 in the portfolio **and** the flagship product under Windward Technologies (`company/CHARTER.md`).

## What this is not

- Not permission to rewrite shipped app source without an approved brief  
- Not a second copy of company strategy (that lives in `company/`)  
- Not a bypass of `company/APPROVAL_MATRIX.md` for spend, deploy, or ownership  

## Map

| Path | Role |
| --- | --- |
| [company/](company/) | Windward OS — charter, org, approvals, business records |
| [AEI/](AEI/) | Engineering governance — evidence, verification, model-independent quality ([charter](AEI/CHARTER.md)) |
| [CREATIVE_PHILOSOPHY.md](CREATIVE_PHILOSOPHY.md) | Taste, constraints, what “done” means |
| [AI_WORKFLOW.md](AI_WORKFLOW.md) | Brief → research → plan → build → review → showcase |
| [PORTFOLIO.md](PORTFOLIO.md) | Public-facing list of experiments |
| [OPERATIONS/](OPERATIONS/) | Register, backlog, active/completed, lessons |
| [TEMPLATES/](TEMPLATES/) | Copy-paste shells for new work |
| [PROJECTS/](PROJECTS/) | One folder per experiment |
| [.cursor/rules/](.cursor/rules/) | Studio + company rules for agents |
| [.cursor/commands/](.cursor/commands/) | Studio and executive slash commands |

## Daily loop (founder)

1. `/studio-report` — where things stand  
2. `/new-project` or pick from [OPERATIONS/IDEAS_BACKLOG.md](OPERATIONS/IDEAS_BACKLOG.md)  
3. `/research` → `/plan` → approve → `/build`  
4. `/review` → `/showcase` → `/publish` only when you say so  

Approvals required before: destructive changes, architecture rewrites, deploys/publish, secret use, license or distribution changes.

Engineering claims (performance, visual quality, “fixed”, “faster”) follow [AEI/CHARTER.md](AEI/CHARTER.md): evidence before approval, independent verification, reversible autonomy. AEI domains are capability areas — not a company org chart.

## Windward note

App source (`source/`, `index.html`, live Pages) stays intact unless a separate, approved project brief says otherwise. Studio docs manage the lab; they do not rewrite the island.
