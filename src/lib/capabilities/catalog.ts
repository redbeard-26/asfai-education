import { createHash } from "node:crypto";
import { z } from "zod";
import { getPriorityCapabilitySpec } from "@/lib/capabilities/priority-capabilities";

export const capabilityAudienceSchema = z.enum(["platform", "educator", "student"]);
export const capabilityModeSchema = z.enum(["one-shot", "interactive", "async-job", "control-plane"]);
export const capabilityRiskSchema = z.enum(["low", "medium", "high", "restricted"]);

export const capabilityDefinitionSchema = z.object({
  id: z.string().regex(/^[PTS]\d{2}$/),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  version: z.string(),
  name: z.string(),
  audience: capabilityAudienceSchema,
  category: z.string(),
  description: z.string(),
  guidance: z.string(),
  mode: capabilityModeSchema,
  risk: capabilityRiskSchema,
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()),
  evaluators: z.array(z.string()).min(1),
  mcp: z.object({
    access: z.enum(["public", "personal", "educator", "district"]),
    mode: capabilityModeSchema,
    entryTool: z.enum([
      "asfai_capability",
      "asfai_graph",
      "asfai_run",
      "asfai_session",
      "asfai_lesson",
      "asfai_evidence",
      "asfai_resource",
      "asfai_storage",
    ]),
    continuationTool: z.enum([
      "asfai_capability",
      "asfai_graph",
      "asfai_run",
      "asfai_session",
      "asfai_lesson",
      "asfai_evidence",
      "asfai_resource",
      "asfai_storage",
    ]).optional(),
    requiredScopes: z.array(z.string()),
    stateOwner: z.enum(["client", "learner-store", "educator-store", "tenant"]),
    sideEffects: z.enum(["none", "draft", "external-write", "consequential"]),
    confirmation: z.enum(["none", "prepare-commit", "human-review"]),
    inputRepresentations: z.array(z.string()).min(1),
    outputRepresentations: z.array(z.string()).min(1),
    externalHandoffs: z.array(z.enum(["oauth", "artifact-view", "game", "physical-performance", "human-signature"])),
    fallback: z.string().min(1),
  }),
});

export type CapabilityDefinition = z.infer<typeof capabilityDefinitionSchema>;

interface CatalogSeed {
  id: string;
  name: string;
  category: string;
  description: string;
  entryTool?: CapabilityDefinition["mcp"]["entryTool"];
  mode?: CapabilityDefinition["mode"];
  risk?: CapabilityDefinition["risk"];
}

