const { app, BrowserWindow, powerSaveBlocker } = require('electron'); // eslint-disable-line import/no-extraneous-dependencies
const isDev = require('electron-is-dev');
const path = require('path');
const pie = require('puppeteer-in-electron');
const puppeteer = require('puppeteer-core');
const { join } = require('path');
const assert = require('assert');
const fs = require('fs-extra');
const filenamify = require('filenamify');
const yargsParser = require('yargs-parser');

const Instauto = require('instauto');
const moment = require('moment');
const electronRemote = require('@electron/remote/main');

let mainWindow;
let instautoDb;
let instauto;
let instautoWindow;
let logger = console;
let powerSaveBlockerId;

// Must be called before electron is ready
const pieConnectPromise = (async () => {
  await pie.initialize(app);
  return pie.connect(app, puppeteer);
})();

pieConnectPromise.catch(console.error);

electronRemote.initialize();

function parseCliArgs() {
  const ignoreFirstArgs = isDev ? 2 : 1;
  const argsWithoutAppName = process.argv.length > ignoreFirstArgs ? process.argv.slice(ignoreFirstArgs) : [];
  return yargsParser(argsWithoutAppName);
}

const args = parseCliArgs();
console.log('CLI arguments', args);
const { root: customRootPath } = args;

if (customRootPath) {
  console.log('Using custom root', customRootPath);
  app.setPath('userData', join(customRootPath, 'electron'));
}

function getFilePath(rel) {
  return join(customRootPath || app.getPath('userData'), rel);
}

const cookiesPath = getFilePath('cookies.json');

async function checkHaveCookies() {
  return fs.pathExists(cookiesPath);
}

async function deleteCookies() {
  try {
    await fs.unlink(cookiesPath);
  } catch (err) {
    logger.log('No cookies to delete', err.message);
  }
}

async function initInstautoDb(usernameIn) {
  const username = usernameIn && filenamify(usernameIn);
  const followedDbPath    = getFilePath(username ? `${username}-followed.json`    : 'followed.json');
  const unfollowedDbPath  = getFilePath(username ? `${username}-unfollowed.json`  : 'unfollowed.json');
  const likedPhotosDbPath = getFilePath(username ? `${username}-liked-photos.json`: 'liked-photos.json');

  if (username) {
    await fs.move(getFilePath('followed.json'),      followedDbPath).catch(() => {});
    await fs.move(getFilePath('unfollowed.json'),    unfollowedDbPath).catch(() => {});
    await fs.move(getFilePath('liked-photos.json'),  likedPhotosDbPath).catch(() => {});
  }

  instautoDb = await Instauto.JSONDB({
    followedDbPath,
    unfollowedDbPath,
    likedPhotosDbPath,
  });
}

function getInstautoData() {
  const dayMs = 24 * 60 * 60 * 1000;
  if (!instautoDb) return undefined;
  return {
    numTotalFollowedUsers:   instautoDb.getTotalFollowedUsers(),
    numTotalUnfollowedUsers: instautoDb.getTotalUnfollowedUsers(),
    numFollowedLastDay:      instautoDb.getFollowedLastTimeUnit(dayMs).length,
    numUnfollowedLastDay:    instautoDb.getUnfollowedLastTimeUnit(dayMs).length,
    numTotalLikedPhotos:     instautoDb.getTotalLikedPhotos(),
    numLikedLastDay:         instautoDb.getLikedPhotosLastTimeUnit(dayMs).length,
  };
}

// ── Instagram login page fix ───────────────────────────────────────────────────
// Instagram changed their login page. This helper is invoked after Instauto
// Espera a que aparezca el primer selector que exista, con timeout
async function waitForAnySelector(page, selectors, timeout = 15000) {
  const found = await Promise.race(
    selectors.map(sel =>
      page.waitForSelector(sel, { timeout, visible: true })
        .then(() => sel)
        .catch(() => null)
    )
  );
  return found; // devuelve el selector que apareció primero, o null
}

