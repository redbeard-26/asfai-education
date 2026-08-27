# Install the ASFAI Education plugin

The same download works with ChatGPT/Codex and Claude. It connects to the hosted ASFAI Education MCP at `https://constitution.asfai.org/education/api/mcp`; no website session or desktop companion is required for normal learning, PrivateDataPod, or Google Classroom workflows.

## Install in ChatGPT/Codex

1. Unzip `asfai-education-plugin.zip`.
2. Open a terminal in the extracted folder that contains `.agents`, `.codex-plugin`, and `plugins`.
3. Register the downloaded marketplace and install the plugin:

   ```text
   codex plugin marketplace add .
   codex plugin add asfai-learning@asfai
   ```

4. Keep **ASFAI Learning** enabled in Plugins and start a new chat so its current skill and MCP tools are loaded.

Existing installations can be refreshed with the second command after replacing the extracted files. Do not configure separate student, teacher, Pod, storage, or Google Classroom connectors: the plugin deliberately exposes one authenticated ASFAI Education MCP connector.

## Install in Claude

1. Keep `asfai-education-plugin.zip` zipped.
2. In Claude, open **Customize**, choose **Plugins**, and upload the ZIP as a custom plugin.
3. Enable **ASFAI Learning** and start a new chat. In Claude Code, run `/reload-plugins` if updating it in an active session.

The ZIP root contains Claude's `.claude-plugin/plugin.json`, the shared `skills/` directory, and the same `.mcp.json` remote connector used by ChatGPT/Codex.

Each user approves their own PrivateDataPod or classroom account once. Those grants persist for that connector until the user explicitly forgets them or revokes ASFAI at the provider.
