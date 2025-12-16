# Frontend Integration Guide - Workflow Chat

**For Frontend Claude: This is your complete API reference for workflow integration.**

---

## 🎯 Overview

Build a **conversational workflow chat UI** - exactly like the agent chat experience.

User flow:
1. User draws workflow in arrows.app
2. Clicks "Export Workflow"
3. Backend builds it (shows progress)
4. User chats with workflow (like chatting with agent)

---

## 📡 API Endpoints

### Base URL
```
http://localhost:8000/api/v1/workflow
```

---

## 1️⃣ Create Workflow

**Endpoint:** `POST /create`

**Request:**
```json
{
  "name": "Customer Support Workflow",
  "graph_export": {
    "nodes": [...],           // From arrows.app export
    "relationships": [...]    // From arrows.app export
  },
  "metadata": {
    "created_by": "user@example.com"  // Optional
  }
}
```

**Response:**
```json
{
  "workflow_id": "wf_abc123xyz",
  "status": "pending",
  "message": "Workflow created. Worker will build it shortly.",
  "estimated_time_seconds": 40
}
```

**Frontend Action:**
- Get `workflow_id` from response
- Start polling status endpoint
- Show "Building workflow..." loading state

---

## 2️⃣ Poll Status

**Endpoint:** `GET /status/{workflow_id}`

**Response:**
```json
{
  "workflow_id": "wf_abc123xyz",
  "name": "Customer Support Workflow",
  "status": "ready",         // "pending" | "building" | "ready" | "failed"
  "progress": {
    "total_nodes": 5,
    "completed_nodes": 5,
    "current_task": "Workflow ready!"
  },
  "nodes_built": [
    {
      "node_id": "n0",
      "name": "parse_input",
      "status": "ready"
    }
  ],
  "error": null
}
```

**Frontend Action:**
- Poll every 2 seconds
- Show progress: "Building... 3/5 nodes"
- When `status === "ready"`: Show chat interface
- When `status === "failed"`: Show error

---

## 3️⃣ Chat with Workflow ⭐

**Endpoint:** `POST /{workflow_id}/chat`

**Request:**
```json
{
  "message": "Hi, I need help with order #12345",
  "thread_id": "conversation_123"  // Optional, for multi-turn
}
```

**Response:**
```json
{
  "response": "I found your order #12345. It was shipped yesterday.",
  "workflow_id": "wf_abc123xyz",
  "thread_id": "conversation_123",
  "execution_id": "exec_def456",
  "execution_time_ms": 1250
}
```

**Frontend Action:**
- Display `response` as workflow's message
- Same UI as agent chat
- Use same `thread_id` for follow-up messages

---

## 🎨 UI Components Needed

### 1. Export Button
```jsx
<Button onClick={handleExportWorkflow}>
  Export Workflow
</Button>
```

**On click:**
```javascript
const arrowsExport = arrows.app.export();

const response = await fetch('/api/v1/workflow/create', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    name: workflowName,
    graph_export: arrowsExport
  })
});

const {workflow_id} = await response.json();
// Start polling...
```

---

### 2. Building Progress UI

```jsx
<Card>
  <Progress value={3} max={5} />
  <Text>Building workflow... 3/5 nodes complete</Text>
  <Text>Current: Generating parse_input function</Text>
</Card>
```

**Update from polling:**
```javascript
const status = await fetch(`/api/v1/workflow/status/${workflow_id}`);
const {progress} = await status.json();

// Update UI with:
// - progress.completed_nodes / progress.total_nodes
// - progress.current_task
```

---

### 3. Chat Interface

**Exactly like agent chat:**

```jsx
<ChatInterface
  title="Customer Support Workflow"
  workflowId={workflow_id}
  onSendMessage={handleSendMessage}
/>
```

**On send:**
```javascript
async function handleSendMessage(message) {
  const response = await fetch(`/api/v1/workflow/${workflow_id}/chat`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      message,
      thread_id: currentThreadId
    })
  });

  const {response: workflowResponse} = await response.json();

  // Display workflowResponse in chat
  addMessage({
    role: 'assistant',
    content: workflowResponse
  });
}
```

---

## 🔄 Complete Flow Example

```javascript
// Step 1: Export workflow
async function exportWorkflow() {
  const arrowsExport = arrows.app.export();

  const res = await fetch('/api/v1/workflow/create', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      name: 'My Workflow',
      graph_export: arrowsExport
    })
  });

  const {workflow_id} = await res.json();

  // Step 2: Poll until ready
  await pollUntilReady(workflow_id);

  // Step 3: Open chat interface
  openChatInterface(workflow_id);
}

// Step 2: Poll status
async function pollUntilReady(workflow_id) {
  while (true) {
    const res = await fetch(`/api/v1/workflow/status/${workflow_id}`);
    const {status, progress} = await res.json();

    // Update UI
    updateProgress(progress);

    if (status === 'ready') {
      return true;
    }

    if (status === 'failed') {
      throw new Error('Workflow build failed');
    }

    // Wait 2 seconds
    await new Promise(r => setTimeout(r, 2000));
  }
}

// Step 3: Chat
async function sendMessage(workflow_id, message, thread_id) {
  const res = await fetch(`/api/v1/workflow/${workflow_id}/chat`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message, thread_id})
  });

  const {response} = await res.json();
  return response;
}
```

---

## ❓ Answers to Your Questions

### Q1: graph_export format?
**A:** Use **exact** arrows.app export. No transformation needed.
```javascript
const export = arrows.app.export(); // Use as-is
```

### Q2: metadata structure?
**A:** Optional, any fields you want:
```json
{
  "created_by": "user@example.com",
  "description": "Optional description",
  "custom_field": "anything"
}
```

### Q3: Status polling response?
**A:** See section 2️⃣ above. Has `status`, `progress`, `nodes_built`.

### Q4: Execute endpoint details?
**A:** Use `/chat` endpoint instead! It's conversational.
```json
{
  "message": "user's text",
  "thread_id": "conversation_id"
}
```

### Q5: UI states?
**A:** After workflow ready:
- Show chat interface (like agent chat)
- User can send messages
- Workflow responds

---

## 🎯 Quick Start Checklist

- [ ] Add "Export Workflow" button to arrows.app
- [ ] Send arrows.app JSON to `/create` endpoint
- [ ] Poll `/status/{id}` every 2 seconds
- [ ] Show progress UI (X/Y nodes built)
- [ ] When ready, show chat interface
- [ ] Use `/chat` endpoint for messages
- [ ] Display responses in chat UI

---

## 🐛 Error Handling

```javascript
try {
  const res = await fetch(...);

  if (!res.ok) {
    const error = await res.json();
    console.error(error);
    showError(error.details || error.message);
  }
} catch (e) {
  showError('Network error: ' + e.message);
}
```

**Common errors:**
- 404: Workflow not found
- 400: Workflow not ready (still building)
- 500: Execution failed (show error to user)

---

## 📝 Notes

- **Same thread_id** for multi-turn conversations
- **Chat endpoint** works like agent chat (already familiar!)
- **Start simple** - test with 2-3 node workflows first
- **Complex workflows** (agents, routing) coming soon

---

**Ready to build! 🚀**

Questions? Check `/sketch2agent/workflows/README.md` for details.
