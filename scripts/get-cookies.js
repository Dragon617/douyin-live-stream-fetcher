#!/usr/bin/env node
/**
 * 抖音Cookie自动获取脚本
 * 运行后会打开浏览器，手动登录后自动保存Cookie
 * 
 * 使用：node scripts/get-cookies.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const COOKIE_FILE = path.join(__dirname, '..', 'cookies.json');
const DOUYIN_URL = 'https://www.douyin.com';

(async () => {
  console.log('🚀 启动浏览器...');
  
  const browser = await puppeteer.launch({
    headless: false,  // 可见浏览器，方便用户登录
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  console.log('📱 打开抖音官网...');
  await page.goto(DOUYIN_URL, { waitUntil: 'networkidle2' });

  console.log('⏳ 等待登录...');
  console.log('   请在浏览器中完成登录（扫码或账号密码）');
  console.log('   登录成功后会自动检测并保存Cookie');
  console.log('   按 Ctrl+C 可取消\n');

  // 检测登录状态
  let loggedIn = false;
  let checkCount = 0;
  const maxChecks = 120;  // 最多等待10分钟

  while (!loggedIn && checkCount < maxChecks) {
    try {
      // 方法1：检查页面是否有用户昵称
      const hasNickname = await page.evaluate(() => {
        return !!(
          document.body.innerText.includes('nickname') ||
          document.querySelector('.avatar') ||
          document.cookie.includes('sessionid')
        );
      });

      // 方法2：检查Cookie中是否有sessionid
      const cookies = await page.cookies(DOUYIN_URL);
      const hasSession = cookies.some(c => c.name === 'sessionid' || c.name === '__ac_signature');

      if (hasNickname || hasSession) {
        loggedIn = true;
        console.log('✅ 检测到登录成功！');
        break;
      }

      // 方法3：检查URL变化（登录成功通常会跳转）
      const currentUrl = page.url();
      if (currentUrl.includes('douyin.com') && !currentUrl.includes('passport')) {
        const newCookies = await page.cookies(DOUYIN_URL);
        if (newCookies.length > 5) {  // 登录后Cookie数量通常会增加
          loggedIn = true;
          console.log('✅ 检测到登录成功（Cookie数量增加）！');
          break;
        }
      }

      checkCount++;
      await new Promise(resolve => setTimeout(resolve, 5000));  // 每5秒检查一次
      
      if (checkCount % 12 === 0) {  // 每60秒打印一次提示
        console.log(`   等待中... (${checkCount * 5}秒)`);
      }
    } catch (e) {
      console.log('检查登录状态时出错:', e.message);
    }
  }

  if (!loggedIn) {
    console.log('⏰ 等待超时，请手动确认是否已登录');
    console.log('   如果已登录，按回车键强制保存Cookie...');
    await new Promise(resolve => {
      process.stdin.once('data', () => resolve());
    });
  }

  // 获取并保存Cookie
  console.log('💾 正在获取Cookie...');
  const cookies = await page.cookies(DOUYIN_URL);
  
  if (cookies.length === 0) {
    console.log('❌ 未获取到任何Cookie，请确认是否已登录');
    await browser.close();
    process.exit(1);
  }

  const cookieData = {
    cookies: cookies,
    loginTime: new Date().toISOString(),
    valid: true
  };

  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookieData, null, 2));
  
  console.log(`✅ Cookie已保存！共 ${cookies.length} 个`);
  console.log(`   保存位置: ${COOKIE_FILE}`);
  console.log('\n🎉 现在可以启动主服务了：npm start\n');

  // 等待3秒让用户看清楚信息
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  await browser.close();
  process.exit(0);
})().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
