import React, { Component } from 'react';
import { Modal, Form, Button, Icon, Message, Comment, Segment } from 'semantic-ui-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

class ChatInterface extends Component {
  constructor(props) {
    super(props);
    this.state = {
      message: '',
      messages: [],
      loading: false,
      error: null,
      threadId: this.generateThreadId(props.agentId),
      memoryEnabled: true,
      expandedTrajectories: {}, // Track which message trajectories are expanded
      expandedToolDetails: {},   // Track which tool details are expanded
      includeTrajectoryInExport: true, // Include trajectory in chat export by default
      // Streaming state
      streaming: false,
      streamingStatus: '',       // Current status message (e.g., "Agent thinking...")
      currentResponse: '',       // Accumulating response content
      streamingTrajectoryItems: [], // Real-time trajectory items
      streamStartTime: null      // For calculating execution time
    };
    this.messagesEndRef = React.createRef();
    this.streamReaderRef = null; // Keep reference to abort streaming if needed
    this.streamingResponseContent = ''; // Instance variable for immediate access (not async like setState)
  }

  // Generate thread_id: {agent_id}_{uuid}_{timestamp}
  generateThreadId = (agentId) => {
    const uuid = crypto.randomUUID().substring(0, 8);
    const timestamp = Math.floor(Date.now() / 1000);
    return `${agentId}_${uuid}_${timestamp}`;
  };