const platformSeeds: CatalogSeed[] = [
  { id: "P01", name: "Versioned capability catalog", category: "Platform", description: "Discover, validate, version, tag, and retire educator and student capabilities.", entryTool: "asfai_capability" },
  { id: "P02", name: "Installable workflow guidance", category: "Platform", description: "Deliver versioned ASFAI skills that teach chat hosts to orchestrate capabilities safely.", entryTool: "asfai_capability" },
  { id: "P03", name: "Conversational capability router", category: "Platform", description: "Recommend the appropriate capability or workflow from a plain-language educator goal.", entryTool: "asfai_capability" },
  { id: "P04", name: "Multi-model routing", category: "Platform", description: "Route work through approved providers with validation, budgets, fallbacks, provenance, and evaluations.", mode: "control-plane", risk: "high" },
  { id: "P05", name: "Personalized educator context", category: "Platform", description: "Use explicit, inspectable educator preferences and recent work without silent profiling.", entryTool: "asfai_resource" },
  { id: "P06", name: "Discovery, favorites, recent, and trending", category: "Platform", description: "Search and organize capabilities and history with privacy-preserving discovery metadata.", entryTool: "asfai_capability" },
  { id: "P07", name: "Collections and share links", category: "Platform", description: "Create versioned collections with scoped sharing, forking, provenance, and revocation.", entryTool: "asfai_resource" },
  { id: "P08", name: "Unified history and resource library", category: "Platform", description: "Search, edit, reuse, export, and delete teacher-owned generations, files, and resources.", entryTool: "asfai_resource", mode: "control-plane" },
  { id: "P09", name: "Studio document editing", category: "Platform", description: "Edit versioned document blocks with targeted regeneration, patches, undo, and accessible export.", entryTool: "asfai_resource", mode: "control-plane" },
  { id: "P10", name: "Custom educator and student capabilities", category: "Platform", description: "Build, test, approve, version, publish, share, and roll back typed custom capabilities.", entryTool: "asfai_capability", mode: "control-plane", risk: "high" },
  { id: "P11", name: "Multi-step workflows", category: "Platform", description: "Run resumable, idempotent workflow graphs with checkpoints and human approval gates.", mode: "control-plane", risk: "high" },
  { id: "P12", name: "District Knowledge and RAG", category: "District", description: "Ground capabilities in ACL-scoped, versioned curriculum, rubric, handbook, and policy sources.", mode: "control-plane", risk: "high" },
  { id: "P13", name: "Student Rooms", category: "Classroom", description: "Create and run versioned, teacher-scoped student capability rooms with explicit policies.", mode: "control-plane", risk: "high" },
  { id: "P14", name: "Student access and rostered launch", category: "Classroom", description: "Support pseudonymous codes and optional approved SSO, roster, and LTI launch.", mode: "control-plane", risk: "high" },
  { id: "P15", name: "Teacher activity visibility and room insights", category: "Classroom", description: "Return consented completion and evidence summaries without collecting raw conversations by default.", mode: "control-plane", risk: "high" },
  { id: "P16", name: "Quizzes and formative assessment", category: "Learning Outcomes", description: "Author, assign, deliver, evaluate, and summarize low-stakes objective-aligned quizzes.", entryTool: "asfai_session", mode: "interactive", risk: "high" },
  { id: "P17", name: "Class Writing Feedback", category: "Learning Outcomes", description: "Prepare, review, approve, return, and export rubric-grounded writing feedback at scale.", mode: "async-job", risk: "restricted" },
  { id: "P18", name: "File and web-content ingestion", category: "Resources", description: "Safely ingest classroom files and permitted web sources with citations and retention controls.", entryTool: "asfai_resource", mode: "async-job", risk: "high" },
  { id: "P19", name: "Export and render pipeline", category: "Resources", description: "Render accessible HTML, Markdown, PDF, DOCX, PPTX, and connected document formats.", entryTool: "asfai_resource", mode: "async-job" },
  { id: "P20", name: "Multimodal generation", category: "Resources", description: "Generate governed image and audio artifacts with transcripts, alt text, licensing, and provenance.", entryTool: "asfai_resource", mode: "async-job", risk: "high" },
  { id: "P21", name: "Standards, grade, and locale grounding", category: "Platform", description: "Align resources to sourced standards versions, objectives, grade bands, languages, and locales.", entryTool: "asfai_graph", risk: "high" },
  { id: "P22", name: "Student safety and moderation", category: "District", description: "Apply age-aware input/output safeguards with reviewable alerts, escalation, and appeal.", mode: "control-plane", risk: "restricted" },
  { id: "P23", name: "District governance and branding", category: "District", description: "Control organization roles, sites, capability access, rollout, policy, and branding.", mode: "control-plane", risk: "high" },
  { id: "P24", name: "District dashboards and analytics", category: "District", description: "Query privacy-thresholded adoption, reliability, outcomes, safety, and accessibility metrics.", mode: "control-plane", risk: "high" },
  { id: "P25", name: "Identity and integrations", category: "District", description: "Manage least-scope connections to SSO, roster, LMS, SIS, drive, and document providers.", mode: "control-plane", risk: "restricted" },
  { id: "P26", name: "Privacy, security, and records governance", category: "District", description: "Enforce access, audit, encryption, retention, correction, export, deletion, and incident controls.", mode: "control-plane", risk: "restricted" },
  { id: "P27", name: "AI literacy and professional learning", category: "Professional Learning", description: "Deliver versioned courses and resources for students, educators, administrators, and families.", entryTool: "asfai_session", mode: "interactive" },
  { id: "P28", name: "Ready-made and community resources", category: "Resources", description: "Discover, preview, fork, license, moderate, and retire public education resources.", entryTool: "asfai_resource", risk: "high" },
  { id: "P29", name: "Accessibility and internationalization", category: "Platform", description: "Provide accessible, multilingual, locale-aware representations and non-web fallbacks.", risk: "high" },
  { id: "P30", name: "Human review and evaluations", category: "Platform", description: "Run capability evaluations, corrections, approvals, comparisons, release gates, and rollbacks.", mode: "control-plane", risk: "high" },
  { id: "P31", name: "Labs and staged experiments", category: "District", description: "Operate explicit, reversible, evaluated feature experiments with kill switches.", mode: "control-plane", risk: "high" },
  { id: "P32", name: "Learning Outcomes Module", category: "Learning Outcomes", description: "Unify evidence-backed strengths, growth, celebrations, caveats, and next steps across modalities.", entryTool: "asfai_evidence", risk: "restricted" },
  { id: "P33", name: "Educator Guidance", category: "Professional Learning", description: "Provide cited, district-grounded instructional and responsible-AI guidance through chat.", entryTool: "asfai_session", mode: "interactive", risk: "high" },
];

