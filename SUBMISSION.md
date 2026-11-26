# Past You: Hacksgiving draft

Working draft. The application has not yet been deployed with a live Sprites connector and a model, and this is not a submission. Verify all claims and replace the placeholders after the live run.

## The idea

Past You helps developers answer: “Did we already learn why this change is risky?” Give it a proposed change, and it searches a project's history, cites an earlier decision, and runs a relevant regression in an isolated Sprite. The first case uses Potluck's public commit history and a real test about retrying a tool request on an incompatible machine.

## Demonstration outline

Use a real, successful live run for the recording. Do not present the offline sample as a connector or model run.

1. Open with the proposed change: “Let's retry failed tool requests on any available machine.” Ask why this seemingly reasonable optimization might fail.
2. Show that the application is running on a Sprite and that the GitHub connector and model are configured. Start the investigation and show its search, commit inspection, and test activity.
3. Open the linked Potluck commit. Explain the earlier failure: retries could move to a machine with incompatible tool-call markers, so tool calls were interpreted as plain text.
4. Show the isolated replay: the historical code passes the original test; removing the matching-marker condition in memory makes that same test fail. The change is hypothetical and the replay substitutes a network test double. It is not a full Potluck test suite or a test of a submitted pull request.
5. Show the evidence and recommendation in the handoff. End with the pitch: “Your next idea gets a second opinion from the decisions your team already made.”

## Short description

Past You investigates proposed changes against a project's past decisions. It cites a relevant commit and replays a regression so a developer can see the reason behind an earlier fix before repeating the mistake.

## Share draft

Built Past You for @flydotio Hacksgiving: give it a proposed change and it looks for the decision your team already made, cites the commit, and replays a regression.

For the demo, it catches a Potluck retry change that would break tool calls on machines with different markers. [demo link] [code link]

## Before sharing

- Run the complete agent on a Sprite using an actual Sprites connector and a model. Check the visible trace and citation.
- Publish or otherwise provide a code link and a short demo link. Keep credentials and private information out of both.
- Review the share draft against the real implementation. Post on an allowed platform and tag @flydotio only when authorized.
- Submit the code link, demo link, and description through the [Hacksgiving form](https://fly.io/hacksgiving/). The event page says submissions close before midnight PST on Sunday, November 29, 2026.

The [official event page](https://fly.io/hacksgiving/) says a video demo is welcome, but does not affect the score.
