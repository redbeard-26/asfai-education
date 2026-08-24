# ASFAI Learning plugin

This plugin packages the public ASFAI Education MCP, the private personal-storage MCP, and one compact routing skill. Students and teachers do not clone a repository, install Node packages, edit MCP settings, or choose filesystem paths.

## Learner experience

1. Install **ASFAI Learning** from the plugin directory.
2. Start a chat and say, “Connect my private Pod,” or begin a lesson and keep progress on this device.
3. For a Pod, approve access on the Pod provider page and return to chat.

The private MCP runs on the learner's computer. Solid credentials and private signing keys never pass through the public AWS MCP. The local fallback writes under the learner's profile and verifies every save by reading it back.

## Distribution status

The repository marketplace supports development and team testing. A workspace administrator can publish the installed plugin to selected classroom roles. Universal public-directory submission is a separate release step.

The current packaged local launcher targets the Windows ChatGPT/Codex desktop host. Other desktop platforms need their corresponding runtime launcher before broad public release.
