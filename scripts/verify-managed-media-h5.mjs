// Isolated component verification. No preview server, real account, or live API is used.
import assert from 'node:assert/strict'
import process from 'node:process'
import console from 'node:console'
import { createRequire } from 'node:module'
import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const repository = process.cwd()
const requireApi = createRequire(resolve(repository, 'apps/api/package.json'))
const sharp = requireApi('sharp')
const requireMini = createRequire(resolve(repository, 'apps/mini-program/package.json'))
const mediaCss = requireMini('sass').compile(
  resolve(repository, 'apps/mini-program/src/features/managed-media/index.h5.scss'),
).css
const pnpmDirectory = resolve(repository, 'node_modules/.pnpm')
const esbuildFolder = (await readdir(pnpmDirectory))
  .filter((name) => /^esbuild@/.test(name))
  .sort()
  .at(-1)
assert.ok(esbuildFolder, 'Install workspace dependencies first')
const { build } = createRequire(
  resolve(pnpmDirectory, esbuildFolder, 'node_modules/esbuild/package.json'),
)('esbuild')
const temporary = await mkdtemp(resolve(tmpdir(), 'xiaoqiu-media-h5-'))
const poster = await sharp({
  create: { width: 320, height: 180, channels: 3, background: '#336644' },
})
  .webp()
  .toBuffer()
const image = await sharp({
  create: { width: 128, height: 128, channels: 3, background: '#446633' },
})
  .png()
  .toBuffer()
const gif = await sharp({
  create: { width: 32, height: 64, pageHeight: 32, channels: 3, background: '#887744' },
})
  .gif({ delay: [100, 100] })
  .toBuffer()
