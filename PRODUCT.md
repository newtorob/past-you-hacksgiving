# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers working with coding agents who want to understand an earlier decision before making a related change. The first example uses the public Potluck repository.

## Product Purpose

Past You investigates a proposed change, finds a relevant historical decision, and reports supporting evidence and any applicable test outcome. The Hacksgiving entry must run as an agent on a Fly Sprite and use a Sprites connector.

## Operating Context

The first demonstration uses a historical Potluck commit and its original tool-call marker regression test. The proposed regression is hypothetical. The test runs the original selected functions and test in an isolated harness with network test doubles.

## Capabilities and Constraints

The first version is scoped to one public repository and one approved regression test. It never runs a user-supplied shell command. It distinguishes the public GitHub API, a live GitHub connector, and saved sample excerpts, and distinguishes model output from simple matching. Provider credentials belong in Fly connectors, not in the Sprite. Running tests against arbitrary repositories and supporting private user data are undecided.

## Evidence on Hand

`fixtures/potluck/` contains the unchanged historical source and test from Potluck commit e72bb4677934c3b9a9d47f656e5550731d8f2223, along with an isolated replay harness. The live Ollama connector, historical search, and both test outcomes were independently verified on a Sprite.

## Product Principles

- Make each claim traceable to a source or mark it as analysis.
- Report actual test outcomes, including incomplete or inconclusive runs.
- Keep a user in control of what data and services the agent may reach.
- Keep the demo useful and understandable within a short investigation.
