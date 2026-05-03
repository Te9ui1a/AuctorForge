import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { createApp } from './api/createApp';

const appRoot = fileURLToPath(new URL('../../..', import.meta.url));
const skillPackPath = path.join(appRoot, 'skill-packs/novel-flow-kit-0.1.5');
const port = Number(process.env.PORT ?? 3001);

const app = createApp({
  skillPackPath,
  userConfigDir: homedir(),
});

app.listen({ port, host: '127.0.0.1' }).then(() => {
  console.log(`Server listening on http://127.0.0.1:${port}`);
});
