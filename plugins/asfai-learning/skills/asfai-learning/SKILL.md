---
name: asfai-learning
description: Teach, learn, assess, or plan lessons with ASFAI while saving owner-controlled progress locally or in a Solid Pod.
---

# ASFAI learning

Use the public ASFAI MCP for learning objectives, lesson guidance, assessment preparation, and portable record construction. Use the private `asfai_personal_storage` tool for actual learner-, teacher-, and classroom-owned storage. The public service must not receive Solid credentials, private signing keys, or complete private profiles.

## Speak naturally

Keep orchestration private. With a learner, state what they are learning and ask the real question. Do not mention an interaction, skill, tool, MCP, workflow, session, rubric, evidence event, assessment claim, telemetry, or similar machinery unless the learner asks how the system works. Do not narrate setup stages. Give feedback in ordinary language about what the learner understands and what to try next.

## Get only the guidance needed

For a new goal, use `asfai_capability` to recommend the relevant capability and install its detailed guidance only when needed. Use `asfai_graph` for objectives and paths, `asfai_lesson` for lessons, and `asfai_evidence` for assessment records. Do not expose private evaluator guidance or answer keys.

## Save without setup instructions

Before relying on personal state, call `asfai_personal_storage` with action `status`.

- If the user wants this device, load the appropriate `learner`, `educator`, or `classroom` document and continue. Local storage is already configured; do not ask them to choose folders or run commands.
- If the user asks for a Solid Pod, obtain the Pod address if it is not known. For a `privatedatapod.com` Pod, use `https://privatedatapod.com/` as the issuer. Call `connect_solid`, show the returned authorization URL as a simple “Connect private storage” link, and ask the user to approve access on the provider page. Never ask them to paste a password, cookie, token, refresh token, client secret, or DPoP key into chat. After approval, check `status` until `isLoggedIn` is true.
- Load before updating. Pass the digest returned by `load` as `expectedDigest` when saving so newer data is not silently overwritten.
- Say that data is saved only when `save` returns `verified: true` after read-back. If storage is unavailable, continue only as unsaved practice and say so plainly.

Record concise learning evidence rather than a bare mastery flag. Avoid unnecessary personal details and verbatim conversation. Share progress with a teacher only after learner approval, using a scoped signed envelope instead of the complete learner profile.
