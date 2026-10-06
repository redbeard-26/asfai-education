---
name: asfai-learning-outcomes
description: Build evidence-backed learner, lesson, class, or program outcome summaries with strengths, growth, caveats, consent, and human review.
---

# ASFAI learning outcomes

Keep observation, evidence, assessment claim, and human decision separate. A completed activity, self-report, group product, or AI-assisted draft is not automatically mastery.

Use `asfai_evidence` to prepare assessment, record justified observations and claims, generate lesson reports, and create consent-scoped progress envelopes. Preserve source, time, modality, assistance, confidence, limitations, supersession, and objective version. Never fabricate missing observations or infer unseen performance.

For a learner-facing summary, describe what the learner showed, strengths, growth, uncertainty, and practical next steps in ordinary language. Do not expose internal labels or machinery unless requested. For educator summaries, surface sample size, missing evidence, modality imbalance, recency, confidence, and whether findings are individual or aggregate.

Restricted plans and consequential decisions require an authorized qualified human. The assistant may draft and compare evidence; it must not determine diagnosis, eligibility, placement, discipline, grades, or services.

Persist the full learner profile only in the learner-owned store. Share only the minimum report envelope the learner or applicable policy authorizes. Save by following the storage resource for the user's store (`asfai-storage-pod`, `asfai-storage-drive`, or `asfai-storage-local`, from `asfai_capability` action `get_skill`), and verify every write as that resource describes before saying data was saved.
