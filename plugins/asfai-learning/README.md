# ASFAI Learning plugin

This plugin installs one authenticated remote MCP server displayed as **ASFAI Learning**. It works without the education website or a desktop companion and is intended to use the same connection from Windows, iPhone, and iPad.

The compact callable surface contains nine gateway tools: `asfai_capability`, `asfai_graph`, `asfai_run`, `asfai_session`, `asfai_lesson`, `asfai_evidence`, `asfai_resource`, `asfai_storage`, and `asfai_classroom`. Classroom is provider-neutral; pass `provider: "google"` for Google Classroom today. There is no separate Pod, storage, or Google connector.

The connector establishes an accountless private identity through OAuth 2.1 and PKCE. A connected Solid Pod is the primary store for learner, educator, and classroom records. When no Pod is connected, the remote service identifies its encrypted connector-scoped fallback explicitly and never reports it as a Pod save. Provider passwords and tokens are never accepted through tool arguments or returned to the model.

Google Classroom authorization is performed through a hosted browser handoff and then encrypted for the connector until the user explicitly removes it or revokes ASFAI in Google. The connector can list courses and assignments, import selected work, create assignments with links, Drive files, or generated Google Docs, attach or turn in approved work, and return approved grades. All external mutations are previewed before a confirmed call.

After installing or updating the plugin, keep its toggle enabled and start a new chat so the single server and current skill are loaded.

## Download and install

The current packaged plugin is available at [constitution.asfai.org](https://constitution.asfai.org/downloads/asfai-education-plugin.zip). Unzip it, open a terminal in the extracted `asfai-education-plugin` folder, and run:

```text
codex plugin marketplace add .
codex plugin add asfai-learning@asfai
```

Start a new chat after installation so the current skill and MCP tools are loaded.
