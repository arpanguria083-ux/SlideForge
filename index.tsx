import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './services/queries/queryClient';

const Devtools =
  import.meta.env.DEV
    ? React.lazy(() =>
        import('@tanstack/react-query-devtools').then((mod) => ({
          default: mod.ReactQueryDevtools,
        }))
      )
    : null;

// Global unhandled Promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise rejection:', event.reason);
  // Prevent default browser error handling to allow graceful recovery
  event.preventDefault();
});

// Global error handler for synchronous errors
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {Devtools ? (
        <React.Suspense fallback={null}>
          <Devtools initialIsOpen={false} />
        </React.Suspense>
      ) : null}
    </QueryClientProvider>
  </React.StrictMode>
);