const educatorRows: Array<[string, string, string, string]> = [
  ["T01", "Chat with Docs", "Admin", "Upload a document and have a source-cited conversation about it."],
  ["T02", "Class Newsletter", "Admin", "Draft an accessible newsletter for learners and families."],
  ["T03", "Custom Chatbot", "Admin", "Create and test a custom chatbot from explicit criteria and sources."],
  ["T04", "Difficult Conversations", "Admin", "Prepare a respectful, fact-based conversation and possible responses."],
  ["T05", "Email Family", "Admin", "Draft a privacy-conscious family email from verified facts."],
  ["T06", "Email Responder", "Admin", "Draft a professional response to an untrusted incoming email."],
  ["T07", "Gift Suggestion", "Admin", "Suggest appropriate gifts within stated interests, budget, and policy."],
  ["T08", "Letter of Recommendation", "Admin", "Draft an evidence-backed recommendation without inventing achievements."],
  ["T09", "PD Planner", "Admin", "Create outcomes, agenda, practice, accessibility, follow-up, and evaluation for professional learning."],
  ["T10", "Professional Email", "Admin", "Draft a clear professional email with confirmed commitments and next action."],
  ["T11", "Report Card Comments", "Admin", "Draft evidence-linked strengths, growth, and next steps for teacher approval."],
  ["T12", "Social Media Post", "Admin", "Draft an accessible, public-safe social post without publishing it."],
  ["T13", "Survey Creator", "Admin", "Create an accessible, purpose-limited survey and data plan."],
  ["T14", "Teacher Observations", "Admin", "Turn objective observation notes into reviewable feedback without employment decisions."],
  ["T15", "Team Builder / Ice Breaker", "Admin", "Create an inclusive activity with opt-outs and accessibility alternatives."],
  ["T16", "Thank You Note", "Admin", "Draft a concise note from genuine, confirmed details."],
  ["T17", "Prompt Assistant", "Communication", "Teach and improve prompting through goal, context, constraints, privacy, and evaluation."],
  ["T18", "Text Proofreader", "Communication", "Suggest grammar and clarity edits as an accept-or-reject diff that preserves voice."],
  ["T19", "Text Summarizer", "Communication", "Create a traceable summary at the requested length without unsupported facts."],
  ["T20", "Text Translator", "Communication", "Translate with locale, register, glossary, ambiguity flags, and human-review guidance."],
  ["T21", "DOK Questions", "Feedback & Assessment", "Generate and validate questions across all four Depth of Knowledge levels."],
  ["T22", "Math Story Word Problems", "Feedback & Assessment", "Generate grade-appropriate problems with deterministically checked solutions."],
  ["T23", "Multiple Choice Quiz / Assessment", "Feedback & Assessment", "Generate objective-aligned items with validated answers and misconception-linked distractors."],
  ["T24", "Rubric Generator", "Feedback & Assessment", "Create an editable objective-aligned rubric with observable performance descriptors."],
  ["T25", "SAT ELA Custom Practice", "Feedback & Assessment", "Create original unofficial SAT ELA domain practice from a public blueprint."],
  ["T26", "SAT ELA Practice Test", "Feedback & Assessment", "Assemble an original unofficial SAT ELA practice test with explanations."],
  ["T27", "SAT Math Practice", "Feedback & Assessment", "Create original unofficial SAT math practice with checked solutions."],
  ["T28", "Text Dependent Questions", "Feedback & Assessment", "Generate questions whose answers are supported by cited source spans."],
  ["T29", "Three Dimensional Science Assessments", "Feedback & Assessment", "Draft NGSS three-dimensional phenomena-centered assessment tasks."],
  ["T30", "Writing Feedback", "Feedback & Assessment", "Draft rubric-grounded, passage-cited writing feedback under educator control."],
  ["T31", "Academic Content", "Instructional Materials", "Create source-backed, grade-appropriate instructional content and examples."],
  ["T32", "AI Resistant Assignments", "Instructional Materials", "Redesign assignments for process evidence, transfer, reflection, and transparent AI use."],
  ["T33", "Data Table Analysis", "Instructional Materials", "Create or analyze an accessible table with checked calculations and questions."],
  ["T34", "Informational Texts", "Instructional Materials", "Create factual, cited informational text at a selected grade and structure."],
  ["T35", "Math Spiral Review", "Instructional Materials", "Build validated spaced and interleaved practice across selected objectives."],
  ["T36", "Multi-Step Assignment", "Instructional Materials", "Create a staged assignment with checkpoints, scaffolds, reflection, and evidence."],
  ["T37", "Presentation Generator", "Instructional Materials", "Create an editable, cited, accessible presentation outline and slide artifact."],
  ["T38", "Text Analysis Assignment", "Instructional Materials", "Package licensed text, questions, writing prompt, rubric, and scaffolds."],
  ["T39", "Vocabulary Based Texts", "Instructional Materials", "Create coherent text using target vocabulary in meaningful context."],
  ["T40", "Vocabulary List Generator", "Instructional Materials", "Select high-value terms with definitions, examples, morphology, and grade tags."],
  ["T41", "Worksheet Generator", "Instructional Materials", "Create editable, accessible worksheet variants with answer keys."],
  ["T42", "YouTube Video Questions", "Instructional Materials", "Create timestamped questions from an available permitted transcript."],
  ["T43", "YouTube Video Summarizer", "Instructional Materials", "Create a timestamped summary from an available permitted transcript."],
  ["T44", "5E Model Lesson Plan", "Planning", "Create an Engage, Explore, Explain, Elaborate, and Evaluate lesson."],
  ["T45", "Coach's Sports Practice", "Planning", "Draft an age-appropriate practice plan subject to human safety review."],
  ["T46", "Group Work Generator", "Planning", "Design inclusive group roles, interdependence, checkpoints, and individual evidence."],
  ["T47", "Lesson Hook", "Planning", "Suggest brief, relevant, accessible lesson openings and transitions."],
  ["T48", "Lesson Plan", "Planning", "Create a complete evidence-centered ASFAI lesson package."],
  ["T49", "ASFAI for Students Ideas", "Planning", "Recommend appropriate student capabilities with pedagogy and privacy tradeoffs."],
  ["T50", "Project Based Learning", "Planning", "Create a project-based lesson with milestones, critique, artifacts, and evidence."],
  ["T51", "Science Labs", "Planning", "Draft a standards-aligned lab subject to educator hazard and safety approval."],
  ["T52", "SEL Lesson Plan", "Planning", "Draft inclusive SEL learning with opt-outs and qualified support boundaries."],
  ["T53", "Standards Unpacker", "Planning", "Interpret a sourced standard into knowledge, skills, practices, prerequisites, and evidence."],
  ["T54", "Syllabus Generator", "Planning", "Draft a syllabus from verified institutional inputs and unresolved-policy markers."],
  ["T55", "Tool Recommendations", "Planning", "Recommend ASFAI capabilities with rationale, data needs, risk, and alternatives."],
  ["T56", "Unit Plan Generator", "Planning", "Create a multi-week objective map and sequence of versioned lessons."],
  ["T57", "Educational Podcast Generator", "Student Engagement", "Create a cited educational podcast script, transcript, audio plan, and cover-art plan."],
  ["T58", "Educational Song Generator", "Student Engagement", "Create original curriculum-aligned song materials with licensing and accessibility controls."],
  ["T59", "Image Generator", "Student Engagement", "Prepare a safe instructional image generation or edit request with alt text and provenance."],
  ["T60", "Jeopardy Review Game", "Student Engagement", "Create a review board with validated answers and objective-level practice evidence."],
  ["T61", "Make it Relevant!", "Student Engagement", "Connect an objective to explicitly supplied interests without profiling."],
  ["T62", "Quote of the Day", "Student Engagement", "Suggest verified quotations with context and a discussion prompt."],
  ["T63", "Real World Connections", "Student Engagement", "Create sourced real-world applications and transfer questions."],
  ["T64", "Song Generator", "Student Engagement", "Create original lyrics without copying protected lyrics or imitating living artists."],
  ["T65", "Teacher Jokes", "Student Engagement", "Create inclusive, age-appropriate original classroom jokes."],
  ["T66", "Tongue Twisters", "Student Engagement", "Create pronounceable, age- and language-appropriate tongue twisters."],
  ["T67", "504 Plan Generator", "Student Support", "Prepare a restricted draft for a qualified team without eligibility decisions."],
  ["T68", "Accommodation Suggestions", "Student Support", "Suggest barrier-focused supports without diagnosis or formal eligibility decisions."],
  ["T69", "Advanced Learning Plan", "Student Support", "Prepare a restricted strengths-and-goals draft for team approval."],
  ["T70", "Assignment Scaffolder", "Student Support", "Break an assignment into supports while preserving its cognitive demand."],
  ["T71", "Behavior Intervention Suggestions", "Student Support", "Offer tentative supportive strategies from objective observations for trained review."],
  ["T72", "BIP Generator", "Student Support", "Prepare a restricted behavior-plan draft for multidisciplinary approval."],
  ["T73", "Choice Board", "Student Support", "Create equivalent UDL choices with common objectives and rigor."],
  ["T74", "Classroom Management", "Student Support", "Suggest preventive, relationship-centered classroom strategies and observation plans."],
  ["T75", "Clear Directions", "Student Support", "Rewrite directions as concise actions, criteria, examples, and checks."],
  ["T76", "Common Misconceptions", "Student Support", "Identify reviewed misconceptions, diagnostic prompts, and non-shaming responses."],
  ["T77", "Conceptual Understanding", "Student Support", "Create representations, analogies, counterexamples, and transfer tasks."],
  ["T78", "Decodable Texts", "Student Support", "Create text constrained by an explicit phonics scope and decodability checks."],
  ["T79", "Exemplar & Non-Exemplar", "Student Support", "Create annotated synthetic examples at multiple rubric levels."],
  ["T80", "IEP Generator", "Student Support", "Prepare a restricted IEP draft for qualified multidisciplinary approval."],
  ["T81", "Multiple Explanations", "Student Support", "Explain a concept accurately through distinct representations and analogy limits."],
  ["T82", "Restorative Reflection", "Student Support", "Create voluntary, non-coercive restorative prompts with adult support paths."],
  ["T83", "Sentence Starters", "Student Support", "Offer varied, fadeable starters without completing the learner's reasoning."],
  ["T84", "Social Stories", "Student Support", "Draft a respectful social story for caregiver or educator review."],
  ["T85", "Support Goals Creator", "Student Support", "Draft observable support goals and progress measures for team review."],
  ["T86", "Text Leveler", "Student Support", "Adapt text while preserving meaning, facts, citations, and access to the original."],
  ["T87", "Text Rewriter", "Student Support", "Rewrite by explicit criteria with a fidelity check and side-by-side diff."],
  ["T88", "Text Scaffolder", "Student Support", "Add toggleable reading supports without replacing the original text."],
];

