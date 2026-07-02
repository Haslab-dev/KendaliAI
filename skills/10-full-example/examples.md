# KSP Full Example

Demonstrates all KSP capabilities in one skill.

## Examples

### 1. Basic usage
```
User: "Show me the full example"
↓
Returns overview of all KSP features
```

### 2. Tool execution
```
User: "Build the project"
↓
Runs tools/build.sh
↓
Returns build output
```

### 3. Multi-tool workflow
```
User: "Run full workflow"
↓
pre_run hook
↓
build → test → deploy
↓
post_run hook
↓
Return results
```

### 4. Resource loading
```
User: "Show invoice template"
↓
Loads resources/templates/invoice.md
↓
Returns formatted template
```

### 5. MCP usage
```
User: "Search for KSP documentation"
↓
Calls web-search MCP
↓
Returns search results
```

### 6. Memory context
```
User: "Remember my project is called AwesomeApp"
↓
Stores in memory
↓
User: "What's my project called?"
↓
Retrieves from memory
↓
"AwesomeApp"
```
