import React, { Component } from 'react';
import { Form, Button, Icon, Message, TextArea, Dropdown, Progress } from 'semantic-ui-react';
import ChatInterface from './ChatInterface';

class ExportAgentFrameworkPanel extends Component {
  constructor(props) {
    super(props);
    this.state = {
      selectedAgentId: null,
      loading: false,
      polling: false,
      success: false,
      error: null,
      response: null,
      agentId: null,
      progress: null,
      apiUrl: 'http://localhost:8000',
      chatOpen: false
    };
    this.pollInterval = null;
  }

  componentDidMount() {
    console.log('🟢 ExportAgentFrameworkPanel MOUNTED');
    // Auto-select first agent if only one exists
    const agentNodes = this.detectAgentNodes();
    if (agentNodes.length === 1) {
      this.setState({ selectedAgentId: agentNodes[0].id });
    }
  }

  componentWillUnmount() {
    console.log('🔴 ExportAgentFrameworkPanel UNMOUNTING');
    // Clean up polling interval on unmount
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  // Sanitize node name to match backend's sanitize_node_name() function
  // Follows exact rules from backend Python implementation
  sanitizeNodeName = (name) => {
    if (!name) {
      return 'unnamed_node';
    }

    // Step 1: Replace all spaces with underscores
    let sanitized = name.replace(/ /g, '_');

    // Step 2: Replace ANY character that's NOT a letter, number, or underscore
    // Using explicit character class to match Python's \w behavior (ASCII-only)
    sanitized = sanitized.replace(/[^a-zA-Z0-9_]/g, '_');

    // Step 3: Replace consecutive underscores with single underscore
    sanitized = sanitized.replace(/_+/g, '_');

    // Step 4: Remove leading and trailing underscores
    sanitized = sanitized.replace(/^_+|_+$/g, '');

    // Step 5: If starts with digit, prepend "node_"
    if (sanitized && /^\d/.test(sanitized)) {
      sanitized = `node_${sanitized}`;
    }

    // Step 6: If empty after all processing, return fallback
    return sanitized || 'unnamed_node';
  };

  // Detect nodes that have HAS_TOOL relationships (case-sensitive)
  detectAgentNodes = () => {
    const { graph } = this.props;
    const hasToolRelationships = graph.relationships.filter(
      rel => rel.type === 'HAS_TOOL'
    );

    // Get unique agent nodes (nodes with outgoing HAS_TOOL relationships)
    const agentNodeIds = [...new Set(hasToolRelationships.map(rel => rel.fromId))];
    return agentNodeIds.map(id => graph.nodes.find(n => n.id === id)).filter(Boolean);
  };

  // Get tool nodes connected to a specific agent node
  getToolNodesForAgent = (agentNodeId) => {
    const { graph } = this.props;
    const toolRelationships = graph.relationships.filter(
      rel => rel.type === 'HAS_TOOL' && rel.fromId === agentNodeId
    );

    return toolRelationships
      .map(rel => graph.nodes.find(n => n.id === rel.toId))
      .filter(Boolean);
  };

  // Check if graph has non-HAS_TOOL relationships (workflow edges)
  hasWorkflowRelationships = () => {
    const { graph } = this.props;
    return graph.relationships.some(rel => rel.type !== 'HAS_TOOL');
  };

  // Check if a node is an agent (has outgoing HAS_TOOL relationships)
  isNodeAnAgent = (nodeId) => {
    const { graph } = this.props;
    return graph.relationships.some(
      rel => rel.type === 'HAS_TOOL' && rel.fromId === nodeId
    );
  };

  // Transform a single tool node (handles both regular tools and nested agents)
  transformToolNode = (toolNode, visitedNodes = new Set()) => {
    // Circular reference protection
    if (visitedNodes.has(toolNode.id)) {
      console.warn(`Circular reference detected for node ${toolNode.id}, skipping nested tools`);
      return {
        name: this.sanitizeNodeName(toolNode.caption || `tool_${toolNode.id}`),
        description: toolNode.properties?.description || 'A tool for the agent.',
        type: 'agent',
        error: 'Circular reference detected'
      };
    }

    // Mark this node as visited
    const newVisitedNodes = new Set(visitedNodes);
    newVisitedNodes.add(toolNode.id);

    // Extract properties
    const { description, system_prompt, ...config } = toolNode.properties || {};

    // Sanitize tool name using backend-compatible function
    const sanitizedToolName = this.sanitizeNodeName(toolNode.caption || `tool_${toolNode.id}`);

    // Check if this tool is actually an agent (has its own tools)
    const isAgent = this.isNodeAnAgent(toolNode.id);

    if (isAgent) {
      // This tool is a nested agent - get its tools recursively
      const nestedToolNodes = this.getToolNodesForAgent(toolNode.id);

      return {
        name: sanitizedToolName,
        type: 'agent',
        description: description || 'A nested agent.',
        system_prompt: system_prompt || 'You are a helpful nested agent.',
        tools: nestedToolNodes.map(nestedTool =>
          this.transformToolNode(nestedTool, newVisitedNodes)
        ),
        config: Object.keys(config).length > 0 ? config : undefined
      };
    } else {
      // Regular tool
      return {
        name: sanitizedToolName,
        type: 'tool',
        description: description || 'A tool for the agent.',
        config: Object.keys(config).length > 0 ? config : undefined
      };
    }
  };

  // Transform agent node + tool nodes to API format
  transformToAPIFormat = (agentNode, toolNodes) => {
    // Sanitize node_label using backend-compatible function
    const sanitizedLabel = this.sanitizeNodeName(agentNode.caption || `agent_${agentNode.id}`);

    return {
      node_label: sanitizedLabel,
      system_prompt: agentNode.properties?.system_prompt || 'You are a helpful agent.',
      // model field removed - let backend use its own default
      tools: toolNodes.map(toolNode => this.transformToolNode(toolNode)),
      metadata: {
        created_by: 'arrows_user',
        created_from: 'arrows.app'
      }
    };
  };

  // Start polling agent status
  startPolling = (agentId) => {
    this.setState({ polling: true });

    this.pollInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `${this.state.apiUrl}/api/v1/agent/status/${agentId}`
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const statusData = await response.json();

        this.setState({ progress: statusData.progress });

        if (statusData.status === 'ready') {
          clearInterval(this.pollInterval);
          this.setState({
            polling: false,
            loading: false,
            success: true,
            response: statusData
          });
        } else if (statusData.status === 'failed') {
          clearInterval(this.pollInterval);
          this.setState({
            polling: false,
            loading: false,
            error: statusData.error || 'Agent creation failed',
            response: statusData
          });
        }
      } catch (error) {
        console.log('Polling error (using dummy data):', error.message);
        // For demo: simulate progress
        this.simulateProgress();
      }
    }, 2000); // Poll every 2 seconds
  };

  // Simulate progress for demo purposes when backend not available
  simulateProgress = () => {
    const currentProgress = this.state.progress || {
      total_tools: 3,
      completed_tools: 0,
      current_task: 'Initializing agent...'
    };

    if (currentProgress.completed_tools < currentProgress.total_tools) {
      this.setState({
        progress: {
          ...currentProgress,
          completed_tools: currentProgress.completed_tools + 1,
          current_task: `Building tool ${currentProgress.completed_tools + 1}/${currentProgress.total_tools}...`
        }
      });
    } else {
      // Simulation complete
      clearInterval(this.pollInterval);
      this.setState({
        polling: false,
        loading: false,
        success: true,
        response: {
          agent_id: this.state.agentId,
          status: 'ready',
          message: 'Agent ready! (SIMULATED - Backend not running)',
          tools_built: this.getToolNodesForAgent(this.state.selectedAgentId).map(t => ({
            name: t.caption,
            status: 'ready'
          }))
        }
      });
    }
  };

  exportToAgentFramework = async (e) => {
    // DEBUG: Check if this is being called
    console.log('🔥 exportToAgentFramework called', e);

    // Prevent any default behavior
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const { selectedAgentId } = this.state;
    const { graph } = this.props;

    console.log('🔥 Setting loading state');
    this.setState({ loading: true, error: null, success: false, response: null });

    const agentNode = graph.nodes.find(n => n.id === selectedAgentId);
    const toolNodes = this.getToolNodesForAgent(selectedAgentId);

    const requestBody = this.transformToAPIFormat(agentNode, toolNodes);

    console.log('Exporting Agent to Framework:', requestBody);

    try {
      const response = await fetch(`${this.state.apiUrl}/api/v1/agent/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      this.setState({
        agentId: result.agent_id,
        response: result,
        progress: result.progress
      });

      console.log('Agent creation started:', result);

      // Start polling for status
      this.startPolling(result.agent_id);

    } catch (error) {
      console.log('Export failed (backend not running, using simulation):', error.message);

      // For demo: simulate agent creation
      const dummyAgentId = `${requestBody.node_label}_${Date.now().toString(36)}`;

      this.setState({
        agentId: dummyAgentId,
        response: {
          agent_id: dummyAgentId,
          status: 'creating',
          message: 'Agent creation started (SIMULATED)',
          estimated_time_seconds: 10
        },
        progress: {
          total_tools: toolNodes.length,
          completed_tools: 0,
          current_task: 'Initializing agent...'
        }
      });

      // Start simulated polling
      this.startPolling(dummyAgentId);
    }
  };

  render() {
    const { graph, diagramName } = this.props;
    const {
      selectedAgentId,
      loading,
      polling,
      success,
      error,
      response,
      progress,
      apiUrl,
      agentId  // ← FIXED: Added missing agentId
    } = this.state;

    // Detect agent nodes
    const agentNodes = this.detectAgentNodes();
    const hasWorkflowEdges = this.hasWorkflowRelationships();

    // Get tool count for selected agent
    const toolNodes = selectedAgentId ? this.getToolNodesForAgent(selectedAgentId) : [];
    const selectedAgent = selectedAgentId ? graph.nodes.find(n => n.id === selectedAgentId) : null;

    // Prepare dropdown options for agent selection
    const agentOptions = agentNodes.map(node => ({
      key: node.id,
      text: `${node.caption || node.id} (${this.getToolNodesForAgent(node.id).length} tools)`,
      value: node.id
    }));

    return (
      <Form onSubmit={(e) => e.preventDefault()}>
        <Message info icon>
          <Icon name='robot' />
          <Message.Content>
            <Message.Header>Export Agent + Tools (Sprint 1)</Message.Header>
            <p>
              Export a single agent node with its connected tools to the SKETCH2AGENT backend.
              The agent will be created asynchronously with all its tools.
            </p>
          </Message.Content>
        </Message>

        {/* Warning: No agent nodes found */}
        {agentNodes.length === 0 && (
          <Message warning icon>
            <Icon name='warning sign' />
            <Message.Content>
              <Message.Header>No agent nodes found</Message.Header>
              <p>
                Create an Agent node and connect Tool nodes with <strong>HAS_TOOL</strong> relationships.
              </p>
              <Message.List>
                <Message.Item>Agent node should have property: <code>system_prompt</code></Message.Item>
                <Message.Item>Tool nodes should have properties: <code>description</code> + any config fields</Message.Item>
                <Message.Item>Connect them with relationship type: <strong>HAS_TOOL</strong> (case-sensitive)</Message.Item>
              </Message.List>
            </Message.Content>
          </Message>
        )}

        {/* Warning: Workflow relationships detected */}
        {agentNodes.length > 0 && hasWorkflowEdges && (
          <Message warning icon>
            <Icon name='info circle' />
            <Message.Content>
              <Message.Header>Workflow relationships detected</Message.Header>
              <p>
                This graph contains non-HAS_TOOL relationships. Workflow export coming in Sprint 2!
                For now, only Agent + Tools export is supported.
              </p>
            </Message.Content>
          </Message>
        )}

        {/* Agent Selection Dropdown (if multiple agents) */}
        {agentNodes.length > 1 && (
          <Form.Field>
            <label>Select Agent to Export</label>
            <Dropdown
              placeholder='Select an agent...'
              fluid
              selection
              options={agentOptions}
              value={selectedAgentId}
              onChange={(e, { value }) => this.setState({ selectedAgentId: value })}
            />
          </Form.Field>
        )}

        {/* Preview of what will be exported */}
        {selectedAgentId && (
          <Message>
            <Message.Header>Export Preview</Message.Header>
            <p>
              <strong>Agent:</strong> {selectedAgent?.caption || selectedAgentId}
              <br />
              <strong>Tools:</strong> {toolNodes.length} tool{toolNodes.length !== 1 ? 's' : ''}
              {toolNodes.length > 0 && (
                <>
                  {' '}- {toolNodes.map(t => t.caption || t.id).join(', ')}
                </>
              )}
            </p>
          </Message>
        )}

        {/* API URL Configuration */}
        <Form.Field>
          <label>Backend API URL</label>
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => this.setState({ apiUrl: e.target.value })}
            placeholder="http://localhost:8000"
          />
        </Form.Field>

        {/* Error Message */}
        {error && (
          <Message negative icon>
            <Icon name='times circle' />
            <Message.Content>
              <Message.Header>Agent Creation Failed</Message.Header>
              <p>{error}</p>
            </Message.Content>
          </Message>
        )}

        {/* Progress UI */}
        {(loading || polling) && progress && (
          <Message icon>
            <Icon name='circle notched' loading />
            <Message.Content>
              <Message.Header>Creating Agent...</Message.Header>
              <p>{progress.current_task}</p>
              <Progress
                percent={Math.round((progress.completed_tools / progress.total_tools) * 100)}
                indicating
                progress
              >
                Building tools: {progress.completed_tools}/{progress.total_tools} complete
              </Progress>
            </Message.Content>
          </Message>
        )}

        {/* Success Message */}
        {success && !polling && (
          <Message positive icon>
            <Icon name='check circle' />
            <Message.Content>
              <Message.Header>Agent Ready! ✅</Message.Header>
              <p>
                Agent <strong>{response?.agent_id}</strong> has been created successfully.
                {response?.tools_built && (
                  <>
                    <br />
                    Tools built: {response.tools_built.map(t => t.name).join(', ')}
                  </>
                )}
              </p>
              <Button
                type="button"
                primary
                icon
                labelPosition='left'
                onClick={() => this.setState({ chatOpen: true })}
                style={{ marginTop: '12px' }}
              >
                <Icon name='comments' />
                Start Chat
              </Button>
            </Message.Content>
          </Message>
        )}

        {/* Export Button */}
        <Form.Field>
          <Button
            type="button"
            onClick={this.exportToAgentFramework}
            loading={loading || polling}
            disabled={loading || polling || !selectedAgentId}
            primary
            icon
            labelPosition='left'
            size='large'
          >
            <Icon name='cloud upload' />
            {loading || polling ? 'Creating Agent...' : 'Export Agent'}
          </Button>
        </Form.Field>

        {/* Response Details (collapsed by default) */}
        {response && (
          <Form.Field>
            <label>Backend Response (Debug)</label>
            <TextArea
              style={{
                height: 200,
                fontFamily: 'monospace',
                fontSize: '11px'
              }}
              value={JSON.stringify(response, null, 2)}
              readOnly
            />
          </Form.Field>
        )}

        {/* Help Message */}
        <Message>
          <Message.Header>How to use</Message.Header>
          <Message.List>
            <Message.Item>Create an <strong>Agent node</strong> with property: <code>system_prompt</code></Message.Item>
            <Message.Item>Create <strong>Tool nodes</strong> with properties: <code>description</code> + config (e.g., <code>api_key</code>, <code>db_connection</code>)</Message.Item>
            <Message.Item>Connect Agent → Tool with relationship type <strong>HAS_TOOL</strong></Message.Item>
            <Message.Item>Click "Export Agent" to send to backend</Message.Item>
            <Message.Item>Wait for tools to be built (progress shown above)</Message.Item>
            <Message.Item>When ready, click "Start Chat" to talk with your agent!</Message.Item>
          </Message.List>
        </Message>

        {/* Chat Interface Modal */}
        {success && agentId && (
          <ChatInterface
            open={this.state.chatOpen}
            onClose={() => this.setState({ chatOpen: false })}
            agentId={agentId}
            agentName={selectedAgent?.caption}
            apiUrl={apiUrl}
          />
        )}
      </Form>
    );
  }
}

export default ExportAgentFrameworkPanel;