const studentRows: Array<[string, string, string, string]> = [
  ["S01", "AI Learning Assistant", "Chatbots", "Use a Socratic coach for a selected learning goal."],
  ["S02", "AI Literacy Bot", "Chatbots", "Learn how AI works, its limitations, privacy, verification, bias, and attribution."],
  ["S03", "AI Resource Bot", "Chatbots", "Ask questions against teacher-approved, cited classroom sources."],
  ["S04", "AI Tutor", "Chatbots", "Receive prerequisite-aware teaching, graduated hints, practice, and transfer checks."],
  ["S05", "Character Chatbot", "Chatbots", "Explore a sourced historical or literary role-play with simulation labels."],
  ["S06", "Chat with Docs", "Chatbots", "Ask source-cited questions about an approved document."],
  ["S07", "Coding Assistant", "Chatbots", "Learn to diagnose and test code through progressively useful hints."],
  ["S08", "College & Career Counselor", "Chatbots", "Explore cited pathways and questions with clear human-counselor boundaries."],
  ["S09", "Custom Chatbot", "Chatbots", "Use a teacher-approved custom chatbot with visible purpose and boundaries."],
  ["S10", "Debate Partner", "Chatbots", "Practice claims, evidence, counterarguments, perspective switching, and revision."],
  ["S11", "Language Tutor", "Chatbots", "Practice a selected language with adjustable correction and cultural context."],
  ["S12", "Research Assistant", "Chatbots", "Plan research, find credible sources, verify claims, cite, and synthesize."],
  ["S13", "Standards Based Chatbot", "Chatbots", "Learn and demonstrate a selected versioned standard or objective."],
  ["S14", "Student Chatbot Builder", "Chatbots", "Design, test, revise, and seek approval for a safe custom chatbot."],
  ["S15", "Student Support Chatbot", "Chatbots", "Receive approved academic and navigation support with trusted-adult escalation."],
  ["S16", "Study Bot", "Chatbots", "Build and use a spaced, interleaved study plan from selected goals."],
  ["S17", "Writing Feedback", "Feedback", "Receive passage-cited revision feedback while preserving authorship and voice."],
  ["S18", "Literary Devices", "Learning Support", "Learn, identify, create, and revise examples of literary devices."],
  ["S19", "Multiple Explanations", "Learning Support", "Try distinct explanations and representations for a confusing concept."],
  ["S20", "Social Stories", "Learning Support", "Use an approved respectful scenario preview with choices and supports."],
  ["S21", "Step by Step", "Learning Support", "Work through a task in progressive steps without outsourcing assessed reasoning."],
  ["S22", "Study Habits", "Learning Support", "Create, try, and review a realistic evidence-based study routine."],
  ["S23", "Text Leveler", "Learning Support", "Adapt selected text privately while retaining the original and key meaning."],
  ["S24", "Math Review", "Review & Assessment", "Practice validated math with hints, explanations, and assistance-aware evidence."],
  ["S25", "Quiz Me", "Review & Assessment", "Answer one adaptive question at a time and receive explanatory feedback."],
  ["S26", "SAT ELA Practice Test", "Review & Assessment", "Take an accessible original unofficial practice test with explanations."],
  ["S27", "5 Questions", "Student Engagement", "Develop an idea through five progressively deeper questions."],
  ["S28", "Book Suggestions", "Student Engagement", "Find verified books from interests and reading preferences the learner supplies."],
  ["S29", "Conceptual Understanding", "Student Engagement", "Explore representations and transfer questions for a selected concept."],
  ["S30", "Create a Skit", "Student Engagement", "Plan and revise an inclusive skit with accessible performance alternatives."],
  ["S31", "Expand on My Idea", "Student Engagement", "Develop an idea while preserving and labeling the learner's contributions."],
  ["S32", "Idea Generator", "Student Engagement", "Generate, compare, combine, and justify possible starting ideas."],
  ["S33", "Image Generator", "Student Engagement", "Prepare a safe image request with privacy, provenance, and alt text."],
  ["S34", "Joke Creator", "Student Engagement", "Create inclusive, age-appropriate original jokes."],
  ["S35", "Make it Relevant", "Student Engagement", "Connect learning to interests the learner explicitly chooses to share."],
  ["S36", "Podcast Outline", "Student Engagement", "Plan a sourced podcast structure, transcript, credits, and timing."],
  ["S37", "Rap Battle", "Student Engagement", "Compare ideas through sourced, respectful, original lyrics and reflection."],
  ["S38", "Real World Connections", "Student Engagement", "Apply learning to sourced real-world settings without forced disclosure."],
  ["S39", "Song Generator", "Student Engagement", "Create original learning lyrics with clear authorship and copyright boundaries."],
  ["S40", "Tongue Twisters", "Student Engagement", "Practice selected sounds without scoring accents or speech differences."],
  ["S41", "Content Creator", "Task Support", "Create a learning aid with citations and transparent AI contribution."],
  ["S42", "Data Collection Table", "Task Support", "Design an accessible blank table without fabricating observations."],
  ["S43", "Email Writer", "Task Support", "Draft and review a respectful school email without sending it."],
  ["S44", "Informational Texts", "Task Support", "Create cited learning text without disguising it as learner authorship."],
  ["S45", "Prompt Assistant", "Task Support", "Improve prompts while learning privacy, verification, and assignment boundaries."],
  ["S46", "Sentence Starters", "Task Support", "Choose fadeable starters without having the substantive response completed."],
  ["S47", "Text Proofreader", "Task Support", "Review suggested edits as a diff and keep control of the original."],
  ["S48", "Text Rewriter", "Task Support", "Review a transparent rewrite and preserve accurate authorship evidence."],
  ["S49", "Text Summarizer", "Task Support", "Practice summarizing, compare evidence, and cite source passages."],
  ["S50", "Text Translator", "Task Support", "Translate with ambiguity flags and consequential-use review."],
  ["S51", "Thank You Note", "Task Support", "Draft a genuine note while preserving the learner's voice."],
];