  // Scroll to bottom of messages
  scrollToBottom = () => {
    if (this.messagesEndRef.current) {
      this.messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  componentDidUpdate(prevProps, prevState) {
    // Auto-scroll when new messages arrive or during streaming
    if (
      prevState.messages.length !== this.state.messages.length ||
      prevState.currentResponse !== this.state.currentResponse ||
      prevState.streamingTrajectoryItems.length !== this.state.streamingTrajectoryItems.length
    ) {
      this.scrollToBottom();
    }
  }

  handleSendMessage = async () => {
    const { message, threadId, memoryEnabled, messages } = this.state;
    const { agentId, apiUrl } = this.props;

    if (!message.trim()) return;

    // Add user message to history
    const userMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    };

    this.streamingResponseContent = ''; // Reset instance variable

    this.setState({
      messages: [...messages, userMessage],
      message: '',
      streaming: true,
      streamingStatus: 'Connecting...',
      currentResponse: '',
      streamingTrajectoryItems: [],
      streamStartTime: Date.now(),
      error: null
    });

    try {
      // Try streaming first
      await this.handleStreamingChat(message, agentId, threadId, memoryEnabled, apiUrl);
    } catch (error) {
      console.error('Streaming chat error:', error);
      console.log('Falling back to regular chat...');

      // Fallback to regular non-streaming chat
      try {
        this.setState({ streamingStatus: 'Retrying without streaming...' });
        await this.handleRegularChat(message, agentId, threadId, memoryEnabled, apiUrl);
      } catch (fallbackError) {
        console.error('Regular chat error:', fallbackError);
        this.setState({
          streaming: false,
          streamingStatus: '',
          error: fallbackError.message
        });
      }
    }
  };

  // Streaming chat handler
  handleStreamingChat = async (message, agentId, threadId, memoryEnabled, apiUrl) => {
    console.log('🚀 Starting streaming chat...');
    console.log('📍 URL:', `${apiUrl}/api/v1/chat/stream`);
    console.log('📦 Payload:', { agent_id: agentId, thread_id: threadId, message, memory_enabled: memoryEnabled });

    const response = await fetch(`${apiUrl}/api/v1/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        thread_id: threadId,
        message: message,
        memory_enabled: memoryEnabled
      })
    });

    console.log('📡 Response status:', response.status, response.statusText);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    this.streamReaderRef = reader;
    const decoder = new TextDecoder();
    let buffer = '';

    console.log('📖 Starting to read stream...');

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('✅ Stream completed');
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            console.log('📥 Raw line:', line);
            try {
              const event = JSON.parse(line.slice(6));
              this.handleStreamEvent(event);
            } catch (parseError) {
              console.error('❌ Failed to parse event:', line, parseError);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
      this.streamReaderRef = null;
      console.log('🔒 Stream reader released');
    }
  };

  // Regular non-streaming chat (fallback)
  handleRegularChat = async (message, agentId, threadId, memoryEnabled, apiUrl) => {
    const response = await fetch(`${apiUrl}/api/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        thread_id: threadId,
        message: message,
        memory_enabled: memoryEnabled
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    // Add assistant message to history
    const assistantMessage = {
      role: 'assistant',
      content: result.message.content,
      timestamp: result.message.timestamp,
      execution_time_ms: result.execution_time_ms,
      trajectory: result.trajectory || null,
      trajectory_summary: result.trajectory_summary || null
    };

    this.setState({
      messages: [...this.state.messages, assistantMessage],
      streaming: false,
      streamingStatus: ''
    });
  };

  // Handle individual streaming events
  handleStreamEvent = (event) => {
    console.log('📨 Stream event received:', event.type, event);

    switch (event.type) {
      case 'workflow_start':
        console.log('▶️ Workflow started');
        this.setState({ streamingStatus: 'Agent started...' });
        break;

      case 'node_start':
        console.log('🔵 Node started:', event.node);
        if (event.node === 'agent') {
          this.setState({ streamingStatus: '💭 Agent thinking...' });
        } else if (event.node === 'tools') {
          this.setState({ streamingStatus: '🔧 Executing tools...' });
        }
        break;

      case 'tool_call':
        console.log('🔧 Tool call:', event.tool_name);
        this.setState(prevState => ({
          streamingTrajectoryItems: [...prevState.streamingTrajectoryItems, {
            id: event.tool_use_id,
            type: 'tool_call',
            tool: event.tool_name,
            input: event.input,
            loading: true,
            step: event.step
          }]
        }));
        break;

      case 'tool_result':
        console.log('✅ Tool result:', event.tool_use_id);
        this.setState(prevState => ({
          streamingTrajectoryItems: prevState.streamingTrajectoryItems.map(item =>
            item.id === event.tool_use_id
              ? { ...item, output: event.output, loading: false }
              : item
          )
        }));
        break;

      case 'response_chunk':
        console.log('✍️ Response chunk received:', event.content?.substring(0, 100) + '...');
        console.log('📝 Full event:', event);

        // Store in instance variable for immediate access (not async)
        this.streamingResponseContent = event.content;

        // Also update state for UI
        this.setState({
          currentResponse: event.content,
          streamingStatus: '✍️ Generating response...'
        });
        this.scrollToBottom();
        break;

      case 'workflow_end':
        console.log('🏁 Workflow end');
        console.log('📊 Trajectory:', event.trajectory);
        console.log('📝 Response content from instance variable:', this.streamingResponseContent);

        const executionTime = Date.now() - this.state.streamStartTime;

        // Add final assistant message to history
        // Use instance variable (immediate, not async) instead of state
        const assistantMessage = {
          role: 'assistant',
          content: this.streamingResponseContent || event.message?.content || '',
          timestamp: event.timestamp,
          execution_time_ms: event.execution_time_ms || executionTime,
          trajectory: event.trajectory || null,
          trajectory_summary: event.trajectory_summary || null
        };

        console.log('💾 Saving message to history:', assistantMessage);

        // Clear instance variable
        this.streamingResponseContent = '';

        this.setState({
          messages: [...this.state.messages, assistantMessage],
          streaming: false,
          streamingStatus: '',
          currentResponse: '',
          streamingTrajectoryItems: []
        });
        break;

      case 'error':
        console.error('❌ Stream error:', event.error);
        this.setState({
          streaming: false,
          streamingStatus: '',
          error: event.error
        });
        break;

      default:
        console.log('❓ Unknown event type:', event.type, event);
    }
  };

  handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleSendMessage();
    }
  };

  handleNewChat = () => {
    this.setState({
      messages: [],
      threadId: this.generateThreadId(this.props.agentId),
      error: null
    });
  };

