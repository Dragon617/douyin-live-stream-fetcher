console.log("[DEBUG] Server starting, PID:", process.pid);
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
// Puppeteer 可选（用于登录功能，未安装时不启用）
let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  console.log('[Puppeteer] 未安装，登录功能需要手动粘贴 Cookie');
}

const app = express();
const PORT = process.env.PORT || 3000;

// ========== Cookie 管理 ==========
const COOKIE_FILE = path.join(__dirname, 'cookies.json');

// 加载保存的Cookie
function loadCookies() {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      const data = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
      if (data.valid && data.cookies && data.cookies.length > 0) {
        console.log(`[Cookie] 加载了 ${data.cookies.length} 个Cookie`);
        return data;
      }
    }
  } catch (e) {
    console.log('[Cookie] 加载失败:', e.message);
  }
  return null;
}

// 保存Cookie
function saveCookies(cookieData) {
  try {
    const data = {
      cookies: cookieData.cookies || cookieData,
      loginTime: new Date().toISOString(),
      valid: true
    };
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(data, null, 2));
    console.log(`[Cookie] 已保存 ${data.cookies.length} 个Cookie`);
    return true;
  } catch (e) {
    console.log('[Cookie] 保存失败:', e.message);
    return false;
  }
}

// 获取Cookie字符串（用于HTTP请求头）
function getCookieString() {
  const data = loadCookies();
  if (!data || !data.cookies) return '';
  return data.cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

// 设置Cookie到Puppeteer页面
async function setCookiesOnPage(page) {
  const data = loadCookies();
  if (!data || !data.cookies) return false;
  for (const cookie of data.cookies) {
    try { await page.setCookie(cookie); } catch (e) {}
  }
  return true;
}

// 验证Cookie是否有效
async function validateCookies() {
  const cookieStr = getCookieString();
  if (!cookieStr) return false;
  try {
    const res = await httpRequest('https://www.douyin.com/', {
      headers: { 'Cookie': cookieStr }
    });
    return res.rawData && (res.rawData.includes('nickname') || res.rawData.includes('user'));
  } catch (e) { return false; }
}

// Puppeteer 已禁用 - 使用纯第三方API方案，无需本地浏览器
// 如需启用浏览器提取，引入下面代码：
// const puppeteer = require('puppeteer');
// async function getRoomInfoWithBrowser(roomId) { ... }

// ========== 全局变量 ==========
let loginBrowserInstance = null;
let loginPageInstance = null;
let isLoggingIn = false;
let loginResolve = null;

// ========== 中间件 ==========
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== HTTP请求封装 ==========
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const http = url.startsWith('https') ? require('https') : require('http');
    try {
      const req = http.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Referer': 'https://live.douyin.com/',
          ...options.headers
        },
        timeout: 15000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(data), rawData: data }); }
          catch (e) { resolve({ status: res.statusCode, data: null, rawData: data }); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    } catch (e) { reject(e); }
  });
}