const restrictedEducator = new Set(["T11", "T14", "T51", "T52", "T67", "T68", "T69", "T71", "T72", "T80", "T82", "T84", "T85"]);
const highEducator = new Set(["T01", "T03", "T05", "T08", "T12", "T13", "T20", "T21", "T23", "T24", "T25", "T26", "T27", "T29", "T30", "T32", "T35", "T37", "T38", "T41", "T42", "T43", "T44", "T45", "T48", "T50", "T53", "T54", "T56", "T57", "T58", "T59", "T60", "T70", "T73", "T74", "T76", "T77", "T78", "T79", "T86", "T88"]);
const restrictedStudent = new Set(["S08", "S15", "S20"]);
const highStudent = new Set(["S01", "S03", "S04", "S06", "S07", "S09", "S10", "S11", "S12", "S13", "S14", "S16", "S17", "S21", "S23", "S24", "S25", "S26", "S29", "S30", "S33", "S37", "S41", "S42", "S43", "S44", "S47", "S48", "S49", "S50"]);
const interactiveStudent = new Set(["S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08", "S09", "S10", "S11", "S12", "S13", "S14", "S15", "S16", "S17", "S18", "S19", "S20", "S21", "S22", "S24", "S25", "S26", "S27", "S29"]);

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function defaultGuidance(audience: CapabilityDefinition["audience"], description: string, risk: CapabilityDefinition["risk"]) {
  const audienceRule = audience === "student"
    ? "Speak only in age-appropriate learner language. Ask the real content question, coach thinking before giving answers, and never mention MCP, skills, workflows, rubrics, evidence records, claims, telemetry, or orchestration."
    : "Ask only for information that materially changes the draft. Return an editable, accessible result with sources, assumptions, provenance, and a clear review step; never publish, send, grade, or alter an external record automatically.";
  const evidenceRule = audience === "student"
    ? "If this is aligned to a lesson objective, distinguish learner work from AI assistance and offer only justified evidence candidates for learner-approved persistence."
    : "When learner work is involved, separate observation, evidence, assessment claim, and human decision; never infer a bare mastery state.";
  const restrictedRule = risk === "restricted"
    ? "This is a restricted drafting/support capability. Require an authorized qualified human to review and approve every consequential conclusion or action. Do not determine diagnosis, eligibility, placement, discipline, employment, or crisis response."
    : "";
  return [`Purpose: ${description}`, audienceRule, evidenceRule, restrictedRule].filter(Boolean).join(" ");
}

