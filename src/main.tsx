import {StrictMode} from 'react';
import ReactDOM from 'react-dom';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Polyfill findDOMNode for React 19 compatibility with older libraries like react-quill
// @ts-ignore
if (!ReactDOM.findDOMNode) {
  // @ts-ignore
  ReactDOM.findDOMNode = (instance: any) => {
    if (!instance) return null;
    if (instance instanceof HTMLElement) return instance;
    return null;
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
