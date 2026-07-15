import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { StoreProvider } from './store/store';
import { ExportStoreProvider } from './store/exportStore';
import { DeskProvider } from './store/desk';
import { AuthGate } from './components/AuthGate';
import './styles/index.css';
import './styles/tokens.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthGate>
        <StoreProvider>
          <ExportStoreProvider>
            <DeskProvider>
              <App />
            </DeskProvider>
          </ExportStoreProvider>
        </StoreProvider>
      </AuthGate>
    </BrowserRouter>
  </React.StrictMode>,
);