function fromSeed(seed: CatalogSeed, audience: CapabilityDefinition["audience"]): CapabilityDefinition {
  const risk = seed.risk ?? "medium";
  const mode = seed.mode ?? "one-shot";
  const entryTool = seed.entryTool ?? (mode === "interactive" ? "asfai_session" : "asfai_run");
  const access = audience === "platform" && seed.category === "District"
    ? "district"
    : audience === "platform" && ["Classroom", "Learning Outcomes"].includes(seed.category)
      ? "educator"
      : audience === "educator"
        ? "educator"
        : audience === "student"
          ? "personal"
          : "public";
  const stateOwner = access === "district" ? "tenant" : access === "educator" ? "educator-store" : access === "personal" ? "learner-store" : "client";
  const requiredScopes = access === "district" ? ["district:admin"] : access === "educator" ? ["educator:workspace"] : access === "personal" ? ["learner:own"] : [];
  const mediaOutput = /image|podcast|song|presentation|audio/i.test(seed.name);
  const externalHandoffs = seed.id === "P25" ? ["oauth" as const] : seed.id === "P13" ? ["game" as const] : mediaOutput ? ["artifact-view" as const] : [];
  const priority = getPriorityCapabilitySpec(seed.id);
  const inputSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["request"],
    properties: {
      request: { type: "string", minLength: 1, maxLength: 12000 },
      content: {},
      audience: { type: "string" },
      gradeBand: { type: "string" },
      locale: { type: "string" },
      objectiveIds: { type: "array", items: { type: "string" }, maxItems: 100 },
      sourceRefs: { type: "array", items: { type: "string" }, maxItems: 100 },
      constraints: { type: "array", items: { type: "string" }, maxItems: 100 },
      representation: { type: "string", enum: ["structured", "text", "html", "markdown", "document", "slides", "audio", "image"] },
    },
  };
  const outputSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["result", "assumptions", "provenance", "reviewStatus"],
    properties: {
      result: {},
      assumptions: { type: "array", items: { type: "string" } },
      sourceLimitations: { type: "array", items: { type: "string" } },
      accessibilityNotes: { type: "array", items: { type: "string" } },
      provenance: { type: "object" },
      reviewStatus: { type: "string", enum: ["draft", "human-review-required", "ready-for-confirmation"] },
    },
  };
  return capabilityDefinitionSchema.parse({
    id: seed.id,
    slug: slugify(seed.name),
    version: priority ? "1.1.0" : "1.0.0",
    name: seed.name,
    audience,
    category: seed.category,
    description: seed.description,
    guidance: priority?.guidance ?? defaultGuidance(audience, seed.description, risk),
    mode,
    risk,
    inputSchema: priority?.inputSchema ?? inputSchema,
    outputSchema: priority?.outputSchema ?? outputSchema,
    evaluators: priority?.evaluators ?? [
      "schema",
      "factual-support-and-source-limitations",
      "accessibility-and-non-web-fallback",
      "privacy-and-age-appropriateness",
      ...(audience === "student" ? ["natural-learner-language", "assistance-attribution"] : ["editable-output-and-human-control"]),
      ...(risk === "restricted" ? ["qualified-human-review"] : []),
    ],
    mcp: {
      access,
      mode,
      entryTool,
      continuationTool: mode === "interactive" ? "asfai_session" : mode === "async-job" ? "asfai_resource" : undefined,
      requiredScopes,
      stateOwner,
      sideEffects: risk === "restricted" ? "consequential" : mode === "control-plane" ? "external-write" : audience === "platform" ? "none" : "draft",
      confirmation: risk === "restricted" ? "human-review" : mode === "control-plane" ? "prepare-commit" : "none",
      inputRepresentations: ["structured", "text", "resource-reference"],
      outputRepresentations: mediaOutput ? ["structured", "text", "artifact-resource", "accessible-alternative"] : ["structured", "text", "accessible-alternative"],
      externalHandoffs,
      fallback: mediaOutput
        ? "Return a complete text plan, transcript or description and accessibility metadata through MCP when the media provider or viewer is unavailable."
        : "Return structured data and a complete text representation through MCP; no ASFAI webpage is required.",
    },
  });
}

