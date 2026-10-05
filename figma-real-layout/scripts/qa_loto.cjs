const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const JSZip = require('jszip');

const baseUrl = process.env.LOTO_QA_URL || 'http://127.0.0.1:5173';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const qaCount = Math.min(30, Math.max(2, Number(process.env.LOTO_QA_COUNT) || 30));
const qaCategory = process.env.LOTO_QA_CATEGORY || 'Девичник';
const qaCategorySlug = qaCategory.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '');

async function run() {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  const failedRequests = [];
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.failure()?.errorText}: ${request.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.addInitScript(({ count, category }) => {
    localStorage.setItem('bitva_auth_default_version', 'home-auth-email-v3');
    localStorage.setItem('bitva_logged_in', '1');
    localStorage.setItem('bitva_name', 'Проверка');
    localStorage.setItem('bitva_music_category', category);
    localStorage.setItem('bitva_music_show_category_cover', '0');
    localStorage.setItem('bitva_music_song_index', '0');
    localStorage.setItem('bitva_music_played_indexes', '[]');
    localStorage.setItem('bitva_purchased_blanks', JSON.stringify([{
      id: `qa-${count}`,
      category,
      count,
      date: '04.08.2026',
    }]));
  }, { count: qaCount, category: qaCategory });
  await page.goto(`${baseUrl}/#/forms`);
  await page.getByRole('button', { name: 'Скачать' }).waitFor();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Скачать' }).click(),
  ]);
  const archivePath = path.join(os.tmpdir(), `qa-loto-${qaCount}.zip`);
  await download.saveAs(archivePath);
  const archive = await JSZip.loadAsync(fs.readFileSync(archivePath));
  const pdfNames = Object.keys(archive.files).filter((name) => name.endsWith('.pdf'));
  if (pdfNames.length !== qaCount) throw new Error(`ZIP contains ${pdfNames.length} PDFs instead of ${qaCount}`);
  if (download.suggestedFilename() !== `музыкальное-лото-${qaCategorySlug}-${qaCount}-бланков.zip`) {
    throw new Error(`Unexpected filename: ${download.suggestedFilename()}`);
  }

  await page.goto(`${baseUrl}/#/music-game`);
  await page.locator('.music-current-art').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const image = document.querySelector('.music-current-art');
    const audio = document.querySelector('.music-audio');
    return image?.naturalWidth > 0 && audio?.readyState >= 1;
  }, null, { timeout: 30000 });
  const squareState = await page.evaluate(() => {
    const image = document.querySelector('.music-current-art');
    const audio = document.querySelector('.music-audio');
    return {
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      audioDuration: audio.duration,
      audioPaused: audio.paused,
      title: image.alt,
    };
  });
  if (squareState.imageWidth !== 960 || squareState.imageHeight !== 960) {
    throw new Error(`Unexpected square artwork: ${squareState.imageWidth}x${squareState.imageHeight}`);
  }
  if (!(squareState.audioDuration > 30 && squareState.audioDuration < 180)) {
    throw new Error(`Unexpected audio duration: ${squareState.audioDuration}`);
  }

  await page.locator('.music-share').click();
  await page.waitForFunction(() => {
    const image = document.querySelector('.music-current-card.is-fullscreen .music-current-art');
    return image?.naturalWidth === 1920 && image?.naturalHeight === 1080;
  }, null, { timeout: 30000 });
  const albumState = await page.evaluate(() => {
    const image = document.querySelector('.music-current-art');
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  const actionableRequestFailures = failedRequests.filter((failure) => !failure.startsWith('net::ERR_ABORTED:'));
  if (actionableRequestFailures.length || consoleErrors.length) {
    throw new Error(JSON.stringify({ failedRequests: actionableRequestFailures, consoleErrors }));
  }

  fs.rmSync(archivePath, { force: true });
  await browser.close();
  console.log(JSON.stringify({
    category: qaCategory,
    zipPdfCount: pdfNames.length,
    filename: download.suggestedFilename(),
    squareState,
    albumState,
    failedRequests: actionableRequestFailures,
    consoleErrors,
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
