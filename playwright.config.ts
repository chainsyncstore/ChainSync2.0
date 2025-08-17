import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/playwright',
  timeout: 120000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'off',
    video: 'off',
  },
  webServer: [
    {
      command: `node -e "import('node:child_process').then(({spawn})=>{const p=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','server/test-server.ts'],{stdio:'inherit',env:{...process.env,PORT:'5000',NODE_ENV:'test'}});process.on('SIGTERM',()=>p.kill('SIGTERM'));})"`,
      url: 'http://localhost:5000/healthz',
      timeout: 60000,
      reuseExistingServer: true,
    },
    {
      command: `node -e "import('node:http').then(http=>{const fs=require('fs');const path=require('path');const mime=(p)=>{if(p.endsWith('.js'))return'application/javascript';if(p.endsWith('.css'))return'text/css';if(p.endsWith('.html'))return'text/html';if(p.endsWith('.json'))return'application/json';if(p.endsWith('.svg'))return'image/svg+xml';if(p.match(/\\.(png|jpg|jpeg|gif|ico)$/))return'image/*';return'text/plain'};const root=path.resolve(process.cwd(),'dist','public');const server=http.createServer((req,res)=>{const url=req.url||'/';if(url.startsWith('/api/')){const options={hostname:'localhost',port:5000,path:url,method:req.method,headers:req.headers};const proxyReq=http.request(options,(proxyRes)=>{res.writeHead(proxyRes.statusCode||200,proxyRes.headers);proxyRes.pipe(res,{end:true});});req.pipe(proxyReq,{end:true});proxyReq.on('error',(e)=>{res.statusCode=502;res.end('proxy error')});return;}let reqPath=url.split('?')[0];if(reqPath==='/'||reqPath==='')reqPath='/index.html';let filePath=path.join(root,reqPath);fs.readFile(filePath,(err,data)=>{if(err){const indexPath=path.join(root,'index.html');fs.readFile(indexPath,(err2,data2)=>{if(err2){res.statusCode=404;return res.end('not found')}res.setHeader('Content-Type','text/html');res.statusCode=200;return res.end(data2)});}else{res.setHeader('Content-Type',mime(filePath));res.statusCode=200;res.end(data);}})});server.listen(3000,()=>console.log('Static web server on http://localhost:3000 (proxy /api -> :5000)'));process.on('SIGTERM',()=>process.exit(0));})"`,
      url: 'http://localhost:3000',
      timeout: 60000,
      reuseExistingServer: true,
    }
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});


