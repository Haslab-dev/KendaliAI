# RFC-0016: Long-Term Memory

**Status:** Draft
**Version:** 0.3.4

## Problem

Memory is only embeddings. There's no:
- Structured facts about users
- Preference tracking
- Context from previous sessions
- Learning from completions

## Solution

Build structured long-term memory:

```go
type LongTermMemory struct {
    UserFacts     []UserFact
    Preferences  []Preference
    Context      []ContextItem
    LearnedSkills []LearnedSkill
}

type UserFact struct {
    ID        string
    UserID    string
    Subject   string    // "user", "project", "company"
    Predicate string    // "prefers", "uses", "hates"
    Object    string    // "React", "Bun", "Tailwind"
    Confidence float64  // 0.0 - 1.0
    Source    string    // "conversation", "observation", "explicit"
    CreatedAt time.Time
}

type Preference struct {
    UserID     string
    Category   string    // "framework", "style", "tool"
    Key        string    // "language", "formatting"
    Value      string    // "TypeScript", "prettier"
    Importance float64   // 0.0 - 1.0
}
```

## Memory Examples

```json
{
  "user_id": "user_456",
  "facts": [
    { "predicate": "prefers", "object": "React", "confidence": 0.9, "source": "conversation" },
    { "predicate": "hates", "object": "Redux", "confidence": 0.85, "source": "conversation" },
    { "predicate": "uses", "object": "Bun", "confidence": 0.95, "source": "observation" },
    { "predicate": "project_uses", "object": "Tailwind", "confidence": 1.0, "source": "observation" }
  ],
  "preferences": [
    { "category": "formatting", "key": "indent", "value": "spaces", "importance": 0.7 },
    { "category": "testing", "key": "framework", "value": "vitest", "importance": 0.8 }
  ]
}
```

## Memory Extraction

During task completion, extract facts:

```go
func ExtractMemory(completion *TaskCompletion) []UserFact {
    var facts []UserFact

    // From conversation
    if strings.Contains(completion.Conversation, "I prefer React") {
        facts = append(facts, UserFact{
            Predicate: "prefers",
            Object:    "React",
            Confidence: 0.9,
            Source:    "conversation",
        })
    }

    // From code analysis
    if hasFile(completion.Artifacts, "package.json") {
        deps := parseDependencies(artifacts["package.json"])
        for _, dep := range deps {
            facts = append(facts, UserFact{
                Predicate: "project_uses",
                Object:    dep,
                Confidence: 1.0,
                Source:    "observation",
            })
        }
    }

    return facts
}
```
