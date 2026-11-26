# Past You

An agent that looks for the decision behind a proposed code change and checks a relevant regression before you repeat an old mistake.

The first case uses public Potluck history: a tool-call retry once selected a machine with incompatible markers. Past You can retrieve the relevant commit from the public GitHub API or a Fly Sprites GitHub connector, use a tool-calling model to investigate it, and run the original test against both the historical code and a clearly labeled hypothetical regression.

## Run locally

Requires Node.js 20+ and Python 3. No package installation is needed.

```sh
npm start
```

Open <http://127.0.0.1:8080>. With no configuration, the app labels itself **sample history, no model**. It searches saved excerpts and uses simple matching. The replay really runs; it does not require GitHub credentials, a model, network access, or Potluck's production services.

```sh
npm test
npm run check
```

The web integration test opens a loopback port. Some sandboxes require permission to bind it.

## What the test does

The unchanged historical files in `fixtures/potluck/` come from MIT-licensed Potluck commit `e72bb4677934c3b9a9d47f656e5550731d8f2223`. `replay.py` loads the original routing functions and `test_a_proof_retry_only_considers_machines_that_prove_the_same_markers`, replacing the network client with a test double. It runs that original test twice:

1. Historical code: the assertions pass.
2. Hypothetical change: a single in-memory mutation removes the matching-marker condition, and the original test fails.

This is an isolated reproduction of that test, not a full Potluck test suite or a real proposed pull request. The copies, test harness, and license are kept together under `fixtures/potluck/`.

## Run on a Fly Sprite

The Hacksgiving submission must actually use at least one Sprites connector. The offline sample alone does **not** meet that requirement.

1. Create a Sprite in the intended Fly organization and set up an Ollama Cloud connector. Restrict the connector's access to the project Sprite and to the endpoints it needs. Ollama requires your own account and API key; the key stays in Fly, not in the Sprite. Past You is deliberately scoped to the public `newtorob/potluck-ai` repository in this prototype.
2. Make the project files available on the Sprite. Copy `.env.sprite.example` to `.env.sprite` and replace the model placeholders with the Ollama connector URL shown by Fly and a tool-calling model available to your account. `.env.sprite` is ignored by Git. The URL identifies a connector; the provider credential remains in Fly. `PASTYOU_GITHUB_PUBLIC=1` reads public history directly without connecting a GitHub account.
3. From the project directory on the Sprite, run `sh scripts/start-sprite.sh`. It listens on port 8080. For wake-on-request, install it as a Sprite service using Fly's current service instructions.
4. Open the Sprite URL using its default organization authentication. Confirm the interface says **Public GitHub + model configured**, run the example, and verify the result includes the linked commit, both test outcomes, and an agent note. Configuration by itself does not prove the Ollama connector works.

`PASTYOU_GITHUB_PUBLIC=1` enables unauthenticated GitHub requests for the fixed public repository. Optionally, `PASTYOU_GITHUB_CONNECTOR` is the GitHub gateway base URL, without a trailing API path; if set, it takes precedence over public access. Review the GitHub OAuth scope before authorizing it: Fly may request access wider than this demo needs. `PASTYOU_MODEL_URL` is the complete OpenAI-compatible `/chat/completions` endpoint of a Fly connector. `PASTYOU_MODEL` is the selected model name. The server refuses connector URLs outside `https://api.sprites.dev/v1/gateway/`; no API key is stored in this project or passed to the Sprite.

If only public GitHub access or the GitHub connector is configured, the app uses live history with explicitly labeled simple matching. If only a model is configured, it uses labeled sample history. Live history and a working model connector are needed for the intended agent demo; model availability and billing depend on the configured provider. Public GitHub API requests are subject to unauthenticated rate limits.

The Sprite URL is private by default. This prototype has a single shared investigation slot and no public-user authentication or usage quota, so keep it private while connected to accounts or a metered model.

## Boundaries

- The only executable test is the checked-in replay. The user and model cannot supply a command or a path to execute.
- The model can search the selected repository, inspect only commits returned by its search, and run the one permitted test only after inspecting its matching commit. Its tool calls and iterations are bounded.
- If the model selects the known matching commit but omits its test, the workflow runs that test and gives the observed result to the model before it writes the final handoff. The test output is always produced by the replay process.
- Retrieved commit text is untrusted data. The model's proposed citation must match a commit it actually inspected; test results come from the replay process, not from generated text.
- With live history, search terms derived from the proposal go to GitHub. With a model configured, the proposal and selected public commit text go to that model provider. The app displays its configured mode before an investigation.
- Model-generated text may still be wrong. Read the linked source and observed test result before acting. No repository writes, public posts, or deployments are performed by the app.
- The first version is intentionally limited to one public repository and one test. It is not a general-purpose PR reviewer.
