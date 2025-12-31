import React, {Component} from 'react'
import GraphContainer from "../containers/GraphContainer"
import {connect} from 'react-redux'
import withKeybindings, { ignoreTarget } from '../interactions/Keybindings'
import {windowResized} from "../actions/applicationLayout"
import HeaderContainer from '../containers/HeaderContainer'
import InspectorChooser from "../containers/InspectorChooser"
import {computeCanvasSize, inspectorWidth} from "@neo4j-arrows/model";
import ExportContainer from "../containers/ExportContainer";
import GoogleSignInModal from "../components/editors/GoogleSignInModal";
import HelpModal from "../components/HelpModal";
import GoogleDrivePicker from '../components/GoogleDrivePickerWrapper'
import {getFileFromGoogleDrive, pickDiagramCancel} from "../actions/storage"
import FooterContainer from "../containers/FooterContainer";
import LocalStoragePickerContainer from "../containers/LocalStoragePickerContainer";
import SaveAsContainer from "../containers/SaveAsContainer";
import ImportContainer from "../containers/ImportContainer";
import {handlePaste} from "../actions/import";
import {handleCopy} from "../actions/export";
import {linkToGoogleFontsCss} from "../graphics/utils/fontWrangling";
import {handleImportMessage} from "../reducers/storage";
import { Button, Icon, Modal, Input, Form, Loader } from 'semantic-ui-react';
import {importNodesAndRelationships} from "../actions/graph";
import {Point} from "../model/Point";

import './App.css'

export interface AppProps {
  inspectorVisible:boolean;
  showSaveAsDialog:boolean;
  showExportDialog:boolean;
  showImportDialog:boolean;
  pickingFromGoogleDrive:boolean;
  pickingFromLocalStorage:boolean;
  onCancelPicker:any;
  loadFromGoogleDrive:any;
  canvasHeight:number;
  fireAction:any;
  handleCopy: (ev:ClipboardEvent) => void;
  handlePaste: (ev:ClipboardEvent) => void;
  handleImportMessage: (ev:MessageEvent<any>) => void;
  onWindowResized: (this: Window, ev: UIEvent) => any;
  graph: any;  // Current graph from Redux
  dispatch: any;  // Redux dispatch
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  summary?: {
    nodes_added: number;
    nodes_removed: number;
    relationships_added: number;
    relationships_removed: number;
  };
}

interface AppState {
  chatModalOpen: boolean;
  chatMessages: ChatMessage[];
  chatSessionId: string | null;
  chatLoading: boolean;
  chatError: string | null;
  chatInputValue: string;
}

class App extends Component<AppProps, AppState> {
  private chatBodyRef: React.RefObject<HTMLDivElement>;

  constructor (props:AppProps) {
    super(props)
    this.state = {
      chatModalOpen: false,
      chatMessages: [],
      chatSessionId: null,
      chatLoading: false,
      chatError: null,
      chatInputValue: ''
    }
    this.chatBodyRef = React.createRef();
    linkToGoogleFontsCss()
    window.addEventListener('keydown', this.fireKeyboardShortcutAction.bind(this))
    window.addEventListener('copy', this.handleCopy.bind(this))
    window.addEventListener('paste', this.handlePaste.bind(this))
    window.addEventListener('message', this.handleMessage.bind(this))
  }

  // Get current graph from Redux for chat-build API
  getCurrentGraph = () => {
    const { graph } = this.props;
    return {
      nodes: graph.nodes || [],
      relationships: graph.relationships || [],
      style: graph.style || {}
    };
  }

  // Transform backend graph format to frontend Point instances
  transformBackendGraph = (backendGraph: any) => {
    return {
      nodes: backendGraph.nodes.map((node: any) => ({
        ...node,
        position: new Point(
          parseFloat(node.position.x),
          parseFloat(node.position.y)
        )
      })),
      relationships: backendGraph.relationships,
      style: backendGraph.style
    };
  }

  // Call backend chat-build API
  handleChatSend = async () => {
    const { chatInputValue, chatSessionId } = this.state;

    if (!chatInputValue.trim()) return;

    // Add user message to chat
    const userMessage: ChatMessage = {
      role: 'user',
      content: chatInputValue
    };

    this.setState({
      chatMessages: [...this.state.chatMessages, userMessage],
      chatInputValue: '',
      chatLoading: true,
      chatError: null
    }, () => this.scrollChatToBottom());

    try {
      // Get current graph from canvas
      const currentGraph = this.getCurrentGraph();

      // Call backend API
      const response = await fetch('http://localhost:8000/api/v1/workflow/chat-build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: chatInputValue,
          current_graph: currentGraph,
          session_id: chatSessionId
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail?.details || 'Failed to build workflow');
      }

      const result = await response.json();
      console.log('✅ Backend response:', result);

      // Update session ID
      this.setState({ chatSessionId: result.session_id });

      // Transform backend graph format to frontend format (plain objects → Point instances)
      const transformedGraph = this.transformBackendGraph(result.updated_graph);
      console.log('✅ Transformed graph (with Point instances):', transformedGraph);

      // Apply updated graph to canvas
      this.props.dispatch(importNodesAndRelationships(transformedGraph));
      console.log('✅ Graph applied to canvas!');

      // Add assistant message
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: result.message,
        summary: result.changes_summary
      };