const educatorSeeds: CatalogSeed[] = educatorRows.map(([id, name, category, description]) => ({
  id,
  name,
  category,
  description,
  mode: name === "Chat with Docs" || name === "Custom Chatbot" ? "interactive" : name.includes("Podcast") || name.includes("Song") || name === "Image Generator" || name === "Presentation Generator" ? "async-job" : "one-shot",
  risk: restrictedEducator.has(id) ? "restricted" : highEducator.has(id) ? "high" : "medium",
}));

const studentSeeds: CatalogSeed[] = studentRows.map(([id, name, category, description]) => ({
  id,
  name,
  category,
  description,
  mode: interactiveStudent.has(id) ? "interactive" : name === "Image Generator" ? "async-job" : "one-shot",
  risk: restrictedStudent.has(id) ? "restricted" : highStudent.has(id) ? "high" : "medium",
}));

export const CAPABILITIES = [
  ...platformSeeds.map((seed) => fromSeed(seed, "platform")),
  ...educatorSeeds.map((seed) => fromSeed(seed, "educator")),
  ...studentSeeds.map((seed) => fromSeed(seed, "student")),
] satisfies CapabilityDefinition[];

const byId = new Map(CAPABILITIES.map((item) => [item.id.toLowerCase(), item]));
const bySlug = new Map(CAPABILITIES.map((item) => [`${item.audience}:${item.slug}`, item]));

