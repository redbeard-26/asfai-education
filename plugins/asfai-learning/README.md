# ASFAI Learning plugin

This plugin packages the public ASFAI Education MCP, a two-tool private companion, and one compact routing skill. The companion provides personal storage and a provider-neutral classroom bridge; Google Classroom is the first adapter and is selected with `provider: "google"`. Students and teachers do not clone a repository, install Node packages, edit MCP settings, or choose filesystem paths.

The plugin display name is **ASFAI Learning**; there is intentionally no tool named `asfai_learning`. New chats receive eight public `asfai_*` gateway tools plus private `asfai_personal_storage` and `asfai_classroom`. A public-directory search is not an availability check for this personal-marketplace plugin. After installing or updating it, keep its toggle enabled and start a new chat.

## Learner experience

1. Install **ASFAI Learning** from the plugin directory.
2. Start a chat and say, “Connect my private Pod,” or begin a lesson and keep progress on this device.
3. For a Pod, approve access once on the Pod provider page and return to chat. The device then reconnects silently in later chats until the user explicitly forgets it or revokes it at the provider.

The private MCP runs on the learner's computer. Solid credentials and private signing keys never pass through the public AWS MCP. Reusable Solid authorization is protected for the current device user (with current-user DPAPI encryption on Windows) and is not removed when a chat or process ends. The local fallback writes under the learner's profile and verifies every save by reading it back.

## Classroom exchange

An administrator configures the Google OAuth application once. A learner or teacher can then ask chat to connect Google Classroom, import an assignment or submission, evaluate it against ASFAI learning objectives, save concise evidence privately, and export approved work or grades. Every classroom call includes the provider name, so future adapters can use the same workflow without adding more always-loaded MCP tools.

OAuth tokens and imported student work stay at the local companion boundary. Reusable Google authorization is protected for the current Windows user and restored across chats and restarts until the user explicitly forgets it or revokes ASFAI in their Google Account. Classroom access defaults to read-only; any operation that creates an assignment, attaches or turns in work, or sends a grade is first returned as a preview and requires explicit user confirmation.

## Distribution status

The repository marketplace supports development and team testing. A workspace administrator can publish the installed plugin to selected classroom roles. Universal public-directory submission is a separate release step.

The current packaged local launcher targets the Windows ChatGPT/Codex desktop host. Other desktop platforms need their corresponding runtime launcher before broad public release.
