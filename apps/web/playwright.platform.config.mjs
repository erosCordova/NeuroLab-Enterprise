import {defineConfig} from '@playwright/test';
import path from 'node:path';
export default defineConfig({
 testDir:'./tests/e2e',testMatch:'platform.spec.mjs',workers:1,timeout:45000,
 expect:{timeout:10000},reporter:'list',
 use:{baseURL:'http://127.0.0.1:4188',browserName:'chromium',viewport:{width:1440,height:1000}},
 webServer:[
  {command:'python -m uvicorn app.main:app --host 127.0.0.1 --port 8011',cwd:path.resolve('../../services/api'),url:'http://127.0.0.1:8011/api/v1/health',reuseExistingServer:false,
   env:{DATABASE_URL:process.env.TEST_DATABASE_URL,COOKIE_SECURE:'false',APP_ORIGINS:'http://127.0.0.1:4188'}},
  {command:'npm run dev -- --host 127.0.0.1 --port 4188 --strictPort',url:'http://127.0.0.1:4188',reuseExistingServer:false,
   env:{VITE_USE_API:'true',NEUROLAB_API_PROXY:'http://127.0.0.1:8011'}},
 ],
});
