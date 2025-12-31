# Arrows Programmatic API Reference

## Overview

This document describes the programmatic APIs available in the Arrows graph drawing application. These APIs enable AI agents (like Claude Sonnet 4.5 or Haiku 4.5) and other automated systems to create nodes, edges, labels, and manipulate graphs without UI interaction.

**Quick Answer:** Yes, you can programmatically control all UI operations (drag-and-drop nodes, label edges, button clicks) through Redux actions, JSON import/export, or HTTP APIs.

---

## Table of Contents

1. [Core Data Model](#core-data-model)
2. [Model Utilities](#model-utilities)
3. [Important Behavioral Notes](#important-behavioral-notes)
4. [Redux Action API](#redux-action-api)
5. [Import/Export API](#importexport-api)
6. [HTTP/Agent API](#httpagent-api)
7. [Neo4j Database Integration](#neo4j-database-integration)
8. [Usage Patterns for AI Agents](#usage-patterns-for-ai-agents)
9. [File Reference](#file-reference)

---

## Core Data Model

**Location:** `/libs/model/src/`

### Graph Interface
```typescript
{
  nodes: Node[],
  relationships: Relationship[],
  style: StyleObject
}
```

### Entity Interface (Base)
```typescript
// All nodes and relationships inherit from Entity
interface Entity {
  id: Id                                    // String ID (e.g., 'n0', 'n1', 'r0')
  entityType: string                        // 'Node' or 'Relationship' (required)
  properties: Record<string, string>        // User-defined properties
  style: Record<string, string>             // Visual styling (NOT 'any')
}
```

### Node Interface (Complete)
```typescript
interface Node extends Entity {
  // Required fields
  position: Point                           // { x: number, y: number }
  caption: string                           // Display text/label
  labels: string[]                          // Neo4j labels (e.g., ['Person', 'User'])

  // Optional fields (inherited from Entity)
  entityType: string                        // Always 'Node'

  // Optional internal fields
  superNodeId?: any                         // Parent node for grouped nodes
  type?: any                                // Internal type classification
  initialPositions?: any                    // Used during drag operations
  status?: string                           // Node status (e.g., 'active', 'pending')
}
```

**Minimal Node Example:**
```javascript
{
  id: 'n0',
  entityType: 'Node',
  position: { x: 100, y: 100 },
  caption: 'User',
  labels: ['Person'],
  properties: { name: 'Alice', age: '30' },
  style: {}
}
```

### Relationship Interface (Complete)
```typescript
interface Relationship extends Entity {
  // Required fields
  type: string                              // Relationship type (e.g., 'FOLLOWS', 'CREATED')
  fromId: Id                                // Source node ID
  toId: Id                                  // Target node ID

  // Inherited from Entity
  entityType: string                        // Always 'Relationship'
  properties: Record<string, string>        // Relationship properties
  style: Record<string, string>             // Visual styling
}
```

**Minimal Relationship Example:**
```javascript
{
  id: 'r0',
  entityType: 'Relationship',
  type: 'FOLLOWS',
  fromId: 'n0',
  toId: 'n1',
  properties: { since: '2024-01-01' },
  style: {}
}
```

### Point Type
```typescript
interface Point {
  x: number
  y: number
  translate(vector: Vector): Point          // Returns new Point
  vectorFrom(otherPoint: Point): Vector     // Calculate vector between points
}
```

### Vector Type
```typescript
interface Vector {
  dx: number
  dy: number
  distance(): number                        // Magnitude of vector
  angle(): number                           // Angle in radians
  unit(): Vector                            // Normalized unit vector
  dot(other: Vector): number                // Dot product
  rotate(angle: number): Vector             // Rotate by angle (radians)
  scale(factor: number): Vector             // Scale vector
}
```

---

## Model Utilities

**Location:** `/libs/model/src/lib/`

These utility functions operate on nodes, relationships, and graphs **immutably** (they return new objects, never mutate).

### Node Utility Functions

**Location:** `/libs/model/src/lib/Node.ts`

```typescript
// Position manipulation
moveTo(node: Node, newPosition: Point): Node
// Returns new node at specified position

translate(node: Node, vector: Vector): Node
// Returns new node shifted by vector (e.g., { dx: 50, dy: 100 })

// Label manipulation
addLabel(node: Node, label: string): Node
// Returns new node with label added (no duplicates)

removeLabel(node: Node, label: string): Node
// Returns new node with label removed

renameLabel(node: Node, oldLabel: string, newLabel: string): Node
// Returns new node with label renamed

// Caption manipulation
setCaption(node: Node, caption: string): Node
// Returns new node with updated caption

// Type guard
isNode(entity: unknown): boolean
// Check if entity is a valid Node
```

**Example Usage:**
```javascript
import { translate, addLabel } from './libs/model/src/lib/Node'

const node = { id: 'n0', position: { x: 0, y: 0 }, caption: 'User', labels: [], properties: {}, style: {} }

// Move node
const movedNode = translate(node, { dx: 100, dy: 50 })
// movedNode.position = { x: 100, y: 50 }

// Add label (immutable!)
const labeledNode = addLabel(movedNode, 'Person')
// labeledNode.labels = ['Person'], movedNode.labels = []
```

### Relationship Utility Functions

**Location:** `/libs/model/src/lib/Relationship.ts`

```typescript
setType(relationship: Relationship, type: string): Relationship
// Returns new relationship with updated type

reverse(relationship: Relationship): Relationship
// Returns new relationship with fromId and toId swapped

otherNodeId(relationship: Relationship, nodeId: Id): Id | undefined
// Given one node ID, returns the ID of the other node in the relationship

// Type guard
isRelationship(entity: Entity): boolean
// Check if entity is a valid Relationship

// Database type conversion
stringTypeToDatabaseType(stringType: string): string
// Converts empty string to '_RELATED', escapes underscores

databaseTypeToStringType(databaseType: string): string
// Converts '_RELATED' to empty string, unescapes underscores
```

**Example Usage:**
```javascript
import { reverse, otherNodeId } from './libs/model/src/lib/Relationship'

const rel = { id: 'r0', type: 'FOLLOWS', fromId: 'n0', toId: 'n1', properties: {}, style: {} }

// Reverse direction
const reversedRel = reverse(rel)
// reversedRel = { ...rel, fromId: 'n1', toId: 'n0' }

// Find other node
const otherId = otherNodeId(rel, 'n0')
// otherId = 'n1'
```

### Graph Utility Functions

**Location:** `/libs/model/src/lib/Graph.ts`

```typescript
emptyGraph(): Graph
// Creates a new graph with one empty node at origin
// Returns: { nodes: [{ id: 'n0', position: {x:0,y:0}, caption: '', ... }], relationships: [], style: {...} }

getNodeIdMap(graph: Graph): Record<string, Node>
// Converts node array to ID-indexed map for fast lookups
// Returns: { 'n0': node0, 'n1': node1, ... }

indexableText(graph: Graph): string
// Extracts all text (captions, properties) for search indexing
// Used for Google Drive search integration

usedCodePoints(graph: Graph): Set<number>
// Returns set of all Unicode code points used in graph
// Used for font loading optimization

neighbourPositions(node: Node, graph: Graph): Point[]
// Returns positions of all nodes connected to this node
// Used for layout algorithms
```

**Example Usage:**
```javascript
import { emptyGraph, getNodeIdMap } from './libs/model/src/lib/Graph'

// Create new graph
const graph = emptyGraph()
// graph.nodes = [{ id: 'n0', position: {x:0,y:0}, caption: '', labels: [], properties: {}, style: {} }]

// Fast node lookup
const nodeMap = getNodeIdMap(graph)
const node = nodeMap['n0']  // O(1) lookup instead of array.find()
```

### ID Utility Functions

**Location:** `/libs/model/src/lib/Id.ts`

```typescript
nextId(id: Id): Id
// Returns next sequential ID: 'n0' → 'n1', 'n9' → 'n10', 'r5' → 'r6'

nextAvailableId(entities: Entity[], prefix?: string): Id
// Finds the next available ID by checking existing entities
// Default prefix: 'n', returns 'n0' for empty array

idsMatch(a: Id, b: Id): boolean
// Compares two IDs (currently simple equality, future-proof)

asKey(id: Id): string
// Converts ID to string key for object indexing
```

**Example Usage:**
```javascript
import { nextAvailableId, nextId } from './libs/model/src/lib/Id'

const graph = { nodes: [{ id: 'n0' }, { id: 'n1' }, { id: 'n5' }], relationships: [] }

// Get next available node ID
const newNodeId = nextAvailableId(graph.nodes)
// newNodeId = 'n6' (one more than highest existing ID)

// Get next sequential ID
const nextNodeId = nextId('n5')
// nextNodeId = 'n6'

// Get next relationship ID
const newRelId = nextAvailableId(graph.relationships, 'r')
// newRelId = 'r0' (no relationships exist yet)
```

---

## Important Behavioral Notes

### 1. Immutability

**All model functions return NEW objects** - they never mutate inputs:

```javascript
const node = { id: 'n0', caption: 'Original', ... }
const updated = setCaption(node, 'Modified')

console.log(node.caption)     // 'Original' (unchanged!)
console.log(updated.caption)  // 'Modified'
```

### 2. Automatic ID Generation

When creating nodes/relationships, IDs are auto-generated:

```javascript
// Redux action automatically assigns IDs
dispatch(createNode())
// Creates node with id: 'n0' (or next available)

dispatch(connectNodes(['n0'], ['n1']))
// Creates relationship with id: 'r0' (or next available)
```

**Pattern:** IDs follow format `{prefix}{number}` where:
- Node IDs: `n0`, `n1`, `n2`, ...
- Relationship IDs: `r0`, `r1`, `r2`, ...

### 3. Automatic Positioning on Import

**Important:** `importNodesAndRelationships()` automatically repositions imported graphs to avoid overlaps:

```javascript
// Current graph has nodes at x: 0-200
const importedGraph = {
  nodes: [
    { id: 'new1', position: { x: 0, y: 0 }, ... },      // Original position
    { id: 'new2', position: { x: 100, y: 0 }, ... }
  ],
  relationships: []
}

dispatch(importNodesAndRelationships(importedGraph))

// Actual positions after import:
// new1: { x: 250, y: 0 }   ← Shifted right to avoid overlap
// new2: { x: 350, y: 0 }   ← Relative positions preserved
```

**Behavior:** Imported nodes are positioned to the **right** of existing content, maintaining their relative layout.

**Source:** `/apps/arrows-ts/src/actions/graph.js:641-686`

### 4. Node Name Sanitization (Workflow/Agent Export)

When exporting to workflows or agents, node captions are sanitized to valid identifiers:

**Sanitization Rules** (6 steps):
1. Replace all spaces with underscores: `"My Agent"` → `"My_Agent"`
2. Replace non-alphanumeric characters: `"calc_v5.2"` → `"calc_v5_2"`
3. Collapse consecutive underscores: `"my__node"` → `"my_node"`
4. Remove leading/trailing underscores: `"__test__"` → `"test"`
5. Prepend `"node_"` if starts with digit: `"5_agent"` → `"node_5_agent"`
6. Fallback to `"unnamed_node"` if empty

**Example Transformations:**
```javascript
"Question Answerer 1.4" → "Question_Answerer_1_4"
"calc_agnt_v5.2"        → "calc_agnt_v5_2"
"@#$%"                  → "unnamed_node"
"   "                   → "unnamed_node"
```

**Source:** `/apps/arrows-ts/src/components/ExportWorkflowPanel.jsx:37-62`

### 5. Property and Style Value Types

**Important:** All properties and styles are stored as **strings**, not primitive types:

```javascript
// ✅ Correct
properties: { age: '30', verified: 'true', price: '99.99' }

// ❌ Incorrect
properties: { age: 30, verified: true, price: 99.99 }
```

**Reason:** Neo4j Cypher export and database integration expect string values.

### 6. Relationship Type Escaping

Empty relationship types are stored as `'_RELATED'` in database:

```javascript
// UI representation
{ type: '' }

// Database Cypher
CREATE (a)-[:_RELATED]->(b)
```

Underscores in types are escaped as double underscores:

```javascript
// UI representation
{ type: 'WORKS_FOR' }

// Database Cypher
CREATE (a)-[:WORKS__FOR]->(b)
```

**Source:** `/libs/model/src/lib/Relationship.ts:20-26`

---

## Redux Action API

**Location:** `/apps/arrows-ts/src/actions/graph.js`

These action creators are the primary programmatic interface for graph manipulation.

### Node Operations

#### Create Nodes
```javascript
createNode()
// Dispatches: 'CREATE_NODE' with { newNodeId, newNodePosition, caption, style }

createNodesAndRelationships(sourceNodeIds, targetNodeDisplacement)
// Batch create nodes with relationships
```

#### Move Nodes
```javascript
moveNodes(oldMousePosition, newMousePosition, nodePositions, guides)
moveNodesEndDrag(nodePositions)
```

#### Modify Node Properties
```javascript
setNodeCaption(selection, caption)
// Set the caption/text for selected nodes

setProperty(selection, key, value)
// Add or update a property

setPropertyValues(key, nodePropertyValues)
// Set property values for multiple nodes

renameProperty(selection, oldKey, newKey)
// Rename a property key

removeProperty(selection, key)
// Remove a property
```

### Label Operations

```javascript
addLabel(selection, label)
// Add a label to selected nodes

addLabels(nodeLabels)
// Batch add labels

renameLabel(selection, oldLabel, newLabel)
// Rename a label across selected nodes

removeLabel(selection, label)
// Remove a label from selected nodes
```

### Relationship/Edge Operations

#### Create Relationships
```javascript
connectNodes(sourceNodeIds, targetNodeIds)
// Dispatches: 'CONNECT_NODES' with { sourceNodeIds, targetNodeIds, newRelationshipIds }
```

#### Modify Relationships
```javascript
setRelationshipType(selection, relationshipType)
// Set/label the relationship type (edge label)

reverseRelationships(selection)
// Flip the direction of selected relationships

inlineRelationships(selection)
// Convert relationships to inline display
```

### Structural Operations

```javascript
mergeNodes(selection)
// Merge selected nodes into one

mergeOnPropertyValues(selection, propertyKey)
// Merge nodes based on matching property values

duplicateSelection()
// Clone selected nodes and relationships

deleteSelection()
// Delete selected elements

deleteNodesAndRelationships(nodeIdMap, relationshipIdMap)
// Delete specific nodes and relationships
```

### Graph-Level Operations

```javascript
importNodesAndRelationships(importedGraph)
// Import entire graph structure (see Import/Export API)

convertCaptionsToLabels()
// Convert node captions to labels

convertCaptionsToPropertyValues()
// Convert node captions to property values
```

### Styling Operations

```javascript
setArrowsProperty(selection, key, value)
// Set Arrows-specific style property

removeArrowsProperty(selection, key)
// Remove Arrows-specific style property

setGraphStyle(key, value)
// Set global graph style property

setGraphStyles(style)
// Set multiple graph styles at once
```

---

## Import/Export API

**Location:** `/apps/arrows-ts/src/actions/import.js`, `/apps/arrows-ts/src/actions/export.ts`

### Import Graph (Best for AI Agents)

```javascript
importNodesAndRelationships(graphData)
```

**Important:** This function automatically repositions imported graphs to the **right** of existing content to avoid overlaps. Node IDs are also reassigned to avoid conflicts. See [Important Behavioral Notes](#important-behavioral-notes) for details.

**Example:**
```javascript
const graphData = {
  nodes: [
    {
      id: 'n1',                              // Will be reassigned (e.g., 'n5')
      position: { x: 100, y: 100 },          // Will be shifted right automatically
      caption: 'User',
      labels: ['Person'],
      properties: { age: '30', name: 'Alice' },
      style: {}
    },
    {
      id: 'n2',                              // Will be reassigned (e.g., 'n6')
      position: { x: 300, y: 100 },          // Relative position preserved
      caption: 'Product',
      labels: ['Item'],
      properties: { price: '99', name: 'Widget' },
      style: {}
    }
  ],
  relationships: [
    {
      id: 'r1',                              // Will be reassigned (e.g., 'r2')
      fromId: 'n1',                          // Will be updated to new node ID
      toId: 'n2',                            // Will be updated to new node ID
      type: 'PURCHASED',
      properties: { date: '2025-01-01' },
      style: {}
    }
  ],
  style: {}
}

dispatch(importNodesAndRelationships(graphData))

// Result: Nodes positioned to right of existing graph with new IDs
// Relationships updated to reference new node IDs
```

### Export Graph

```javascript
handleCopy()
// Copies selected nodes/relationships as JSON to clipboard
// Returns: { nodes: Node[], relationships: Relationship[], style: Object }
```

### Import Functions

```javascript
tryImport(text, separation)
// Parse and import from various formats (JSON, Cypher, CSV, GraphQL)

interpretClipboardData(clipboardData, nodeSpacing, handlers)
// Handle clipboard paste operations

handlePaste(pasteEvent)
// Process paste events with graph data
```

### Supported Import Formats
- **JSON** - Native graph format
- **Cypher** - Neo4j query language
- **CSV** - Comma-separated values
- **GraphQL** - GraphQL schema definitions

### Export to Cypher

**Location:** `/apps/arrows-ts/src/storage/exportCypher.js`

```javascript
exportCypher(graph, keyword, options)
// Generates executable Cypher CREATE statements from graph data
// Keywords: 'CREATE', 'MERGE'
```

**Example Output:**
```cypher
CREATE (n1:Person {name: 'Alice', age: 30})
CREATE (n2:Item {name: 'Widget', price: 99})
CREATE (n1)-[r1:PURCHASED {date: '2025-01-01'}]->(n2)
```

---

## HTTP/Agent API

**Location:** `/apps/arrows-ts/src/components/ChatInterface.jsx`

### Agent Chat Endpoints

#### Non-Streaming Chat
```http
POST /api/v1/chat
Content-Type: application/json

{
  "agent_id": "string",
  "thread_id": "string",
  "message": "string",
  "memory_enabled": boolean
}
```

#### Streaming Chat
```http
POST /api/v1/chat/stream
Content-Type: application/json

{
  "agent_id": "string",
  "thread_id": "string",
  "message": "string",
  "memory_enabled": boolean
}
```

**Response:** Server-Sent Events (SSE)
```
data: {"type": "token", "content": "..."}
data: {"type": "trajectory", "trajectory": [...]}
```

### Workflow Endpoints

#### Get Workflow Status
```http
GET /api/v1/workflow/status/{workflowId}
```

**Response:**
```json
{
  "status": "completed" | "building" | "failed",
  "metadata": {
    "name": "string",
    "description": "string",
    "created_at": "timestamp",
    "nodes": [...],
    "edges": [...]
  }
}
```

#### Execute Workflow (Streaming)
```http
POST /api/v1/workflow/{workflowId}/execute/stream
Content-Type: application/json

{
  "input": {
    "[chat_input_field]": "message"
  },
  "thread_id": "string",
  "config": {}
}
```

**Response:** Server-Sent Events (SSE)

Event types:
- `workflow_start` - Workflow execution begins
- `node_start` - Node execution starts
- `token` - Streaming token from LLM
- `node_end` - Node execution completes
- `state_update` - Workflow state update
- `error` - Error occurred
- `workflow_end` - Workflow execution completes

#### Create Workflow from Graph
```http
POST /api/v1/workflow
Content-Type: application/json

{
  "graph": {
    "nodes": [...],
    "relationships": [...]
  }
}
```

**Response:**
```json
{
  "workflow_id": "string"
}
```

---

## Neo4j Database Integration

**Location:** `/apps/arrows-ts/src/storage/cypherWriteQueries.js`, `/apps/arrows-ts/src/storage/cypherReadQueries.js`

### Write Operations

```javascript
writeQueriesForAction(action, graph)
// Returns session.run() functions for Neo4j operations
```

**Supported Actions:**
- `CREATE_NODE` → `CREATE (n:Diagram0 {...})`
- `CREATE_NODE_AND_RELATIONSHIP` → `MATCH + CREATE relationship`
- `CONNECT_NODES` → `MATCH (a), (b) CREATE (a)-[r:TYPE]->(b)`
- `SET_NODE_CAPTION`, `ADD_LABEL`, etc. → Corresponding Cypher updates

### Database Entity Mapping
- **Node labels** → Database labels (escaped)
- **Property keys** → Database keys (underscores escaped)
- **Styling** → Properties prefixed with `_style-`

### Read Operations

**Location:** `/apps/arrows-ts/src/storage/cypherReadQueries.js`

Reads graph from Neo4j database and reconstructs in-memory representation.

---

## Usage Patterns for AI Agents

### Pattern 1: Direct Redux Dispatch

**Use Case:** When you have direct access to the Redux store

```javascript
import { createNode, connectNodes, setNodeCaption, setProperty } from './actions/graph'

// Create nodes
store.dispatch(createNode())

// Connect nodes
store.dispatch(connectNodes(['node1'], ['node2']))

// Set properties
store.dispatch(setNodeCaption(selection, 'User Profile'))
store.dispatch(setProperty(selection, 'age', '25'))
```

### Pattern 2: JSON Import (Recommended for AI Agents)

**Use Case:** Generate entire graph structure as JSON

**Important:** IDs will be reassigned and positions auto-adjusted. Use relative positioning for node layout.

```javascript
import { importNodesAndRelationships } from './actions/import'

// AI agent generates this structure
const graphFromAI = {
  nodes: [
    {
      id: 'user1',                          // Temporary ID (will be reassigned)
      position: { x: 0, y: 0 },             // Relative position (will be shifted)
      caption: 'Alice',
      labels: ['Person', 'User'],
      properties: {
        email: 'alice@example.com',
        age: '30',                          // Note: strings, not numbers
        verified: 'true'                    // Note: strings, not booleans
      },
      style: {}
    },
    {
      id: 'user2',                          // Temporary ID (will be reassigned)
      position: { x: 200, y: 0 },           // 200px right of user1 (preserved)
      caption: 'Bob',
      labels: ['Person', 'User'],
      properties: {
        email: 'bob@example.com',
        age: '25',
        verified: 'false'
      },
      style: {}
    }
  ],
  relationships: [
    {
      id: 'rel1',                           // Temporary ID (will be reassigned)
      fromId: 'user1',                      // References temporary ID (will be updated)
      toId: 'user2',                        // References temporary ID (will be updated)
      type: 'FOLLOWS',
      properties: { since: '2024-01-01' },
      style: {}
    }
  ],
  style: {}
}

// Import in one call - IDs reassigned, positions adjusted automatically
store.dispatch(importNodesAndRelationships(graphFromAI))

// After import, nodes will have new IDs (e.g., 'n5', 'n6') and positions
// will be shifted to avoid overlap with existing graph content
```

### Pattern 3: HTTP API Integration

**Use Case:** External AI agent or service

```javascript
// Agent sends chat message
const response = await fetch('/api/v1/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agent_id: 'sketch2agent',
    thread_id: 'session-123',
    message: 'Create a social network graph with 5 users',
    memory_enabled: true
  })
})

// Process SSE stream
const reader = response.body.getReader()
while (true) {
  const { done, value } = await reader.read()
  if (done) break

  const text = new TextDecoder().decode(value)
  const events = text.split('\n\n')
  for (const event of events) {
    if (event.startsWith('data: ')) {
      const data = JSON.parse(event.slice(6))
      console.log('Event:', data.type, data.content)
    }
  }
}
```

### Pattern 4: Cypher Export and Transform

**Use Case:** Export to Neo4j database or generate queries

```javascript
import { exportCypher } from './storage/exportCypher'

// Export current graph as Cypher
const cypherQueries = exportCypher(graph, 'CREATE', {
  includeProperties: true,
  includeStyles: false
})

console.log(cypherQueries)
// Output:
// CREATE (n1:Person {name: 'Alice', age: 30})
// CREATE (n2:Person {name: 'Bob', age: 25})
// CREATE (n1)-[r1:FOLLOWS {since: '2024-01-01'}]->(n2)
```

### Pattern 5: Incremental Updates

**Use Case:** Make targeted changes to existing graph

```javascript
// Add a new node to existing graph
store.dispatch(createNode())

// Add labels to existing nodes
const selection = { nodes: { 'node1': true, 'node2': true }, relationships: {} }
store.dispatch(addLabel(selection, 'VIP'))

// Update properties
store.dispatch(setProperty(selection, 'status', 'active'))

// Create relationship between existing nodes
store.dispatch(connectNodes(['node1'], ['node3']))
```

---

## Selection System

**Location:** `/apps/arrows-ts/src/model/selection.js`

### Selection Structure
```javascript
{
  nodes: { [nodeId: string]: boolean },
  relationships: { [relationshipId: string]: boolean }
}
```

### Selection Helper Functions
```javascript
nodeSelected(selection, nodeId) // -> boolean
selectedNodeIds(selection) // -> string[]
selectedNodes(graph, selection) // -> Node[]
selectedRelationshipIds(selection) // -> string[]
selectedRelationships(graph, selection) // -> Relationship[]
selectedNodeIdMap(selection) // -> Record<string, boolean>
selectedRelationshipIdMap(selection) // -> Record<string, boolean>
```

---

## Redux State Structure

**Location:** `/apps/arrows-ts/src/reducers/`

```javascript
{
  graph: {
    nodes: Node[],
    relationships: Relationship[],
    style: Object
  },
  selection: {
    nodes: Record<string, boolean>,
    relationships: Record<string, boolean>
  },
  viewTransformation: {
    scale: number,
    pan: { x: number, y: number }
  },
  actionMemos: {},
  applicationLayout: {},
  // ... other state slices
}
```

---

## File Reference

### Core Model
| File | Purpose |
|------|---------|
| `/libs/model/src/lib/Graph.ts` | Graph interface, emptyGraph(), getNodeIdMap(), indexableText() |
| `/libs/model/src/lib/Node.ts` | Node interface, moveTo(), translate(), addLabel(), setCaption() |
| `/libs/model/src/lib/Relationship.ts` | Relationship interface, setType(), reverse(), otherNodeId() |
| `/libs/model/src/lib/Id.ts` | ID utilities: nextId(), nextAvailableId(), idsMatch() |
| `/libs/model/src/lib/Point.ts` | Point type with translate(), vectorFrom() methods |
| `/libs/model/src/lib/Vector.ts` | Vector type with distance(), angle(), rotate() methods |
| `/libs/model/src/lib/properties.ts` | Property key utilities and indexing |
| `/libs/model/src/lib/styling.ts` | Style utilities and defaults |

### Redux Layer
| File | Purpose |
|------|---------|
| `/apps/arrows-ts/src/actions/graph.js` | Action creators for graph operations |
| `/apps/arrows-ts/src/reducers/graph.js` | State mutations with undo support |
| `/apps/arrows-ts/src/model/selection.js` | Selection utilities |

### UI Integration
| File | Purpose |
|------|---------|
| `/apps/arrows-ts/src/containers/GraphContainer.js` | Maps Redux to React components |
| `/apps/arrows-ts/src/interactions/MouseHandler.js` | Canvas event handling |
| `/apps/arrows-ts/src/graphics/` | Rendering and visualization |

### Import/Export
| File | Purpose |
|------|---------|
| `/apps/arrows-ts/src/actions/export.ts` | Copy/clipboard operations |
| `/apps/arrows-ts/src/actions/import.js` | Paste/import from multiple formats |

### Database Integration
| File | Purpose |
|------|---------|
| `/apps/arrows-ts/src/storage/cypherWriteQueries.js` | Neo4j write operations |
| `/apps/arrows-ts/src/storage/cypherReadQueries.js` | Neo4j read operations |
| `/apps/arrows-ts/src/storage/exportCypher.js` | Cypher query generation |

### Agent/Workflow API
| File | Purpose |
|------|---------|
| `/apps/arrows-ts/src/components/ChatInterface.jsx` | LLM integration endpoints |
| `/apps/arrows-ts/src/components/ExportWorkflowPanel.jsx` | Workflow export UI |

---

## Quick Start for AI Agents

### Example: AI Agent Creates a Knowledge Graph

```javascript
// 1. AI analyzes user input: "Create a graph of programming languages and their creators"

// 2. AI generates graph structure
// IMPORTANT: Use relative positions, all properties as strings, include entityType
const knowledgeGraph = {
  nodes: [
    {
      id: 'lang1',                                    // Temporary ID
      entityType: 'Node',                             // Required
      position: { x: 0, y: 0 },                       // Relative position
      caption: 'Python',
      labels: ['Language'],
      properties: { year: '1991' },                   // String values!
      style: {}
    },
    {
      id: 'lang2',
      entityType: 'Node',
      position: { x: 200, y: 0 },                     // 200px right of lang1
      caption: 'JavaScript',
      labels: ['Language'],
      properties: { year: '1995' },
      style: {}
    },
    {
      id: 'person1',
      entityType: 'Node',
      position: { x: 0, y: 150 },                     // 150px below lang1
      caption: 'Guido van Rossum',
      labels: ['Person'],
      properties: {},
      style: {}
    },
    {
      id: 'person2',
      entityType: 'Node',
      position: { x: 200, y: 150 },                   // 150px below lang2
      caption: 'Brendan Eich',
      labels: ['Person'],
      properties: {},
      style: {}
    }
  ],
  relationships: [
    {
      id: 'r1',
      entityType: 'Relationship',                     // Required
      fromId: 'person1',                              // Temporary reference
      toId: 'lang1',
      type: 'CREATED',
      properties: {},
      style: {}
    },
    {
      id: 'r2',
      entityType: 'Relationship',
      fromId: 'person2',
      toId: 'lang2',
      type: 'CREATED',
      properties: {},
      style: {}
    }
  ],
  style: {}
}

// 3. Import into Arrows (IDs auto-reassigned, positions auto-adjusted)
dispatch(importNodesAndRelationships(knowledgeGraph))

// 4. Export as Cypher for Neo4j
const cypher = exportCypher(graph, 'CREATE')
console.log(cypher)
// Output:
// CREATE (n5:Language {year: "1991"})
// CREATE (n6:Language {year: "1995"})
// CREATE (n7:Person)
// CREATE (n8:Person)
// CREATE (n7)-[:CREATED]->(n5)
// CREATE (n8)-[:CREATED]->(n6)
```

### Key Reminders for AI Agents

1. **Always use string values** for properties and styles
2. **Include `entityType`** field for all nodes and relationships
3. **Use relative positioning** - absolute positions will be adjusted
4. **Don't rely on specific IDs** - they will be reassigned
5. **All model operations are immutable** - they return new objects
6. **Node names are sanitized** when exporting to workflows/agents

---

## Conclusion

All UI interactions (drag-and-drop nodes, label edges, button clicks, mouse drags) can be performed programmatically through:

1. **Redux Actions** - Direct state manipulation via action creators
2. **JSON Import** - Bulk graph creation (best for AI agents)
3. **HTTP APIs** - External agent integration with streaming support
4. **Cypher Export** - Database integration with Neo4j
5. **Model Utilities** - Immutable helper functions for nodes, relationships, and graphs

### Key Takeaways for AI Agents

- **Prefer `importNodesAndRelationships()`** for creating entire graphs in one operation
- **Use string values** for all properties and styles (required for Neo4j export)
- **Use relative positioning** - imported graphs are auto-positioned to avoid overlaps
- **IDs are auto-assigned** - don't rely on specific IDs after import
- **All operations are immutable** - model functions return new objects
- **Node names are sanitized** when exporting to workflows/agents (see sanitization rules)

AI agents like Claude Sonnet 4.5 or Haiku 4.5 can generate graph structures as JSON and import them in a single operation, or make incremental changes using Redux actions and model utilities.

For detailed behavioral notes, see [Important Behavioral Notes](#important-behavioral-notes).
