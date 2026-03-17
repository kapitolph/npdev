# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the npdev project.

ADRs document significant technical decisions — the context, the options considered, and the chosen approach. They serve as a historical log so future contributors understand *why* things are the way they are.

## Format

Each ADR is a markdown file named `NNNN-short-title.md` with this structure:

```markdown
# NNNN. Title

**Date**: YYYY-MM-DD
**Status**: proposed | accepted | superseded by [NNNN](NNNN-*.md) | deprecated

## Context
What is the problem or situation that prompted this decision?

## Decision
What did we decide to do?

## Consequences
What are the tradeoffs? What becomes easier or harder?
```

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-shell-wrapper-for-ink-ssh-handoff.md) | Shell wrapper for Ink-to-SSH handoff | proposed |