  handleExportChat = (includeTrajectory) => {
    const { agentId, agentName } = this.props;
    const { messages, threadId } = this.state;

    if (messages.length === 0) {
      alert('No messages to export!');
      return;
    }

    // Prepare export data
    const exportData = {
      agent_id: agentId,
      agent_name: agentName || agentId,
      thread_id: threadId,
      exported_at: new Date().toISOString(),
      message_count: messages.length,
      messages: messages.map(msg => {
        const exportMsg = {
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp
        };

        // Include execution time for agent messages
        if (msg.execution_time_ms) {
          exportMsg.execution_time_ms = msg.execution_time_ms;
        }

        // Conditionally include trajectory data
        if (includeTrajectory && msg.trajectory) {
          exportMsg.trajectory = msg.trajectory;
          exportMsg.trajectory_summary = msg.trajectory_summary;
        }

        return exportMsg;
      })
    };

    // Create JSON blob
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });

    // Generate filename: chat_AgentName_timestamp.json
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const sanitizedAgentName = (agentName || agentId).replace(/[^a-zA-Z0-9_]/g, '_');
    const filename = `chat_${sanitizedAgentName}_${timestamp}.json`;

    // Trigger download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  // Toggle trajectory expansion for a specific message
  toggleTrajectory = (messageIndex) => {
    this.setState(prevState => ({
      expandedTrajectories: {
        ...prevState.expandedTrajectories,
        [messageIndex]: !prevState.expandedTrajectories[messageIndex]
      }
    }));
  };

  // Toggle tool details expansion for a specific step
  toggleToolDetails = (stepKey) => {
    this.setState(prevState => ({
      expandedToolDetails: {
        ...prevState.expandedToolDetails,
        [stepKey]: !prevState.expandedToolDetails[stepKey]
      }
    }));
  };

  // Render a single trajectory step
  renderTrajectoryStep = (step, messageIndex) => {
    const stepKey = `${messageIndex}-${step.step}`;
    const isToolExpanded = this.state.expandedToolDetails[stepKey];

    // Determine icon and color based on step type
    let iconName, iconColor, bgColor;
    switch (step.type) {
      case 'reasoning':
        iconName = 'lightbulb outline';
        iconColor = '#666';
        bgColor = '#f3f4f6';
        break;
      case 'tool_call':
        iconName = 'wrench';
        iconColor = '#2185d0';
        bgColor = '#dbeafe';
        break;
      case 'final_answer':
        iconName = 'check circle';
        iconColor = '#21ba45';
        bgColor = '#d1fae5';
        break;
      default:
        iconName = 'circle';
        iconColor = '#999';
        bgColor = '#f9f9f9';
    }

    return (
      <div
        key={step.step}
        style={{
          padding: '10px',
          marginBottom: '8px',
          backgroundColor: bgColor,
          borderRadius: '4px',
          borderLeft: `3px solid ${iconColor}`
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <Icon name={iconName} style={{ color: iconColor, marginTop: '2px' }} />
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: '0.9em', color: '#555' }}>
              Step {step.step}: {step.type === 'reasoning' ? 'Reasoning' : step.type === 'tool_call' ? 'Tool Call' : 'Final Answer'}
            </strong>

            {/* Reasoning content */}
            {step.type === 'reasoning' && step.content && (
              <div style={{ marginTop: '4px', fontSize: '0.95em' }}>
                {step.content}
              </div>
            )}

            {/* Tool call */}
            {step.type === 'tool_call' && (
              <div style={{ marginTop: '4px' }}>
                <div style={{ fontSize: '0.95em' }}>
                  <code style={{ backgroundColor: '#fff', padding: '2px 6px', borderRadius: '3px' }}>
                    {step.tool}
                  </code>
                  {' → '}
                  <span style={{ fontWeight: 'bold' }}>{JSON.stringify(step.output)}</span>
                </div>

                {/* Expandable tool details */}
                <div style={{ marginTop: '6px' }}>
                  <Button
                    type="button"
                    size="mini"
                    basic
                    compact
                    onClick={() => this.toggleToolDetails(stepKey)}
                    style={{ padding: '4px 8px', fontSize: '0.85em' }}
                  >
                    <Icon name={isToolExpanded ? 'chevron up' : 'chevron down'} />
                    {isToolExpanded ? 'Hide' : 'Show'} details
                  </Button>

                  {isToolExpanded && (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ marginBottom: '6px' }}>
                        <strong style={{ fontSize: '0.85em' }}>Input:</strong>
                        <pre style={{
                          backgroundColor: '#fff',
                          padding: '8px',
                          borderRadius: '3px',
                          fontSize: '0.85em',
                          margin: '4px 0 0 0',
                          overflow: 'auto'
                        }}>
                          {JSON.stringify(step.input, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <strong style={{ fontSize: '0.85em' }}>Output:</strong>
                        <pre style={{
                          backgroundColor: '#fff',
                          padding: '8px',
                          borderRadius: '3px',
                          fontSize: '0.85em',
                          margin: '4px 0 0 0',
                          overflow: 'auto'
                        }}>
                          {JSON.stringify(step.output, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Final answer content */}
            {step.type === 'final_answer' && step.content && (
              <div style={{ marginTop: '4px', fontSize: '0.95em' }}>
                {step.content}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  render() {
    const { open, onClose, agentId, agentName } = this.props;
    const {
      message,
      messages,
      loading,
      error,
      memoryEnabled,
      expandedTrajectories,
      streaming,
      streamingStatus,
      currentResponse,
      streamingTrajectoryItems
    } = this.state;

    return (
      <Modal
        open={open}
        onClose={onClose}
        size="large"
        closeIcon
      >
        <Modal.Header>
          <Icon name='comments' />
          Chat with {agentName || agentId}
        </Modal.Header>

        <Modal.Content scrolling style={{ minHeight: '500px', maxHeight: '600px' }}>
          {/* Memory Toggle */}
          <Message info size='small'>
            <Form.Checkbox
              label='Enable conversation memory'
              checked={memoryEnabled}
              onChange={(e, { checked }) => this.setState({ memoryEnabled: checked })}
            />
            {memoryEnabled && (
              <p style={{ marginTop: '8px', fontSize: '0.9em' }}>
                The agent will remember previous messages in this conversation.
              </p>
            )}
          </Message>

          {/* Error Message */}
          {error && (
            <Message negative icon>
              <Icon name='exclamation circle' />
              <Message.Content>
                <Message.Header>Error</Message.Header>
                <p>{error}</p>
              </Message.Content>
            </Message>
          )}

          {/* Message History */}
          {messages.length === 0 ? (
            <Segment placeholder>
              <Icon name='chat' size='huge' style={{ color: '#ccc' }} />
              <p style={{ color: '#999', marginTop: '16px' }}>
                No messages yet. Start a conversation!
              </p>
            </Segment>
          ) : (
            <Comment.Group style={{ maxWidth: 'none' }}>
              {messages.map((msg, index) => {
                const isTrajectoryExpanded = expandedTrajectories[index];
                const hasSummary = msg.trajectory_summary && msg.trajectory_summary.total_steps > 0;

                return (
                  <Comment key={index}>
                    <Comment.Avatar
                      src={msg.role === 'user'
                        ? 'https://react.semantic-ui.com/images/avatar/small/matt.jpg'
                        : 'https://react.semantic-ui.com/images/avatar/small/elliot.jpg'
                      }
                    />
                    <Comment.Content>
                      <Comment.Author as='span'>
                        {msg.role === 'user' ? 'You' : agentName || 'Agent'}
                      </Comment.Author>
                      <Comment.Metadata>
                        <div>{this.formatTimestamp(msg.timestamp)}</div>
                        {msg.execution_time_ms && (
                          <div>
                            <Icon name='clock' />
                            {Math.round(msg.execution_time_ms)}ms
                          </div>
                        )}
                        {hasSummary && (
                          <div>
                            <Icon name='sitemap' />
                            {msg.trajectory_summary.tool_calls} tools, {msg.trajectory_summary.total_steps} steps
                          </div>
                        )}
                      </Comment.Metadata>
                      <Comment.Text>
                        {msg.role === 'user' ? (
                          // User messages: plain text
                          <div style={{ whiteSpace: 'pre-wrap' }}>
                            {msg.content}
                          </div>
                        ) : (
                          // Agent messages: markdown + HTML with sanitization
                          <ReactMarkdown
                            rehypePlugins={[rehypeRaw, rehypeSanitize]}
                            remarkPlugins={[remarkGfm]}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        )}
                      </Comment.Text>

                      {/* Trajectory Section */}
                      {msg.trajectory && msg.trajectory.length > 0 && (
                        <div style={{ marginTop: '12px' }}>
                          <Button
                            type="button"
                            size="small"
                            basic
                            compact
                            icon
                            labelPosition='left'
                            onClick={() => this.toggleTrajectory(index)}
                            style={{ marginBottom: '8px' }}
                          >
                            <Icon name={isTrajectoryExpanded ? 'chevron up' : 'chevron down'} />
                            {isTrajectoryExpanded ? 'Hide' : 'Show'} reasoning
                            {hasSummary && ` (${msg.trajectory_summary.tool_calls} tool calls, ${msg.trajectory_summary.total_steps} steps)`}
                          </Button>

                          {isTrajectoryExpanded && (
                            <div style={{
                              marginTop: '8px',
                              padding: '12px',
                              backgroundColor: '#fafafa',
                              borderRadius: '4px',
                              border: '1px solid #e0e0e0'
                            }}>
                              <div style={{ marginBottom: '8px', fontSize: '0.9em', color: '#666' }}>
                                <strong>Agent Reasoning Process:</strong>
                              </div>
                              {msg.trajectory.map(step => this.renderTrajectoryStep(step, index))}
                            </div>
                          )}
                        </div>
                      )}
                    </Comment.Content>
                  </Comment>
                );
              })}
              <div ref={this.messagesEndRef} />
            </Comment.Group>
          )}

          {/* Streaming Indicator */}
          {streaming && (
            <div style={{ marginTop: '16px' }}>
              {/* Status Message */}
              <Message icon info>
                <Icon name='circle notched' loading />
                <Message.Content>
                  <Message.Header>{streamingStatus || 'Processing...'}</Message.Header>
                </Message.Content>
              </Message>

              {/* Real-time Tool Calls */}
              {streamingTrajectoryItems.length > 0 && (
                <Segment style={{ marginTop: '12px', backgroundColor: '#f9f9f9' }}>
                  <div style={{ marginBottom: '8px', fontSize: '0.9em', fontWeight: 'bold', color: '#555' }}>
                    🔧 Tools Executing:
                  </div>
                  {streamingTrajectoryItems.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      style={{
                        padding: '8px',
                        marginBottom: '6px',
                        backgroundColor: '#fff',
                        borderRadius: '4px',
                        borderLeft: '3px solid #2185d0'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Icon
                          name={item.loading ? 'circle notched' : 'check circle'}
                          loading={item.loading}
                          style={{ color: item.loading ? '#2185d0' : '#21ba45' }}
                        />
                        <code style={{ fontSize: '0.9em' }}>{item.tool}</code>
                        {item.loading && <span style={{ fontSize: '0.85em', color: '#999' }}>Running...</span>}
                        {!item.loading && item.output && (
                          <span style={{ fontSize: '0.85em', color: '#21ba45' }}>✓ Complete</span>
                        )}
                      </div>
                    </div>
                  ))}
                </Segment>
              )}

              {/* Current Response (Live) */}
              {currentResponse && (
                <Comment style={{ marginTop: '12px' }}>
                  <Comment.Avatar src='https://react.semantic-ui.com/images/avatar/small/elliot.jpg' />
                  <Comment.Content>
                    <Comment.Author as='span'>{agentName || 'Agent'}</Comment.Author>
                    <Comment.Metadata>
                      <div>Generating...</div>
                    </Comment.Metadata>
                    <Comment.Text>
                      <ReactMarkdown
                        rehypePlugins={[rehypeRaw, rehypeSanitize]}
                        remarkPlugins={[remarkGfm]}
                      >
                        {currentResponse}
                      </ReactMarkdown>
                    </Comment.Text>
                  </Comment.Content>
                </Comment>
              )}
            </div>
          )}
        </Modal.Content>

        <Modal.Actions style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Message Input */}
          <Form onSubmit={(e) => e.preventDefault()} style={{ width: '100%', margin: 0 }}>
            <Form.TextArea
              placeholder='Type your message here... (Press Enter to send, Shift+Enter for new line)'
              value={message}
              onChange={(e) => this.setState({ message: e.target.value })}
              onKeyPress={this.handleKeyPress}
              disabled={streaming}
              style={{ width: '100%', minHeight: '60px', resize: 'vertical', marginBottom: '8px' }}
              rows={2}
            />
            <Button
              type="button"
              primary
              icon
              labelPosition='left'
              onClick={this.handleSendMessage}
              disabled={streaming || !message.trim()}
              fluid
            >
              <Icon name='send' />
              Send
            </Button>
          </Form>

          {/* Export Options */}
          {messages.length > 0 && (
            <div style={{
              padding: '10px',
              backgroundColor: '#f9f9f9',
              borderRadius: '4px',
              border: '1px solid #e0e0e0',
              width: '100%'
            }}>
              <Form.Checkbox
                label='Include reasoning steps in export'
                checked={this.state.includeTrajectoryInExport}
                onChange={(e, { checked }) => this.setState({ includeTrajectoryInExport: checked })}
                style={{ fontSize: '0.9em' }}
              />
            </div>
          )}

          {/* Bottom Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                type="button"
                onClick={this.handleNewChat}
                icon
                labelPosition='left'
              >
                <Icon name='refresh' />
                New Chat
              </Button>
              <Button
                type="button"
                onClick={() => this.handleExportChat(this.state.includeTrajectoryInExport)}
                icon
                labelPosition='left'
                disabled={messages.length === 0}
                color='green'
              >
                <Icon name='download' />
                Export Chat
              </Button>
            </div>
            <Button type="button" onClick={onClose}>
              Close
            </Button>
          </div>
        </Modal.Actions>
      </Modal>
    );
  }
}

export default ChatInterface;
