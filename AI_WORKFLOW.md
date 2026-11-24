# AI workflow

Default path for every studio experiment:

**Brief → research → achievable v1 → tasks → approved build → test → document → present.**

## Stages

| Stage | Command | Output |
| --- | --- | --- |
| Capture idea | `/new-project` | `PROJECTS/NNN-NAME/` + brief from template |
| Research | `/research` | Notes, constraints, references; no source rewrites |
| Plan | `/plan` | Development plan: v1 scope, tasks, risks, acceptance |
| Build | `/build` | Only after founder approval of the plan (or a bounded approved task) |
| Review | `/review` | Project review vs brief; gaps labeled |
| Showcase | `/showcase` | Showcase page/doc for the portfolio |
| Publish | `/publish` | Deploy / Pages / mirror — **approval required** |
| Status | `/studio-report` | Snapshot of register, active, backlog |

## Approval gates

AI may analyze, draft docs, run safe tests, and implement **bounded approved tasks**.

**Ask first** before:

- Destructive edits or mass deletes  
- Architecture rewrites  
- Deploy / publish / GitHub Pages updates  
- Secrets or credential use  
- License / distribution changes  
- Any Windward `source/` or `index.html` change not already in an approved task  
- Editing protected AEI baselines or weakening tests  

## AEI evidence bar (engineering)

Per [AEI/CHARTER.md](AEI/CHARTER.md):

1. **Evidence before approval** — baseline, reproducible test, measured result.  
2. **Independent verification** — independently assigned verifier re-runs checks; implementers do not self-approve.  
3. **Reversible autonomy** — branch experiments OK; production and protected baselines need human authorization.  
4. **Versioned contracts** — tasks / evidence / responses declare `schemaVersion` (`AEI/contracts/`).  
5. **Immutable evidence** — corrections create new records; never overwrite history.  

Model-independent: Cursor, Claude, GPT, and others share the same contracts and [agent ledger](AEI/AGENT_LEDGER.md).

## Done means

Implemented (when code was in scope) **and** tested/verified as required by the project **and** docs/portfolio/register updated. Unverified work stays labeled. Significant engineering claims need evidence under `AEI/evidence/` before they count as verified improvements.

## Windward-specific

Windward is Project 001. Studio docs profile and showcase it; they do not rewrite the app by default. Graphics work follows existing zero-tolerance load/WebGPU gates when engineering is approved separately.