const asset = {
  id: '00000000-0000-4000-8000-000000000011',
  purpose: 'GOAL_GIF',
  targetId: '00000000-0000-4000-8000-000000000012',
  targetLabel: '虚构测试球友的个人背景',
  matchId: '00000000-0000-4000-8000-000000000013',
  bytes: 40960,
  durationMs: 300,
  posterUrl: `data:image/webp;base64,${poster.toString('base64')}`,
  contentUrl: `data:image/gif;base64,${gif.toString('base64')}`,
  createdAt: '2026-10-04T09:00:00Z',
  status: 'PENDING',
  visibility: 'ACTIVE',
  associationState: 'CURRENT',
  canRestore: true,
  version: 0,
}
const mockSession = `export function readSession() { return {accessToken:'fictional-local-ui-test-session',user:{id:'00000000-0000-4000-8000-000000000099',organizationId:'00000000-0000-4000-8000-000000000001',roles:[],linkedPlayer:null}} } export function subscribeToSessionChanges() { return () => {} }`
const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {GoalMedia,MediaUploadButton,MediaLibraryButton} from './apps/mini-program/src/features/managed-media/index.h5'; const root=createRoot(document.getElementById('root'));function render(){root.render(<main><h1>进球媒体 · 隔离验证</h1><MediaUploadButton purpose="USER_BACKGROUND" targetId="00000000-0000-4000-8000-000000000099" label="更换个人背景"/><MediaLibraryButton/><MediaLibraryButton review/><GoalMedia asset={window.fixture}/></main>)}window.swapGoal=()=>{window.fixture={...window.fixture,id:'00000000-0000-4000-8000-000000000033'};render()};render();`,
    resolveDir: repository,
    loader: 'tsx',
  },
  absWorkingDir: repository,
  tsconfigRaw: { compilerOptions: { jsx: 'react-jsx' } },
  bundle: true,
  write: false,
  format: 'iife',
  jsx: 'automatic',
  nodePaths: [resolve(repository, 'apps/mini-program/node_modules')],
  plugins: [
    {
      name: 'isolated-runtime',
      setup(builder) {
        builder.onResolve({ filter: /^@tarojs\/taro$/ }, () => ({
          path: 'taro',
          namespace: 'mock',
        }))
        builder.onResolve({ filter: /\/session(?:\.h5)?$/ }, () => ({
          path: 'session',
          namespace: 'mock',
        }))
        builder.onResolve({ filter: /\/product\.repository$/ }, () => ({
          path: 'url',
          namespace: 'mock',
        }))
        builder.onResolve({ filter: /\.scss$/ }, () => ({ path: 'style', namespace: 'mock' }))
        builder.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({
          loader: 'js',
          contents:
            args.path === 'session'
              ? mockSession
              : args.path === 'url'
                ? 'export function resolveMediaUrl(path) { return path || undefined }'
                : args.path === 'taro'
                  ? `export default {showToast({title}) {window.lastToast=title;document.getElementById('toast').textContent=title;return Promise.resolve()}}`
                  : '',
        }))
      },
    },
  ],
})
const logic = String.raw`
const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message) };
const wait = async (predicate, label) => { for(let i=0;i<200;i++) { if(predicate()) return; await new Promise(r=>setTimeout(r,10)) } throw new Error('Timed out: '+label) };
const button = (text) => Array.from(document.querySelectorAll('button')).find(node=>node.textContent.trim()===text);
const close = async () => {document.querySelector('[aria-label="关闭"]').click();await wait(()=>!document.querySelector('[role=dialog]'),'dialog closed')};
(async () => { try {
  await wait(()=>button('更换个人背景'),'render');
  check(!button('更换个人背景').disabled,'closed feature keeps ordinary clickable label');
  button('更换个人背景').click();
  await wait(()=>window.lastToast==='功能暂未开放','closed feature feedback');
  check(!document.querySelector('[role="dialog"]'),'closed feature shows feedback without opening uploader');
  check(document.querySelector('.goal-media img').src.startsWith('data:image/webp'),'GIF bytes are absent from rendered image before click');
  const goalButton=document.querySelector('.goal-media button');
  goalButton.click(); await wait(()=>document.querySelector('.goal-media img').src.startsWith('data:image/gif'),'play');
  check(goalButton.getAttribute('aria-pressed')==='true','explicit click starts GIF with reduced motion enabled');
  await wait(()=>document.querySelector('.goal-media img').src.startsWith('data:image/webp'),'stop');
  check(goalButton.getAttribute('aria-pressed')==='false','GIF returns to static poster after one play');
  goalButton.click();await wait(()=>goalButton.getAttribute('aria-pressed')==='true','second explicit play');window.swapGoal();
  await wait(()=>document.querySelector('.goal-media img').src.startsWith('data:image/webp'),'replacement stops');
  check(goalButton.getAttribute('aria-pressed')==='false','replacing published asset stops playback and requires a new click');
  window.enabled=true;button('更换个人背景').click();
  await wait(()=>document.querySelector('input[type=file]'),'upload dialog');
  check(document.querySelector('[role=dialog]').textContent.includes('经审核显示'),'normal user is told review is required');
  const bytes=Uint8Array.from(atob(window.png),c=>c.charCodeAt(0));
  const file=new File([bytes],'fictional-background.png',{type:'image/png'});const transfer=new DataTransfer();transfer.items.add(file);
  const input=document.querySelector('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  await wait(()=>button('提交')&&!button('提交').disabled,'selected file');button('提交').click();
  await wait(()=>document.querySelector('[role=dialog]').textContent.includes('投稿已提交'),'submit');
  check(window.submission.purpose==='USER_BACKGROUND' && window.submission.dataUrl.startsWith('data:image/png;base64,'),'file bytes and intended purpose reach upload API');
  check(window.submission.targetId==='00000000-0000-4000-8000-000000000099','background is associated with the current account');
  await close();button('我的投稿').click();await wait(()=>document.querySelector('[role=dialog]')?.textContent.includes('待审核'),'pending list');
  check(document.querySelector('[role=dialog]').textContent.includes('个人背景'),'my submissions reports pending purpose');await close();
  window.rows.push({...window.fixture,id:'00000000-0000-4000-8000-000000000022',targetLabel:'虚构比赛 25 分钟进球'});
  button('媒体审核').click();await wait(()=>button('驳回'),'review queue');
  check(window.privateGifDownloads===0,'review queue does not download private GIF automatically');
  const preview=document.querySelector('.media-private-gif button');preview.click();
  await wait(()=>document.querySelector('.media-private-gif img')?.naturalWidth>0,'authorized private GIF preview');
  check(window.privateGifDownloads===1,'explicit review preview downloads and decodes private GIF');
  await wait(()=>!document.querySelector('.media-private-gif img'),'private GIF stopped');
  check(preview.getAttribute('aria-pressed')==='false','private GIF returns to its stopped state after one play');
  const textarea=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(textarea,'画面与投稿用途不符');textarea.dispatchEvent(new Event('input',{bubbles:true}));
  button('驳回').click();await wait(()=>document.querySelector('[role=dialog]').textContent.includes('已驳回'),'rejection');await close();
  button('我的投稿').click();await wait(()=>document.querySelector('[role=dialog]')?.textContent.includes('审核反馈：画面与投稿用途不符'),'feedback');
  check(true,'my submissions displays rejected status and reviewer feedback');
  document.querySelector('.media-private-poster button')?.click();
  await wait(()=>document.querySelector('.media-private-poster img')?.naturalWidth>0,'private static poster');
  check(true,'private reviewed submission displays a decoded static poster');
  document.getElementById('result').textContent=JSON.stringify({ok:true,checks});
} catch(error) { document.getElementById('result').textContent=JSON.stringify({ok:false,error:error.message,checks}); } })();`
const html = `<!doctype html><meta charset="utf-8"><style></style><div id="root"></div><div id="toast" role="status"></div><pre id="result"></pre><script>
window.fixture=${JSON.stringify(asset)};window.png=${JSON.stringify(image.toString('base64'))};window.enabled=false;window.checks=[];window.rows=[];window.privateGifDownloads=0;
const originalFetch=window.fetch.bind(window);window.fetch=async(path,options={})=>{
  if(String(path).startsWith('data:')){if(String(path).startsWith('data:image/gif'))window.privateGifDownloads++;return originalFetch(path,options)}
  let result={};
  if(String(path).endsWith('capabilities'))result={schemaVersion:1,organizationId:'00000000-0000-4000-8000-000000000001',modules:{goalMedia:{enabled:window.enabled}},actions:{'goalMedia.submit':{enabled:window.enabled,scopes:[{type:'ORGANIZATION',id:'00000000-0000-4000-8000-000000000001'}]},'goalMedia.review':{enabled:window.enabled,scopes:[{type:'ORGANIZATION',id:'00000000-0000-4000-8000-000000000001'}]},'goalMedia.publish':{enabled:false,scopes:[]}}};
  else if(String(path)==='/api/media-assets'){window.submission=JSON.parse(options.body);const row={...window.fixture,purpose:window.submission.purpose,targetId:window.submission.targetId,matchId:null};window.rows=[row];result=row}
  else if(String(path).endsWith('/review')){const command=JSON.parse(options.body);const row=window.rows[0];row.status=command.action==='REJECT'?'REJECTED':'APPROVED';row.reviewReason=command.reason;row.version++;result=row}
  else result={items:window.rows,nextCursor:null};
  return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}})
};</script><script>${bundle.outputFiles[0].text}</script><script>${logic}</script>`
const htmlPath = resolve(temporary, 'managed-media-test.html')
await writeFile(
  htmlPath,
  html.replace(
    /<style>.*?<\/style>/,
    `<style>${mediaCss}body{font:14px system-ui;background:#f1f5f2;padding:30px}main{max-width:740px;margin:auto;background:white;padding:20px}#result{display:none}</style>`,
  ),
)
const chrome =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const run = spawnSync(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--host-resolver-rules=MAP * ~NOTFOUND',
    `--user-data-dir=${resolve(temporary, 'chrome-profile')}`,
    '--force-prefers-reduced-motion',
    '--virtual-time-budget=8000',
    '--dump-dom',
    `--screenshot=${resolve(temporary, 'managed-media.png')}`,
    pathToFileURL(htmlPath).href,
  ],
  { encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
)
if (run.error) throw run.error
await writeFile(resolve(temporary, 'browser-dom.html'), run.stdout)
const resultText = /<pre id="result">([^<]*)<\/pre>/.exec(run.stdout)?.[1]
assert.ok(resultText, `No browser result: ${run.stderr.slice(-1200)}`)
const result = JSON.parse(
  resultText
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<'),
)
assert.equal(result.ok, true, JSON.stringify({ ...result, evidence: temporary }))
console.log(
  JSON.stringify({ ...result, screenshot: resolve(temporary, 'managed-media.png') }, null, 2),
)
