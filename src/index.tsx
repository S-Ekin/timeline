import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LoadApp from './components/LoadApp';
import { ErrorBoundary } from './ErrorBoundary';

console.log('[TimeLine] index.tsx loaded, SDK dashboard.state =', (window as any).dashboard?.state);

window.addEventListener('error', (e) => {
  console.error('[TimeLine window.error]', e.message, e.error);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[TimeLine unhandledrejection]', e.reason);
});

const rootEl = document.getElementById('root');
if (!rootEl) {
  document.body.innerHTML = '<div style="padding:20px;color:red">#root not found</div>';
} else {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <LoadApp>
          <App />
        </LoadApp>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