// Maneja el flujo de login de Instagram:
//   • Espera a que React renderice el formulario (usa waitForSelector)
//   • Descarta banners de cookies (EU y global)
//   • Rellena usuario y contraseña
//   • Descarta popups post-login
async function handleInstagramLoginPage(page, username, password) {
  const currentUrl = page.url();
  if (!currentUrl.includes('instagram.com') || currentUrl.includes('challenge')) return;

  try {
    console.log('[Login] Iniciando flujo de login en', currentUrl);

    // 1. Navegar directamente a la página de login si no estamos ya ahí
    if (!currentUrl.includes('/accounts/login')) {
      console.log('[Login] Navegando a /accounts/login/');
      await page.goto('https://www.instagram.com/accounts/login/', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      }).catch(() => {}); // si falla la espera de networkidle2, continuar
    }

    // 2. Esperar a que el DOM de React monte los inputs (hasta 20 segundos)
    const USERNAME_SELECTORS = [
      'input[name="username"]',
      'input[aria-label="Phone number, username, or email"]',
      'input[aria-label="Nombre de usuario, teléfono o correo electrónico"]',
      'input[autocomplete="username"]',
      'input[type="text"]',
    ];

    console.log('[Login] Esperando que aparezca el campo usuario…');
    const foundUserSel = await waitForAnySelector(page, USERNAME_SELECTORS, 20000);

    if (!foundUserSel) {
      console.warn('[Login] No se encontró el campo de usuario. Puede haber un captcha o bloqueo.');
      return;
    }
    console.log('[Login] Campo usuario encontrado con selector:', foundUserSel);

    // 3. Descartar banner de cookies si aparece
    await page.evaluate(() => {
      const keywords = ['Allow all', 'Accept all', 'Aceptar todo', 'Allow essential', 'Decline optional'];
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => keywords.some(k => b.textContent.trim().startsWith(k)));
      if (btn) btn.click();

      const testIdBtn = document.querySelector('[data-testid="cookie-policy-manage-dialog-accept-button"]');
      if (testIdBtn) testIdBtn.click();
    }).catch(() => {});

    await new Promise(r => setTimeout(r, 600));

    // 4. Rellenar usuario
    const usernameField = await page.$(foundUserSel);
    if (usernameField) {
      await usernameField.click({ clickCount: 3 });
      await usernameField.type(username, { delay: 60 + Math.random() * 60 });
      console.log('[Login] Usuario escrito');
    }

    // 5. Rellenar contraseña
    const PASSWORD_SELECTORS = [
      'input[name="password"]',
      'input[aria-label="Password"]',
      'input[aria-label="Contraseña"]',
      'input[autocomplete="current-password"]',
      'input[type="password"]',
    ];

    const foundPassSel = await waitForAnySelector(page, PASSWORD_SELECTORS, 8000);
    if (foundPassSel) {
      const passwordField = await page.$(foundPassSel);
      if (passwordField) {
        await passwordField.click({ clickCount: 3 });
        await passwordField.type(password, { delay: 60 + Math.random() * 60 });
        console.log('[Login] Contraseña escrita');
      }
    } else {
      console.warn('[Login] No se encontró el campo de contraseña');
    }

    // 6. Enviar
    await page.keyboard.press('Enter');
    console.log('[Login] Formulario enviado, esperando respuesta…');
    await new Promise(r => setTimeout(r, 4000));

    // 7. Descartar "Save your login info?" y "Turn on Notifications?"
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button'))
          .find(b => /not now|ahora no/i.test(b.textContent));
        if (btn) btn.click();
      }).catch(() => {});
      await new Promise(r => setTimeout(r, 1200));
    }

    console.log('[Login] Flujo de login completado');
  } catch (err) {
    console.warn('[Login] Error no-fatal:', err.message);
  }
}

