# Sketch2Agent Workflows

Visual workflow builder for neoagents - Create complex workflows by drawing in arrows.app.

## 🎯 Quick Start

### 1. Start the Services

You need **two processes running**:

```bash
# Terminal 1: API Server
python examples/run_sketch2agent_server.py

# Terminal 2: Worker (builds workflows)
python examples/run_worker.py
```

### 2. Create a Workflow

Send arrows.app JSON export to the API:

```bash
curl -X POST http://localhost:8000/api/v1/workflow/create \
  -H "Content-Type: application/json" \
  -d @sketch2agent/workflows/test_simple_workflow.json
```

Response:
```json
{
  "workflow_id": "wf_abc123xyz",
  "status": "pending",
  "message": "Workflow 'Simple Test Workflow' created. Worker will build it shortly.",
  "estimated_time_seconds": 40
}
```

### 3. Check Status

Poll the status endpoint:

```bash
curl http://localhost:8000/api/v1/workflow/status/wf_abc123xyz
```

Wait for `status: "ready"`:
```json
{
  "workflow_id": "wf_abc123xyz",
  "name": "Simple Test Workflow",
  "status": "ready",
  "progress": {
    "total_nodes": 2,
    "completed_nodes": 2,
    "current_task": "Workflow ready!"
  }
}
```

### 4. Chat with the Workflow (Recommended)

**Conversational experience** - just like chatting with an agent:

```bash
curl -X POST http://localhost:8000/api/v1/workflow/wf_abc123xyz/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "My name is Alice",
    "thread_id": "conversation_123"
  }'
```

Response:
```json
{
  "response": "Hello, Alice!",
  "workflow_id": "wf_abc123xyz",
  "thread_id": "conversation_123",
  "execution_id": "exec_def456",
  "execution_time_ms": 1250
}
```

### 4b. Or Execute Directly (API/Automation)

For programmatic use:

```bash
curl -X POST http://localhost:8000/api/v1/workflow/wf_abc123xyz/execute \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "raw_input": "My name is Alice"
    }
  }'
```

Response:
```json
{
  "workflow_id": "wf_abc123xyz",
  "execution_id": "exec_def456",
  "status": "completed",
  "result": {
    "raw_input": "My name is Alice",
    "name": "Alice",
    "greeting": "Hello, Alice!"
  },
  "execution_time_ms": 1250,
  "super_steps": 2
}
```

## 📋 API Endpoints

### Create Workflow
```http
POST /api/v1/workflow/create
Content-Type: application/json

{
  "name": "My Workflow",
  "graph_export": {
    "nodes": [...],
    "relationships": [...]
  },
  "metadata": {
    "created_by": "user@example.com"
  }
}
```

### Get Status
```http
GET /api/v1/workflow/status/{workflow_id}
```

### Chat with Workflow (Conversational)
```http
POST /api/v1/workflow/{workflow_id}/chat
Content-Type: application/json

{
  "message": "Hi, I need help with order #12345",
  "thread_id": "conversation_123",
  "config": {
    "include_full_state": false
  }
}

Response:
{
  "response": "I found your order...",
  "workflow_id": "wf_abc",
  "thread_id": "conversation_123",
  "execution_id": "exec_xyz",
  "execution_time_ms": 1250
}
```

### Execute Workflow (Direct)
```http
POST /api/v1/workflow/{workflow_id}/execute
Content-Type: application/json

{
  "input": {
    "field1": "value1",
    "field2": "value2"
  },
  "thread_id": "optional_thread_id",
  "config": {
    "max_iterations": 25
  }
}
```

## 🏗️ How It Works

### Architecture

```
┌──────────────────┐         ┌──────────────────┐
│   arrows.app     │         │   API Server     │
│   (Frontend)     │────────▶│   routes.py      │
│                  │  JSON   │                  │
└──────────────────┘         └────────┬─────────┘
                                      │ Stores
                                      ▼
                             ┌──────────────────┐
                             │     Neo4j        │
                             │   (Database)     │
                             └────────┬─────────┘
                                      │ Polls
                                      ▼
┌──────────────────┐         ┌──────────────────┐
│   Executor       │◀────────│    Worker        │
│   (Runtime)      │  Ready  │   (Builder)      │
└──────────────────┘         └──────────────────┘
```

### Workflow Building Process

1. **Parser** (`parser.py`) - Analyzes arrows.app JSON
   - Extracts nodes and edges
   - Detects entry/exit points
   - Identifies agent nodes, routers
   - Validates graph structure

2. **Worker** (`worker.py`) - Generates code
   - Polls Neo4j for pending workflows
   - Generates state schema via LLM
   - For each node:
     - **Regular nodes**: LLM generates function
     - **Agent nodes**: Template generates wrapper
   - Stores code in Neo4j
   - Updates status to "ready"

