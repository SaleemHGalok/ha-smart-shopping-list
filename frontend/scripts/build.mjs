import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('custom_components/smart_shopping_list/www', { recursive: true });
await mkdir('frontend/dist', { recursive: true });
for (const path of ['frontend/dist', 'custom_components/smart_shopping_list/www']) {
  await copyFile('frontend/src/smart-shopping-card.js', `${path}/smart-shopping-card.js`);
}
console.log('Built standalone card and integration resource');