async function initInstauto({
  userAgent,
  username,
  password,
  dontUnfollowUntilDaysElapsed,
  maxFollowsPerHour,
  maxFollowsPerDay,
  maxLikesPerDay,
  followUserRatioMin,
  followUserRatioMax,
  followUserMaxFollowers,
  followUserMaxFollowing,
  followUserMinFollowers,
  followUserMinFollowing,
  excludeUsers,
  dryRun,
  logger: loggerArg,
}) {
  instautoWindow = new BrowserWindow({
    x: 0,
    y: 0,
    webPreferences: {
      partition: 'instauto',
      backgroundThrottling: false,
    },
  });

  const { session } = instautoWindow.webContents;
  await session.clearStorageData();

  const pieBrowser = await pieConnectPromise;

  const browser = {
    newPage: async () => {
      const page = await pie.getPage(pieBrowser, instautoWindow);

      // ── Patch page.goto: interceptar navegación a Instagram ──────────────
      const originalGoto = page.goto.bind(page);
      page.goto = async (url, gotoOptions) => {
        const result = await originalGoto(url, { waitUntil: 'domcontentloaded', timeout: 60000, ...gotoOptions });

        const landedUrl = page.url();
        const isInstagram = landedUrl.includes('instagram.com');
        const isLoginPage = landedUrl.includes('/accounts/login') ||
          landedUrl === 'https://www.instagram.com/' ||
          landedUrl === 'https://www.instagram.com';

        if (isInstagram && isLoginPage && username && password) {
          loggerArg && loggerArg.log('[Login] Página Instagram detectada, ejecutando login…');
          await handleInstagramLoginPage(page, username, password);
        }

        return result;
      };

      // ── Patch page.click: instauto llama page.click() sin esperar a React ──
      // Añadir waitForSelector automático antes de cada click.
      const originalClick = page.click.bind(page);
      page.click = async (selector, clickOptions) => {
        try {
          await page.waitForSelector(selector, { timeout: 12000, visible: true });
        } catch (_) {
          // Si no aparece en 12s, dejamos que el click original falle con su error original
        }
        return originalClick(selector, clickOptions);
      };

      // ── Patch page.type: igual que click, esperar el elemento ────────────
      const originalType = page.type.bind(page);
      page.type = async (selector, text, typeOptions) => {
        try {
          await page.waitForSelector(selector, { timeout: 12000, visible: true });
        } catch (_) {}
        return originalType(selector, text, typeOptions);
      };

      return page;
    },
  };

  const options = {
    userAgent,
    cookiesPath,
    username,
    password,
    maxFollowsPerHour,
    maxFollowsPerDay,
    maxLikesPerDay,
    followUserRatioMin,
    followUserRatioMax,
    followUserMaxFollowers,
    followUserMaxFollowing,
    followUserMinFollowers,
    followUserMinFollowing,
    dontUnfollowUntilTimeElapsed: dontUnfollowUntilDaysElapsed * 24 * 60 * 60 * 1000,
    excludeUsers,
    dryRun,
    logger: loggerArg,
  };

  mainWindow.focus();

  instauto = await Instauto(instautoDb, browser, options);
  logger = loggerArg;

  powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
}

function cleanupInstauto() {
  if (powerSaveBlockerId != null) powerSaveBlocker.stop(powerSaveBlockerId);

  if (instautoWindow) {
    instautoWindow.destroy();
    instautoWindow = undefined;
  }

  instautoDb = undefined;
  instauto = undefined;
  logger = console;
}

