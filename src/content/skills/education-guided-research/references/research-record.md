# Portable guided-research record

Keep this record learner-owned and versioned. Use the same structure whether the activity is shown as chat notes, sticky notes, or a flower. It is not an assessment claim or a source-of-truth cache. A source's content remains at its original location.

```json
{
  "schemaVersion": "0.1",
  "id": "learner-generated stable id",
  "status": "in-progress | paused | complete",
  "question": "What the student is trying to find out",
  "lessonRef": "optional lesson and version reference",
  "objectiveIds": [],
  "sourcePolicy": "teacher-approved | teacher-restricted | learner-selected",
  "sources": [
    {
      "id": "source-1",
      "kind": "article | video | book | document | other",
      "title": "Source title",
      "creator": "Known creator or unknown",
      "publishedAt": "known date or omitted",
      "urlOrRef": "stable link or authorized private reference",
      "approval": "teacher-approved | learner-selected | unknown"
    }
  ],
  "notes": [
    {
      "id": "note-1",
      "initialStudentText": "The student's original statement",
      "revisedStudentText": "optional revision in the student's words",
      "sourceIds": ["source-1"],
      "locators": ["page, section, paragraph, or video time range"],
      "supportingExcerpt": "optional brief verified source passage",
      "support": "supported | partial | unsupported | not_checked",
      "corroboration": "corroborated | disputed | not_checked",
      "sourceLimitations": [],
      "relevance": "strong | weak | not_yet_clear",
      "relevanceExplanation": "The student's explanation or omitted",
      "vocabulary": [
        { "term": "important word", "studentMeaning": "their own explanation", "clarification": "optional concise help" }
      ],
      "memoryCue": "The student's short cue or omitted",
      "recallAttempts": ["What the student reconstructed without the full note visible"],
      "assistance": "none | light | substantial | unknown",
      "createdAt": "ISO timestamp",
      "updatedAt": "ISO timestamp"
    }
  ],
  "unresolvedQuestions": [],
  "nextUse": "paragraph planning, essay drafting, or another student-chosen step",
  "updatedAt": "ISO timestamp"
}
```

The pipe-separated strings above name alternatives: choose one value, never store the literal list. Omit optional fields that are unknown. Use a citation only when its locator actually reaches the claimed support; include only a brief excerpt when quoting is permitted. The host assistant must inspect the source; this record's structure cannot prove factual correctness. Keep `support` and `corroboration` separate. Never fill unknown creator, date, locator, or verification status by guessing. Keep only the student work and concise assistance needed for continuity; raw transcripts and copies of source media are unnecessary by default.

For the learning-flower presentation, the central question is the flower center, each note is an outer petal, and `memoryCue` is an inner petal. The teacher or learner may choose a different number of petals. A note can remain partial or disputed; never conceal that state to make the picture look complete.
