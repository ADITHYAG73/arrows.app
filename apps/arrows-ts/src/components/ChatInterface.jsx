import React, { Component } from 'react';
import { Modal, Form, Button, Icon, Message, Comment, Segment } from 'semantic-ui-react';

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
      expandedToolDetails: {}    // Track which tool details are expanded
    };
    this.messagesEndRef = React.createRef();
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
    // Auto-scroll when new messages arrive
    if (prevState.messages.length !== this.state.messages.length) {
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

    this.setState({
      messages: [...messages, userMessage],
      message: '',
      loading: true,
      error: null
    });

    try {
      const response = await fetch(`${apiUrl}/api/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

      // Add assistant message to history with trajectory data
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
        loading: false
      });

    } catch (error) {
      console.error('Chat error:', error);
      this.setState({
        loading: false,
        error: error.message
      });
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
    const { message, messages, loading, error, memoryEnabled, expandedTrajectories } = this.state;

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
                      <Comment.Text style={{ whiteSpace: 'pre-wrap' }}>
                        {msg.content}
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

          {/* Loading Indicator */}
          {loading && (
            <Message icon info>
              <Icon name='circle notched' loading />
              <Message.Content>
                <Message.Header>Agent is thinking...</Message.Header>
              </Message.Content>
            </Message>
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
              disabled={loading}
              style={{ width: '100%', minHeight: '60px', resize: 'vertical', marginBottom: '8px' }}
              rows={2}
            />
            <Button
              type="button"
              primary
              icon
              labelPosition='left'
              onClick={this.handleSendMessage}
              disabled={loading || !message.trim()}
              fluid
            >
              <Icon name='send' />
              Send
            </Button>
          </Form>

          {/* Bottom Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <Button
              type="button"
              onClick={this.handleNewChat}
              icon
              labelPosition='left'
            >
              <Icon name='refresh' />
              New Chat
            </Button>
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
