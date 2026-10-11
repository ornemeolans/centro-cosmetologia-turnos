import { createApp } from './app';
import { env } from './env';

createApp().listen(env.PORT, () => {
  console.log(`API escuchando en http://localhost:${env.PORT}/api/v1`);
});
