import { buildApp } from './app';
import { loadConfig } from './config';

const { port } = loadConfig();
const app = await buildApp();
await app.listen({ port, host: '0.0.0.0' });