async function runBotNormalMode({
  usernames, ageInDays, skipPrivate, runAtHour, maxLikesPerUser, maxFollowsTotal, instantStart, enableFollowUnfollow,
}) {
  assert(instauto);

  function getMsUntilNextRun() {
    const now = moment();
    const isAfterHour = now.hour() >= runAtHour;
    const nextRunTime = now.clone().startOf('day').add(runAtHour, 'hours');
    if (isAfterHour) nextRunTime.add(1, 'day');
    return (1 + ((Math.random() - 0.5) * 0.1)) * nextRunTime.diff(now);
  }

  async function sleepUntilNextDay() {
    const msUntilNextRun = getMsUntilNextRun();
    logger.log(`Sleeping ${(msUntilNextRun / (60 * 60 * 1000)).toFixed(1)} hours until ${runAtHour}:00…`);
    await new Promise(resolve => setTimeout(resolve, msUntilNextRun));
    logger.log('Done sleeping, running…');
  }

  if (!instantStart) await sleepUntilNextDay();

  for (;;) {
    try {
      const unfollowLimit = Math.floor(maxFollowsTotal * (2 / 3));
      let unfollowedCount = 0;

      if (enableFollowUnfollow) {
        unfollowedCount = await instauto.unfollowOldFollowed({ ageInDays, limit: unfollowLimit });
        if (unfollowedCount > 0) await instauto.sleep(10 * 60 * 1000);
      }

      const likingEnabled = maxLikesPerUser != null && maxLikesPerUser >= 1;

      await instauto.followUsersFollowers({
        usersToFollowFollowersOf: usernames,
        maxFollowsTotal: Math.max(0, maxFollowsTotal - unfollowedCount),
        skipPrivate,
        enableLikeImages: likingEnabled,
        enableFollow: enableFollowUnfollow,
        likeImagesMax: likingEnabled ? maxLikesPerUser : undefined,
      });

      logger.log('Daily run complete.');
      await instauto.sleep(30000);
    } catch (err) {
      logger.error('Error during run:', err.message || err);
    }

    await sleepUntilNextDay();
  }
}

async function runBotUnfollowAllUnknown({ limit } = {}) {
  await instauto.unfollowAllUnknown({ limit });
}

async function runBotUnfollowNonMutualFollowers({ limit } = {}) {
  await instauto.unfollowNonMutualFollowers({ limit });
}

async function runBotUnfollowOldFollowed({ ageInDays, limit } = {}) {
  await instauto.unfollowOldFollowed({ ageInDays, limit });
}

async function runBotUnfollowUserList({ usersToUnfollow, limit } = {}) {
  await instauto.safelyUnfollowUserList(usersToUnfollow, limit);
}

async function runBotFollowUserList({ users, limit, skipPrivate } = {}) {
  await instauto.safelyFollowUserList({ users, limit, skipPrivate });
}

async function runTestCode() {
  // console.log(await instauto.doesUserFollowMe('someuser'));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 660,
    minWidth: 750,
    minHeight: 550,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: !isDev,
      backgroundThrottling: false,
    },
    title: `InstaBot ${app.getVersion()}`,
    backgroundColor: '#0d0f14',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  electronRemote.enable(mainWindow.webContents);

  const url = new URL(isDev ? 'http://localhost:3001' : `file://${path.join(__dirname, '../build/index.html')}`);
  url.searchParams.append('data', JSON.stringify({ isDev }));
  mainWindow.loadURL(url.toString());

  if (isDev) {
    const { default: installExtension, REACT_DEVELOPER_TOOLS } = require('electron-devtools-installer'); // eslint-disable-line
    installExtension(REACT_DEVELOPER_TOOLS)
      .then(name => console.log(`Added Extension: ${name}`))
      .catch(err => console.log('Extension error:', err));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.on('ready', createWindow);
app.on('window-all-closed', () => { app.quit(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });

module.exports = {
  initInstauto,
  initInstautoDb,
  getInstautoData,
  runBotNormalMode,
  runBotUnfollowAllUnknown,
  runBotUnfollowNonMutualFollowers,
  runBotUnfollowOldFollowed,
  runBotUnfollowUserList,
  runBotFollowUserList,
  runTestCode,
  cleanupInstauto,
  checkHaveCookies,
  deleteCookies,
};