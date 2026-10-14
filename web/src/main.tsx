import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { loadRuntime } from './config';
import { RuntimeContext } from './context';
import App from './App';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
const query = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: true } } });
loadRuntime().then(runtime => root.render(<StrictMode><RuntimeContext.Provider value={runtime}><WagmiProvider config={runtime.walletConfig}><QueryClientProvider client={query}><App /></QueryClientProvider></WagmiProvider></RuntimeContext.Provider></StrictMode>)).catch(error => {
  root.render(<main className="boot-error"><h1>Loom could not load.</h1><p role="alert">{error instanceof Error ? error.message : 'The deployment could not be read.'}</p><button className="button primary" onClick={() => location.reload()}>Reload Loom</button></main>);
});
