import { createRoot } from 'react-dom/client';
import { Component, type ReactNode } from 'react';
import { App } from './app/App';
import './styles/app.css';
class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div className="empty">
        <h1>CreateSpace could not display this workspace</h1>
        <p>{this.state.error}</p>
        <button className="smallbtn" onClick={() => location.reload()}>
          Reload workspace
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
