// Copyright ©2019 Scott Mathieson <scttmthsn@gmail.com>

process.setMaxListeners(128);

import dotenv from 'dotenv';
import puppeteer from 'puppeteer';

import tor from './tor-proxy';

const { env, stderr, stdout } = process;

// See ./.env
dotenv.config();

const LOGIN_URL = `https://www.lectio.dk/lectio/${env.SCHOOL_NUMBER}/login.aspx`;

// DOM Selectors
const BUTTON_SELECTOR = '#m_Content_submitbtn2';
const PASSWORD_SELECTOR = '#password';
const USERNAME_SELECTOR = '#username';

// Puppeteer
const BROWSER_ARGS =
  env.TOR_ENABLED === 'true' ? ['--proxy-server=socks5://127.0.0.1:9050'] : [];

const BROWSER_WAIT = env.NODE_ENV === 'development' ? 3e3 : 0;
const IS_HEADLESS = env.NODE_ENV === 'production' ? true : false;
const NET_IDLE = { waitUntil: 'networkidle0' };
const TIMEOUT = 12e4; // 120 seconds

const browserLogin = async () => {
  const proxy = await tor.create();
  let browser, cookies, page;

  try {
    return retry(async () => {
      browser = await puppeteer.launch({
        args: [
          ...BROWSER_ARGS,
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-setuid-sandbox',
          '--no-first-run',
          '--no-sandbox',
          '--no-zygote',
        ],
        headless: IS_HEADLESS,
        // If on Raspberry Pi, uncomment line below after 
        // installing chromium via apt (or similar)
        // See https://github.com/puppeteer/puppeteer/issues/7917
        // and https://github.com/soeren-b-c/lectio-skema-til-.ics-kalender/issues/24
        //executablePath: '/usr/bin/chromium-browser',
      });

      page = await browser.newPage();
      page.setDefaultNavigationTimeout(TIMEOUT);

      stdout.write(new Date().toUTCString() + `: Logging in...\n`);
      await page.goto(`${BASE_URL}/${user.school}/login.aspx`, NET_IDLE);
      await page.type(`${USERNAME_SELECTOR}`, user.name);
      await page.type(`${PASSWORD_SELECTOR}`, user.pass);

      await Promise.all([
        page.click(`${BUTTON_SELECTOR}`),
        page.waitForNavigation(NET_IDLE),
      ]);

      cookies = await page.cookies();

      return { browser, cookies };
    }, { onError: (error) => stderr.write(new Date().toUTCString() + ` browserLogin(): ${error}`) });
  } catch (error) {
    stderr.write(`browserLogin(): ${error}\n`);
  }
};

var globalBrowser;

export const fetch = async (url) => {
  try {
    var { browser, cookies, proxy } = await browserLogin();

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(TIMEOUT);

    stdout.write(`Fetching ${url}\n`);
    await page.setCookie(...cookies);
    await page.goto(url, NET_IDLE);

    const response = await page.content();

    stdout.write(`Stopping browser…\n`);
    await page.waitFor(BROWSER_WAIT);
    //await browser.close();
    globalBrowser = browser;

    if (proxy) {
      stdout.write(`Stopping proxy…\n`);
      proxy.kill();
    }

    stdout.write(`Task complete.\n`);
    return response;
  } catch (error) {
    stderr.write(`fetch(): ${error}`);
  }
};

export const closeBrowser = async () => {
  try {
    stdout.write(`Stopping browser… for real\n`);
    await page.waitFor(BROWSER_WAIT);
    await browser.close();
    return 1;
  } catch (error) {
    stderr.write(`fetch(): ${error}`);
  }
};