3. **Executor** (`workflow_executor.py`) - Runs workflow
   - Loads workflow from Neo4j
   - Executes node code to create functions
   - Builds StateGraph dynamically
   - Compiles and executes

## 📝 Workflow JSON Format

### Node Structure
```json
{
  "id": "n0",
  "caption": "node_name",
  "properties": {
    "description": "What this node does (natural language)",
    "api_url": "https://api.example.com/endpoint",
    "any_custom_field": "value"
  }
}
```

### Edge Types

| Type | `type` Field | Behavior |
|------|-------------|----------|
| **Execution** | `""` (empty) | Normal flow, sequential or parallel |
| **Conditional** | `"CONDITIONAL"` | Router decides next node |
| **Dependency** | `"DEPENDENCY"` | Child only sees parent output |
| **Tool** | `"HAS_TOOL"` | Agent owns this tool |

### Example: Simple Linear Workflow
```json
{
  "name": "Data Pipeline",
  "graph_export": {
    "nodes": [
      {
        "id": "n0",
        "caption": "fetch_data",
        "properties": {
          "description": "Fetch data from API"
        }
      },
      {
        "id": "n1",
        "caption": "process",
        "properties": {
          "description": "Clean and transform data"
        }
      },
      {
        "id": "n2",
        "caption": "save",
        "properties": {
          "description": "Save to database"
        }
      }
    ],
    "relationships": [
      {"fromId": "n0", "toId": "n1", "type": ""},
      {"fromId": "n1", "toId": "n2", "type": ""}
    ]
  }
}
```

## 🧪 Testing

### Test Parser
```bash
cd sketch2agent/workflows
python test_parser.py
```

### Test Simple Workflow
```bash
# Create
curl -X POST http://localhost:8000/api/v1/workflow/create \
  -H "Content-Type: application/json" \
  -d @sketch2agent/workflows/test_simple_workflow.json

# Get workflow_id from response, then check status
curl http://localhost:8000/api/v1/workflow/status/wf_abc123

# Execute when ready
curl -X POST http://localhost:8000/api/v1/workflow/wf_abc123/execute \
  -H "Content-Type: application/json" \
  -d '{"input": {"raw_input": "Hello World"}}'
```

## 🐛 Troubleshooting

### Workflow stuck in "pending"
- **Check**: Is worker running? (`python examples/run_worker.py`)
- **Check**: Worker logs for errors

### Workflow status "failed"
- **Check**: `GET /workflow/status/{id}` for error messages
- **Check**: Worker logs for detailed traceback
- **Check**: Node descriptions are clear and actionable

### Execution fails
- **Check**: Workflow status is "ready"
- **Check**: Input state matches expected fields
- **Check**: Generated node functions (in Neo4j)

### Common Issues

1. **"Workflow not ready"**
   - Wait for worker to finish building
   - Check status endpoint for progress

2. **"Function X not found"**
   - Node code generation failed
   - Check worker logs
   - Verify node description is clear

3. **"No entry node found"**
   - Workflow must have at least one node with no incoming edges
   - Check graph structure in arrows.app

## 📁 File Structure

```
sketch2agent/workflows/
├── README.md                          # This file
├── IMPLEMENTATION.md                  # Technical design doc
├── parser.py                          # ✅ JSON parser
├── test_parser.py                     # ✅ Parser tests
├── workflow_models.py                 # ✅ Pydantic models
├── workflow_routes.py                 # ✅ API endpoints
├── workflow_generator.py              # ✅ LLM code generation
├── workflow_agent_node_generator.py   # ✅ Agent node templates
├── workflow_executor.py               # ✅ Runtime executor
├── example_workflow.json              # Complex example
└── test_simple_workflow.json          # Simple test case
```

## 🚧 TODO / Limitations

### Not Yet Implemented
- [ ] State schema generation (uses placeholder)
- [ ] Agent node creation (marked as failed)
- [ ] Router function execution (conditional edges)
- [ ] Streaming execution
- [ ] Workflow listing endpoint

### Known Limitations
- Agent nodes always fail (TODO in worker)
- Conditional edges treated as normal edges
- No cycle detection in execution
- No execution history tracking

## 🤝 Contributing

See `IMPLEMENTATION.md` for detailed architecture and design decisions.

### Key Principles
1. **LLM for standard patterns** (API calls, transforms, prompts)
2. **Templates for framework-specific code** (agent nodes)
3. **Reuse existing infrastructure** (agents, tools, workers)
4. **Keep it simple** - Users just draw and describe

---

**Built with ❤️ using neoagents framework**