// ========== 从URL提取直播间ID ==========
function extractRoomId(url) {
  const patterns = [
    /live\.douyin\.com\/(\d+)/,
    /www\.douyin\.com\/live\/(\d+)/,
    /v\.douyin\.com\/([a-zA-Z0-9_-]+)/,
    /(\d{10,})/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// ========== 解析抖音页面 ==========
async function parseDouyinPage(roomIdOrUrl, cookie = '') {
  try {
    let url = roomIdOrUrl;
    if (!url.includes('live.douyin.com')) {
      url = `https://live.douyin.com/${roomIdOrUrl}`;
    }
    const cookieToUse = cookie || getCookieString();
    const pageRes = await httpRequest(url, { headers: cookieToUse ? { 'Cookie': cookieToUse } : {} });
    const html = pageRes.rawData || '';
    if (html.includes('验证码中间页') || html.includes('captcha') || html.length < 10000) {
      console.log('收到验证码页面或内容过短，需要Cookie');
      return null;
    }
    let renderData = extractRenderData(html, '__RENDER_DATA__');
    if (renderData) { const result = parseRenderData(renderData); if (result && result.streams && result.streams.length > 0) return result; }
    let initState = extractRenderData(html, '__INITIAL_STATE__');
    if (initState) { const result = parseRenderData(initState); if (result && result.streams && result.streams.length > 0) return result; }
    console.log('页面解析方法均未找到直播流');
    return null;
  } catch (error) { console.log('页面解析异常:', error.message); return null; }
}

function extractRenderData(html, key) {
  const patterns = [
    new RegExp(`<script id="${key}" type="application/json">([^<]+)</script>`),
    new RegExp(`window\\.${key}\\s*=\\s*({.+?});`, 's'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      try {
        let data = match[1].trim();
        data = data.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        return JSON.parse(data);
      } catch (e) {}
    }
  }
  return null;
}

function parseRenderData(data) {
  try {
    const roomInfo = data?.roomStore?.roomInfo?.roomInfo || data?.roomInfo || data;
    if (!roomInfo) return null;
    const streams = [];
    const streamUrl = roomInfo.stream_url || {};
    const qualityNames = { 'FULL_HD1':'超清','HD1':'高清','SD1':'标清','SD2':'流畅','MAIN':'原画','ld':'流畅','sd':'标清','hd':'高清','uhd':'超清','origin':'原画' };
    const flvMap = streamUrl.flv_pull_url || {};
    const hlsMap = streamUrl.hls_pull_url || {};
    if (Object.keys(flvMap).length > 0) {
      Object.entries(flvMap).forEach(([key, u]) => { if (u && !streams.find(s => s.url === u)) streams.push({ quality: qualityNames[key] || key, url: u, type: 'flv' }); });
    }
    if (streams.length === 0 && Object.keys(hlsMap).length > 0) {
      Object.entries(hlsMap).forEach(([key, u]) => { if (u && !streams.find(s => s.url === u)) streams.push({ quality: (qualityNames[key] || key) + '(HLS)', url: u, type: 'hls' }); });
    }
    if (streams.length === 0 && streamUrl.main_url) streams.push({ quality: '原画', url: streamUrl.main_url, type: 'flv' });
    const title = roomInfo.title || '直播间';
    const anchor = roomInfo.owner?.nickname || roomInfo.anchor?.nickname || '主播';
    const cover = roomInfo.cover?.url_list?.[0] || roomInfo.cover_url || '';
    let status = 0;
    if (roomInfo.status === 2 || roomInfo.status === '2' || roomInfo.is_live === true) status = 1;
    return { success: streams.length > 0 || status === 1, roomId: String(roomInfo.room_id || roomInfo.id || ''), title: String(title), anchor: String(anchor), cover: String(cover), status, streams };
  } catch (error) { console.log('解析渲染数据异常:', error.message); return null; }
}

// ========== 第三方API ==========
async function fetchFromThirdPartyAPI(roomId) {
  const apis = [
    async () => {
      try {
        const res = await httpPost('https://api.douyin.wtf/api', { url: `https://live.douyin.com/${roomId}` }, { 'Origin': 'https://douyin.wtf', 'Referer': 'https://douyin.wtf/' });
        if (res.data?.success && res.data.data) {
          const d = res.data.data;
          return { success: true, roomId, title: d.title || '直播间', anchor: d.nickname || '主播', streams: d.stream_url ? [{ quality: '原画', url: d.stream_url, type: 'flv' }] : [] };
        }
      } catch (e) {}
      return null;
    },
    async () => {
      try {
        const res = await httpRequest(`https://api.tikmate.app/api/room/${roomId}`);
        if (res.data?.stream_url) {
          return { success: true, roomId, title: res.data.title || '直播间', anchor: res.data.nickname || '主播', streams: [{ quality: '原画', url: res.data.stream_url, type: 'flv' }] };
        }
      } catch (e) {}
      return null;
    }
  ];
  for (const api of apis) { const result = await api(); if (result && result.streams && result.streams.length > 0) return result; }
  return null;
}

// ========== 视频第三方API ==========
async function fetchVideoFromThirdParty(url) {
  // 尝试第三方API
  const apis = [
    async () => {
      try {
        // 短链接解析
        let finalUrl = url;
        if (url.includes('v.douyin.com')) {
          const res = await httpRequest(url);
          const match = res.rawData?.match(/https:\/\/www\.douyin\.com\/video\/(\d+)/);
          if (match) finalUrl = `https://www.douyin.com/video/${match[1]}`;
          else {
            const mobileMatch = res.rawData?.match(/https:\/\/www\.iesdouyin\.com\/share\/video\/(\d+)/);
            if (mobileMatch) finalUrl = `https://www.douyin.com/video/${mobileMatch[1]}`;
          }
        }
        // 提取视频ID
        const videoIdMatch = finalUrl.match(/video\/(\d+)/);
        if (!videoIdMatch) return null;
        const videoId = videoIdMatch[1];
        
        // 使用第三方API获取视频
        const res = await httpPost('https://api.douyin.wtf/api', { url: finalUrl }, { 'Origin': 'https://douyin.wtf', 'Referer': 'https://douyin.wtf/' });
        if (res.data?.success && res.data.data) {
          const d = res.data.data;
          return {
            success: true,
            videoId: videoId,
            title: d.title || '抖音视频',
            author: d.nickname || '未知',
            cover: d.cover || '',
            playUrl: d.play_url || d.url || '',
            duration: d.duration || 0
          };
        }
      } catch (e) {
        console.log('[Video] 第三方API失败:', e.message);
      }
      return null;
    }
  ];
  
  for (const api of apis) {
    const result = await api();
    if (result && result.success) return result;
  }
  return null;
}

function httpPost(requestUrl, postData, headers = {}) {
  return new Promise((resolve, reject) => {
    const http = requestUrl.startsWith('https') ? require('https') : require('http');
    const urlObj = new URL(requestUrl);
    const options = { hostname: urlObj.hostname, port: urlObj.port || (requestUrl.startsWith('https') ? 443 : 80), path: urlObj.pathname + urlObj.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json, text/plain, */*', 'Referer': 'https://live.douyin.com/', ...headers }, timeout: 15000 };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(data), rawData: data }); } catch (e) { resolve({ status: res.statusCode, data: null, rawData: data }); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    req.end();
  });
}

// ========== 登录路由 ==========

// 启动登录浏览器
app.get('/api/login/start', async (req, res) => {
  if (!puppeteer) {
    return res.json({ 
      success: false, 
      error: 'Puppeteer 未安装，请在本地运行 npm run login 后复制 cookies.json 到服务器',
      hint: '或使用手动粘贴 Cookie 方式'
    });
  }
  
  if (isLoggingIn) {
    return res.json({ success: false, error: '已有登录流程在进行中' });
  }
  
  isLoggingIn = true;
  
  try {
    console.log('[Login] 启动浏览器...');
    loginBrowserInstance = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    loginPageInstance = await loginBrowserInstance.newPage();
    await loginPageInstance.goto('https://www.douyin.com', { waitUntil: 'networkidle2' });
    
    console.log('[Login] 浏览器已打开，等待用户登录...');
    
    // 启动检测登录状态的轮询
    checkLoginStatus();
    
    res.json({ success: true, message: '浏览器已打开，请完成登录' });
  } catch (e) {
    console.error('[Login] 启动失败:', e.message);
    isLoggingIn = false;
    res.status(500).json({ success: false, error: e.message });
  }
});

// 检查登录状态
app.get('/api/login/status', async (req, res) => {
  if (!isLoggingIn) {
    const data = loadCookies();
    return res.json({ 
      success: true, 
      loggedIn: data && data.valid,
      cookieCount: data ? data.cookies.length : 0
    });
  }
  
  res.json({ success: true, loggedIn: false, inProgress: true });
});

// 自动检测登录状态
async function checkLoginStatus() {
  const maxAttempts = 120; // 10分钟
  let attempts = 0;
  
  const interval = setInterval(async () => {
    if (!isLoggingIn || !loginPageInstance) {
      clearInterval(interval);
      return;
    }
    
    try {
      const cookies = await loginPageInstance.cookies('https://www.douyin.com');
      const hasSession = cookies.some(c => c.name === 'sessionid' || c.name === '__ac_signature');
      
      if (hasSession) {
        console.log('[Login] 检测到登录成功！');
        clearInterval(interval);
        
        // 保存Cookie
        const cookieData = {
          cookies: cookies,
          loginTime: new Date().toISOString(),
          valid: true
        };
        fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookieData, null, 2));
        
        console.log(`[Login] 已保存 ${cookies.length} 个Cookie`);
        
        // 关闭浏览器
        await loginBrowserInstance.close();
        loginBrowserInstance = null;
        loginPageInstance = null;
        isLoggingIn = false;
        
        console.log('[Login] 登录流程完成');
      }
    } catch (e) {
      console.log('[Login] 检测出错:', e.message);
    }
    
    attempts++;
    if (attempts >= maxAttempts) {
      console.log('[Login] 登录超时');
      clearInterval(interval);
      if (loginBrowserInstance) {
        await loginBrowserInstance.close();
      }
      loginBrowserInstance = null;
      loginPageInstance = null;
      isLoggingIn = false;
    }
  }, 5000); // 每5秒检查一次
}

// 保存手动输入的Cookie（备用方案）
app.post('/api/login/save-cookies', express.json(), async (req, res) => {
  try {
    const { cookieString } = req.body;
    if (!cookieString || typeof cookieString !== 'string') {
      return res.status(400).json({ success: false, error: 'Cookie内容不能为空' });
    }
    // 解析 cookieString，格式：name1=value1; name2=value2; ...
    const cookies = [];
    const pairs = cookieString.split(';').map(s => s.trim()).filter(Boolean);
    for (const pair of pairs) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) continue;
      const name = pair.substring(0, eqIdx).trim();
      const value = pair.substring(eqIdx + 1).trim();
      if (!name) continue;
      cookies.push({
        name,
        value,
        domain: '.douyin.com',
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'Lax'
      });
    }
    if (cookies.length === 0) {
      return res.status(400).json({ success: false, error: '未能解析出任何Cookie，请检查格式' });
    }
    saveCookies({ cookies });
    console.log(`[Login] 手动保存了 ${cookies.length} 个Cookie`);
    res.json({ success: true, count: cookies.length });
  } catch (e) {
    console.error('[Login] 保存Cookie失败:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// 检查登录状态
app.get('/api/login/status', async (req, res) => {
  const data = loadCookies();
  if (data && data.valid && data.cookies && data.cookies.length > 0) {
    const valid = await validateCookies();
    return res.json({ success: true, loggedIn: valid, cookieCount: data.cookies.length, loginTime: data.loginTime });
  }
  return res.json({ success: true, loggedIn: false });
});

// 退出登录
app.post('/api/login/logout', async (req, res) => {
  try {
    if (fs.existsSync(COOKIE_FILE)) fs.unlinkSync(COOKIE_FILE);
    res.json({ success: true, message: '已退出登录' });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ========== 视频下载路由 ==========

// 解析单个视频信息
app.post('/api/video/info', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: '请输入视频链接' });
    
    console.log('[Video] 解析视频:', url);
    
    // 首先尝试第三方API（无需登录）
    const thirdPartyResult = await fetchVideoFromThirdParty(url);
    if (thirdPartyResult && thirdPartyResult.success) {
      console.log('[Video] 第三方API成功');
      return res.json(thirdPartyResult);
    }
    
    // 如果第三方失败，尝试官方API（可能需要Cookie）
    const videoId = extractVideoId(url);
    if (!videoId) return res.status(400).json({ success: false, error: '无法识别视频链接' });
    
    const cookieStr = getCookieString();
    const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}`;
    const result = await httpRequest(apiUrl, { headers: cookieStr ? { 'Cookie': cookieStr } : {} });
    
    if (result.data && result.data.aweme_detail) {
      const video = result.data.aweme_detail;
      const playAddr = video.video?.play_addr?.url_list?.[0] || '';
      return res.json({
        success: true,
        videoId: videoId,
        title: video.desc || '抖音视频',
        author: video.author?.nickname || '未知',
        cover: video.video?.cover?.url_list?.[0] || '',
        playUrl: playAddr,
        duration: video.video?.duration || 0
      });
    }
    
    return res.json({ success: false, error: '获取视频信息失败，请尝试登录后重试' });
  } catch (e) {
    console.log('[Video] 错误:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// 获取用户作品列表
app.post('/api/video/list', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: '请输入用户主页链接' });
    const secUserId = extractSecUserId(url);
    if (!secUserId) return res.status(400).json({ success: false, error: '无法识别用户主页链接' });
    const cookieStr = getCookieString();
    const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/post/?sec_user_id=${secUserId}&count=20&cursor=0`;
    const result = await httpRequest(apiUrl, { headers: cookieStr ? { 'Cookie': cookieStr } : {} });
    if (result.data && result.data.aweme_list) {
      const videos = result.data.aweme_list.map(v => ({
        videoId: v.aweme_id,
        title: v.desc || '抖音视频',
        author: v.author?.nickname || '未知',
        cover: v.video?.cover?.url_list?.[0] || '',
        playUrl: v.video?.play_addr?.url_list?.[0] || '',
        duration: v.video?.duration || 0
      }));
      return res.json({ success: true, videos, cursor: result.data.cursor || 0, hasMore: result.data.has_more === 1 });
    }
    return res.json({ success: false, error: '获取作品列表失败' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 下载视频
app.post('/api/video/download', async (req, res) => {
  try {
    const { videoId, playUrl } = req.body;
    if (!videoId && !playUrl) return res.status(400).json({ success: false, error: '缺少视频ID或播放地址' });
    const url = playUrl || (await getVideoPlayUrl(videoId));
    if (!url) return res.status(400).json({ success: false, error: '无法获取视频播放地址' });
    const downloadDir = path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });
    const fileName = `video_${videoId || Date.now()}.mp4`;
    const filePath = path.join(downloadDir, fileName);
    await downloadFile(url, filePath);
    return res.json({ success: true, downloadUrl: `/downloads/${fileName}`, fileName });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 提取视频ID
function extractVideoId(url) {
  const patterns = [/douyin\.com\/video\/(\d+)/, /v\.douyin\.com\/([a-zA-Z0-9_-]+)/, /(\d{15,})/];
  for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
  return null;
}

// 提取用户sec_user_id
function extractSecUserId(url) {
  const m = url.match(/sec_user_id=([^&\s]+)/) || url.match(/user\/([^?\/\s]+)/);
  return m ? m[1] : null;
}

// 获取视频播放地址
async function getVideoPlayUrl(videoId) {
  try {
    const cookieStr = getCookieString();
    const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}`;
    const result = await httpRequest(apiUrl, { headers: cookieStr ? { 'Cookie': cookieStr } : {} });
    return result.data?.aweme_detail?.video?.play_addr?.url_list?.[0] || null;
  } catch (e) { return null; }
}

// 下载文件
function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const http = url.startsWith('https') ? require('https') : require('http');
    const file = fs.createWriteStream(filePath);
    http.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (res) => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(filePath); });
    }).on('error', (e) => { fs.unlinkSync(filePath); reject(e); });
  });
}

// ========== 直播流解析API ==========
app.post('/api/parse', async (req, res) => {
  console.log('[DEBUG] Handler called');
  try {
    const { url, cookie } = req.body;
    if (!url) return res.status(400).json({ success: false, error: '请输入直播间链接' });
    const roomId = extractRoomId(url);
    if (!roomId) return res.status(400).json({ success: false, error: '无法识别的直播间链接格式' });
    const log = (...args) => console.log(new Date().toISOString(), ...args);
    log(`========== 解析直播间: ${roomId} ==========`);
    
    let result = null;
    console.log('[DEBUG] result initialized');
    
    // 策略1: 第三方API（无需登录，推荐）
    log('策略1: 第三方API...');
    console.log('[DEBUG] About to call fetchFromThirdPartyAPI');
    const apiResult = await fetchFromThirdPartyAPI(roomId);
    console.log('[DEBUG] apiResult:', apiResult);
    if (apiResult && apiResult.streams && apiResult.streams.length > 0) { 
      result = apiResult;
      log('策略1 成功');
    }
    
    // 策略2: 直接解析抖音页面
    if (!result || result.streams.length === 0) {
      log('策略2: 解析抖音页面...');
      const pageResult = await parseDouyinPage(roomId, cookie || '');
      if (pageResult && pageResult.streams.length > 0) {
        result = pageResult;
        log('策略2 成功');
      }
    }
    
    if (result) { 
      result.roomId = roomId; 
      log(`最终结果: streams=${result.streams.length}, status=${result.status}`); 
      return res.json(result); 
    }
    return res.json({ 
      success: true, 
      roomId, 
      title: '直播间', 
      anchor: '主播', 
      cover: '', 
      status: 0, 
      streams: [], 
      message: '未能获取到直播流信息，可能直播间未开播或链接格式不正确。' 
    });
  } catch (error) {
    console.error('解析错误:', error);
    res.status(500).json({ success: false, error: '服务器错误: ' + error.message, serverId: 1778767351036 });
  }
});

// ========== 健康检查 ==========
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '3.0.0', mode: 'pure-api' });
});

// ========== 静态文件服务 ==========
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// ========== 启动服务器 ==========
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🎬 抖音直播间直播流获取工具 V3.0                          ║
║                                                               ║
║   服务已启动: http://localhost:${PORT}                             ║
║   模式: 纯API（无需安装浏览器）                                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
