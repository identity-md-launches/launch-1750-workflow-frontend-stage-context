import { createContext, useContext } from 'react';
import type { Runtime } from './config';
export const RuntimeContext = createContext<Runtime | null>(null);
export function useRuntime() { const runtime = useContext(RuntimeContext); if (!runtime) throw new Error('Loom is not ready.'); return runtime; }
