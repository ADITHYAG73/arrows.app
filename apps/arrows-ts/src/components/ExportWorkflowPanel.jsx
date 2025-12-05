import React, { Component } from 'react';
import { Form, Button, Icon, Message, TextArea, Progress } from 'semantic-ui-react';
import ChatInterface from './ChatInterface';

class ExportWorkflowPanel extends Component {
  constructor(props) {
    super(props);
    this.state = {
      workflowName: props.diagramName || 'My Workflow',
      loading: false,
      polling: false,
      success: false,
      error: null,
      response: null,
      workflowId: null,
      progress: null,
      apiUrl: 'http://localhost:8000',
      chatOpen: false
    };
    this.pollInterval = null;
  }

  componentDidMount() {
    console.log('🟢 ExportWorkflowPanel MOUNTED');
  }

  componentWillUnmount() {
    console.log('🔴 ExportWorkflowPanel UNMOUNTING');
    // Clean up polling interval on unmount
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  // Start polling workflow status
  startPolling = (workflowId) => {
    this.setState({ polling: true });

    this.pollInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `${this.state.apiUrl}/api/v1/workflow/status/${workflowId}`
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
            error: statusData.error || 'Workflow creation failed',
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
    const { graph } = this.props;
    const totalNodes = graph.nodes.length;

    const currentProgress = this.state.progress || {
      total_nodes: totalNodes,
      completed_nodes: 0,
      current_task: 'Initializing workflow...'
    };

    if (currentProgress.completed_nodes < currentProgress.total_nodes) {
      this.setState({
        progress: {
          ...currentProgress,
          completed_nodes: currentProgress.completed_nodes + 1,
          current_task: `Building node ${currentProgress.completed_nodes + 1}/${currentProgress.total_nodes}...`
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
          workflow_id: this.state.workflowId,
          status: 'ready',
          message: 'Workflow ready! (SIMULATED - Backend not running)',
          nodes_built: graph.nodes.map(n => ({
            node_id: n.id,
            name: n.caption,
            status: 'ready'
          }))
        }
      });
    }
  };

  exportWorkflow = async (e) => {
    console.log('🔥 exportWorkflow called', e);

    // Prevent any default behavior
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const { workflowName } = this.state;
    const { graph } = this.props;

    console.log('🔥 Setting loading state');
    this.setState({ loading: true, error: null, success: false, response: null });

    // Prepare the graph export (arrows.app format)
    const graphExport = {
      nodes: graph.nodes.map(node => ({
        id: node.id,
        caption: node.caption,
        properties: node.properties || {}
      })),
      relationships: graph.relationships.map(rel => ({
        fromId: rel.fromId,
        toId: rel.toId,
        type: rel.type || ''
      }))
    };

    const requestBody = {
      name: workflowName,
      graph_export: graphExport,
      metadata: {
        created_by: 'arrows_user',
        created_from: 'arrows.app'
      }
    };

    console.log('Exporting Workflow:', requestBody);

    try {
      const response = await fetch(`${this.state.apiUrl}/api/v1/workflow/create`, {
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
        workflowId: result.workflow_id,
        response: result,
        progress: {
          total_nodes: graph.nodes.length,
          completed_nodes: 0,
          current_task: 'Workflow created, building nodes...'
        }
      });

      console.log('Workflow creation started:', result);

      // Start polling for status
      this.startPolling(result.workflow_id);

    } catch (error) {
      console.log('Export failed (backend not running, using simulation):', error.message);

      // For demo: simulate workflow creation
      const dummyWorkflowId = `wf_${workflowName.replace(/\s+/g, '_')}_${Date.now().toString(36)}`;

      this.setState({
        workflowId: dummyWorkflowId,
        response: {
          workflow_id: dummyWorkflowId,
          status: 'pending',
          message: 'Workflow creation started (SIMULATED)',
          estimated_time_seconds: 10
        },
        progress: {
          total_nodes: graph.nodes.length,
          completed_nodes: 0,
          current_task: 'Initializing workflow...'
        }
      });

      // Start simulated polling
      this.startPolling(dummyWorkflowId);
    }
  };

  render() {
    const { graph, diagramName } = this.props;
    const {
      workflowName,
      loading,
      polling,
      success,
      error,
      response,
      progress,
      apiUrl,
      workflowId
    } = this.state;

    const nodeCount = graph.nodes.length;
    const relationshipCount = graph.relationships.length;

    return (
      <Form onSubmit={(e) => e.preventDefault()}>
        <Message info icon>
          <Icon name='sitemap' />
          <Message.Content>
            <Message.Header>Export Workflow</Message.Header>
            <p>
              Export your workflow diagram to the SKETCH2AGENT backend.
              The workflow will be built asynchronously and you can chat with it once ready.
            </p>
          </Message.Content>
        </Message>

        {/* Warning: No nodes found */}
        {nodeCount === 0 && (
          <Message warning icon>
            <Icon name='warning sign' />
            <Message.Content>
              <Message.Header>No nodes found</Message.Header>
              <p>
                Create workflow nodes in your diagram and connect them with relationships.
              </p>
            </Message.Content>
          </Message>
        )}

        {/* Workflow Name Input */}
        <Form.Field required>
          <label>Workflow Name</label>
          <input
            type="text"
            value={workflowName}
            onChange={(e) => this.setState({ workflowName: e.target.value })}
            placeholder="My Workflow"
            disabled={loading || polling}
          />
        </Form.Field>

        {/* Preview of what will be exported */}
        {nodeCount > 0 && (
          <Message>
            <Message.Header>Export Preview</Message.Header>
            <p>
              <strong>Nodes:</strong> {nodeCount} node{nodeCount !== 1 ? 's' : ''}
              <br />
              <strong>Relationships:</strong> {relationshipCount} relationship{relationshipCount !== 1 ? 's' : ''}
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
            disabled={loading || polling}
          />
        </Form.Field>

        {/* Error Message */}
        {error && (
          <Message negative icon>
            <Icon name='times circle' />
            <Message.Content>
              <Message.Header>Workflow Creation Failed</Message.Header>
              <p>{error}</p>
            </Message.Content>
          </Message>
        )}

        {/* Progress UI */}
        {(loading || polling) && progress && (
          <Message icon>
            <Icon name='circle notched' loading />
            <Message.Content>
              <Message.Header>Building Workflow...</Message.Header>
              <p>{progress.current_task}</p>
              <Progress
                percent={Math.round((progress.completed_nodes / progress.total_nodes) * 100)}
                indicating
                progress
              >
                Building nodes: {progress.completed_nodes}/{progress.total_nodes} complete
              </Progress>
            </Message.Content>
          </Message>
        )}

        {/* Success Message */}
        {success && !polling && (
          <Message positive icon>
            <Icon name='check circle' />
            <Message.Content>
              <Message.Header>Workflow Ready! ✅</Message.Header>
              <p>
                Workflow <strong>{response?.workflow_id}</strong> has been created successfully.
                {response?.nodes_built && (
                  <>
                    <br />
                    Nodes built: {response.nodes_built.map(n => n.name || n.node_id).join(', ')}
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
            onClick={this.exportWorkflow}
            loading={loading || polling}
            disabled={loading || polling || !workflowName || nodeCount === 0}
            primary
            icon
            labelPosition='left'
            size='large'
          >
            <Icon name='cloud upload' />
            {loading || polling ? 'Creating Workflow...' : 'Export Workflow'}
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
            <Message.Item>Draw your workflow in arrows.app with nodes and relationships</Message.Item>
            <Message.Item>Add <code>description</code> property to each node explaining what it does</Message.Item>
            <Message.Item>Enter a workflow name and click "Export Workflow"</Message.Item>
            <Message.Item>Wait for nodes to be built (progress shown above)</Message.Item>
            <Message.Item>When ready, click "Start Chat" to interact with your workflow!</Message.Item>
          </Message.List>
        </Message>

        {/* Chat Interface Modal */}
        {success && workflowId && (
          <ChatInterface
            open={this.state.chatOpen}
            onClose={() => this.setState({ chatOpen: false })}
            agentId={workflowId}
            agentName={workflowName}
            apiUrl={apiUrl}
            isWorkflow={true}
          />
        )}
      </Form>
    );
  }
}

export default ExportWorkflowPanel;