      this.setState({
        chatMessages: [...this.state.chatMessages, assistantMessage],
        chatLoading: false
      }, () => this.scrollChatToBottom());

    } catch (error: any) {
      console.error('Chat build error:', error);

      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Error: ${error.message}`
      };

      this.setState({
        chatMessages: [...this.state.chatMessages, errorMessage],
        chatLoading: false,
        chatError: error.message
      }, () => this.scrollChatToBottom());
    }
  }

  // Handle Enter key press
  handleChatKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleChatSend();
    }
  }

  // Auto-scroll chat to bottom
  scrollChatToBottom = () => {
    if (this.chatBodyRef.current) {
      this.chatBodyRef.current.scrollTop = this.chatBodyRef.current.scrollHeight;
    }
  }

  render() {
    const {
      inspectorVisible,
      showSaveAsDialog,
      showExportDialog,
      showImportDialog,
      pickingFromGoogleDrive,
      pickingFromLocalStorage,
      onCancelPicker,
      loadFromGoogleDrive
    } = this.props

    const saveAsModal = showSaveAsDialog ? (<SaveAsContainer/>) : null
    const exportModal = showExportDialog ? (<ExportContainer/>) : null
    const importModal = showImportDialog ? (<ImportContainer/>) : null
    const googleDriveModal = pickingFromGoogleDrive ? <GoogleDrivePicker onCancelPicker={onCancelPicker} onFilePicked={loadFromGoogleDrive} /> : null
    const localStorageModal = pickingFromLocalStorage ? <LocalStoragePickerContainer/> : null

    const inspector = inspectorVisible ? (
      <aside style={{
        width: inspectorWidth,
        height: this.props.canvasHeight,
        overflowY: 'scroll',
        borderLeft: '1px solid #D4D4D5',
      }}>
          <InspectorChooser/>
      </aside>
    ) : null

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        margin: 0
      }}>
        {saveAsModal}
        {exportModal}
        {importModal}
        {googleDriveModal}
        {localStorageModal}
        <GoogleSignInModal/>
        <HelpModal/>
        <HeaderContainer/>
        <section style={{
          flex: 2,
          display: 'flex',
          flexDirection: 'row'
        }}>
          <GraphContainer/>
          {inspector}
        </section>
        <FooterContainer/>

        {/* Floating Chat Button - Only visible when chat is closed */}
        {!this.state.chatModalOpen && (
          <div
            onClick={() => this.setState({ chatModalOpen: true })}
            style={{
              position: 'fixed',
              bottom: '20px',
              right: '20px',
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#D32F2F',
              boxShadow: '0 4px 12px rgba(211, 47, 47, 0.4)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(211, 47, 47, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(211, 47, 47, 0.4)';
            }}
          >
            <Icon name='comment outline' style={{ color: 'white', margin: 0, fontSize: '24px' }} />
          </div>
        )}

        {/* Chat Window - Only visible when open */}
        {this.state.chatModalOpen && (
          <div style={{
            position: 'fixed',
            bottom: '90px',
            right: '20px',
            width: '380px',
            height: '580px',
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
            zIndex: 1001,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              background: '#1a1a1a',
              color: 'white',
              padding: '16px 20px',
              position: 'relative',
            }}>
              {/* Close button (X) - Non-negotiable */}
              <div
                onClick={() => this.setState({ chatModalOpen: false })}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
              >
                <Icon name='close' style={{ margin: 0, fontSize: '16px', color: 'white' }} />
              </div>

              <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
                arrows.app
              </div>
              <div style={{ fontSize: '16px', fontWeight: '700', marginBottom: '4px' }}>
                AI Workflow Builder
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>
                Create diagrams through conversation
              </div>
            </div>

            {/* Chat Body */}
            <div
              ref={this.chatBodyRef}
              style={{
                flex: 1,
                padding: '20px',
                background: '#f5f5f5',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: this.state.chatMessages.length === 0 ? 'center' : 'flex-start',
                justifyContent: this.state.chatMessages.length === 0 ? 'center' : 'flex-start',
              }}>
              {/* Empty State */}
              {this.state.chatMessages.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  color: '#666',
                }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
                  <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                    Start a conversation
                  </div>
                  <div style={{ fontSize: '14px', marginBottom: '16px' }}>
                    Describe your workflow and I'll help you build it
                  </div>
                  <div style={{ fontSize: '12px', color: '#999', fontStyle: 'italic' }}>
                    Try: "Create a calculator agent with addition and subtraction tools"
                  </div>
                </div>
              )}

              {/* Messages */}
              {this.state.chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    width: '100%',
                    marginBottom: '12px',
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}>
                  <div style={{
                    maxWidth: '80%',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: msg.role === 'user' ? '#D32F2F' : 'white',
                    color: msg.role === 'user' ? 'white' : '#333',
                    fontSize: '14px',
                    lineHeight: '1.4',
                    boxShadow: msg.role === 'assistant' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  }}>
                    <div>{msg.content}</div>
                    {msg.summary && (
                      <div style={{
                        marginTop: '8px',
                        paddingTop: '8px',
                        borderTop: '1px solid rgba(0,0,0,0.1)',
                        fontSize: '12px',
                        opacity: 0.8,
                      }}>
                        {msg.summary.nodes_added > 0 && <span>+{msg.summary.nodes_added} nodes </span>}
                        {msg.summary.nodes_removed > 0 && <span>-{msg.summary.nodes_removed} nodes </span>}
                        {msg.summary.relationships_added > 0 && <span>+{msg.summary.relationships_added} edges </span>}
                        {msg.summary.relationships_removed > 0 && <span>-{msg.summary.relationships_removed} edges</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Loading Indicator */}
              {this.state.chatLoading && (
                <div style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'flex-start',
                  marginBottom: '12px',
                }}>
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: 'white',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  }}>
                    <Loader active inline size='tiny' /> Generating workflow...
                  </div>
                </div>
              )}
            </div>

            {/* Input Area - Non-negotiable features */}
            <div style={{
              padding: '16px',
              background: 'white',
              borderTop: '1px solid #e0e0e0',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#f5f5f5',
                borderRadius: '24px',
                padding: '8px 12px',
              }}>
                {/* File attachment icon - Non-negotiable */}
                <span
                  style={{
                    fontSize: '20px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Attach file"
                >
                  📎
                </span>

                {/* Message input - Non-negotiable */}
                <input
                  type='text'
                  placeholder='Type your message...'
                  value={this.state.chatInputValue}
                  onChange={(e) => this.setState({ chatInputValue: e.target.value })}
                  onKeyPress={this.handleChatKeyPress}
                  disabled={this.state.chatLoading}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    fontSize: '14px',
                    padding: '4px',
                  }}
                />

                {/* Emoji icon - Non-negotiable */}
                <span
                  style={{
                    fontSize: '20px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Add emoji"
                >
                  😊
                </span>

                {/* Send button - Non-negotiable */}
                <Icon
                  name='paper plane'
                  onClick={this.handleChatSend}
                  style={{
                    color: this.state.chatLoading ? '#ccc' : '#D32F2F',
                    cursor: this.state.chatLoading ? 'not-allowed' : 'pointer',
                    margin: 0,
                    fontSize: '18px',
                    opacity: this.state.chatLoading ? 0.5 : 1,
                  }}
                  title="Send message"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  fireKeyboardShortcutAction(ev:KeyboardEvent) {
    if (ignoreTarget(ev)) return

    const handled = this.props.fireAction(ev)
    if (handled) {
      ev.preventDefault()
      ev.stopPropagation()
    }
  }

  handleCopy(ev:ClipboardEvent) {
    if (ignoreTarget(ev)) return
    console.log('copying')
    this.props.handleCopy(ev)
  }

  handlePaste(ev:ClipboardEvent) {
    if (ignoreTarget(ev)) return
    this.props.handlePaste(ev)
  }

  handleMessage(ev:MessageEvent<any>) {
    this.props.handleImportMessage(ev)
  }

  componentDidMount() {
    window.addEventListener('resize', this.props.onWindowResized)
  }
}

const mapStateToProps = (state:any) => ({
  inspectorVisible: state.applicationLayout.inspectorVisible,
  canvasHeight: computeCanvasSize(state.applicationLayout).height,
  pickingFromGoogleDrive: state.storage.status === 'PICKING_FROM_GOOGLE_DRIVE',
  pickingFromLocalStorage: state.storage.status === 'PICKING_FROM_LOCAL_STORAGE',
  showSaveAsDialog: state.applicationDialogs.showSaveAsDialog,
  showExportDialog: state.applicationDialogs.showExportDialog,
  showImportDialog: state.applicationDialogs.showImportDialog,
  graph: state.graph.present || state.graph  // Current graph for chat-build
})


const mapDispatchToProps = (dispatch:any) => {
  return {
    onWindowResized: () => dispatch(windowResized(window.innerWidth, window.innerHeight)),
    onCancelPicker: () => dispatch(pickDiagramCancel()),
    loadFromGoogleDrive: (fileId:any) => dispatch(getFileFromGoogleDrive(fileId)),
    handleCopy: () => dispatch(handleCopy()),
    handlePaste: (clipboardEvent:any) => dispatch(handlePaste(clipboardEvent)),
    handleImportMessage: (message:any) => dispatch(handleImportMessage(message)),
    dispatch  // Expose dispatch for importNodesAndRelationships
  }
}

// NOTE: compose(a,b,c)(X) ==[BECOMES]=> a(b(c(X)))
// export default compose(
//   connect(mapStateToProps, mapDispatchToProps),
//   withKeybindings
// )(App)
export default connect(mapStateToProps, mapDispatchToProps)(withKeybindings(App))