export const CAPABILITY_CATALOG_DIGEST = createHash("sha256")
  .update(JSON.stringify(CAPABILITIES))
  .digest("hex");

export function getCapability(idOrSlug: string, audience?: CapabilityDefinition["audience"]) {
  const normalized = idOrSlug.trim().toLowerCase();
  if (byId.has(normalized)) return byId.get(normalized);
  if (audience) return bySlug.get(`${audience}:${slugify(normalized)}`);
  return CAPABILITIES.find((item) => item.slug === slugify(normalized));
}

export function searchCapabilities(input: {
  query?: string;
  audience?: CapabilityDefinition["audience"];
  category?: string;
  mode?: CapabilityDefinition["mode"];
  risk?: CapabilityDefinition["risk"];
  limit?: number;
}) {
  const query = input.query?.trim().toLowerCase() ?? "";
  const terms = query.split(/\s+/).filter(Boolean);
  return CAPABILITIES.filter((item) => {
    if (input.audience && item.audience !== input.audience) return false;
    if (input.category && item.category.toLowerCase() !== input.category.toLowerCase()) return false;
    if (input.mode && item.mode !== input.mode) return false;
    if (input.risk && item.risk !== input.risk) return false;
    const haystack = `${item.id} ${item.name} ${item.slug} ${item.category} ${item.description}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  }).slice(0, Math.min(Math.max(input.limit ?? 25, 1), 100));
}

export function capabilityCounts() {
  const count = (audience: CapabilityDefinition["audience"]) => CAPABILITIES.filter((item) => item.audience === audience).length;
  return { total: CAPABILITIES.length, platform: count("platform"), educator: count("educator"), student: count("student") };
}
