import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

// Stealth plugin makes Puppeteer undetectable to LinkedIn's bot detection.
// Without it, LinkedIn sees the automated browser as a new device and invalidates the session.
puppeteer.use(StealthPlugin());

/**
 * Scrapes LinkedIn profile data using a stealth Puppeteer browser.
 * The stealth plugin prevents LinkedIn from detecting the automated browser,
 * which stops it from invalidating the user's session.
 */
export async function scrapeLinkedInProfile(profileUrl, linkedinCookie) {
  const DEBUG_MODE = process.env.DEBUG_MODE === 'true';

  if (!profileUrl || !profileUrl.includes('linkedin.com/in/')) {
    throw new Error('Invalid LinkedIn profile URL. URL should be like: https://www.linkedin.com/in/username');
  }

  if (!linkedinCookie) {
    throw new Error('LinkedIn session cookie (li_at) is required for scraping');
  }

  const cleanUrl = profileUrl.split('?')[0].replace(/\/$/, '');
  console.log(`[Scraper] DEBUG_MODE: ${DEBUG_MODE}`);
  console.log(`[Scraper] Target URL: ${cleanUrl}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: DEBUG_MODE ? false : 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Set the LinkedIn session cookie via the browser context
    const cdp = await page.createCDPSession();
    await cdp.send('Network.setCookie', {
      name: 'li_at',
      value: linkedinCookie,
      domain: '.linkedin.com',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'None',
    });

    // Navigate to the profile page
    console.log('[Scraper] Navigating to profile...');
    await page.goto(cleanUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for profile content to load (experience/about sections load via JS)
    console.log('[Scraper] Waiting for profile content to load...');
    await page.waitForSelector('main', { timeout: 10000 }).catch(() => {});
    // Give RSC streaming time to deliver about/experience/skills sections
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if we're on a login page
    const currentUrl = page.url();
    console.log(`[Scraper] Current URL: ${currentUrl}`);
    if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
      throw new Error('LinkedIn session expired or invalid. Please update your li_at cookie.');
    }

    if (DEBUG_MODE) {
      await page.screenshot({ path: 'debug-screenshot.png', fullPage: false });
      console.log('[Scraper] Screenshot saved to debug-screenshot.png');
    }

    // Extract page text content
    console.log('[Scraper] Extracting page content...');
    const pageContent = await page.evaluate(() => {
      return document.body.innerText;
    });

    console.log(`[Scraper] Extracted ${pageContent.length} characters of content`);

    if (DEBUG_MODE) {
      fs.writeFileSync('linkedin_page_text.txt', pageContent);
      console.log('[Scraper] Page text saved to linkedin_page_text.txt');
      console.log('\n========== PAGE CONTENT (first 2000 chars) ==========');
      console.log(pageContent.substring(0, 2000));
      console.log('======================================================\n');
    }

    // Use AI to extract structured profile data
    console.log('[Scraper] Using AI to extract profile data...');
    const profileData = await extractProfileWithAI(pageContent, cleanUrl);

    if (!profileData.name) {
      throw new Error('Could not extract profile data. The page may not have loaded correctly.');
    }

    console.log('\n========== SCRAPED PROFILE DATA ==========');
    console.log(JSON.stringify(profileData, null, 2));
    console.log('==========================================\n');

    return profileData;

  } catch (error) {
    console.error('[Scraper] Error:', error.message);

    if (DEBUG_MODE && browser) {
      console.log('[Scraper] DEBUG_MODE: Browser kept open for 30s for inspection...');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }

    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Use Gemini AI to extract structured profile data from page text
 */
async function extractProfileWithAI(pageContent, profileUrl) {
  console.log('[AI] Starting AI extraction...');

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY is required for AI extraction');
  }

  const modelName = process.env.GEMINI_MODEL_SCRAPING || 'gemini-2.0-flash';
  console.log(`[AI] Using model: ${modelName}`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const contentToSend = pageContent.substring(0, 15000);

  const prompt = `Extract LinkedIn profile information from the following page text. This is the full rendered text content of a LinkedIn profile page.

Return ONLY a valid JSON object with no markdown formatting, no code blocks, just the raw JSON.

PAGE TEXT:
${contentToSend}

Extract and return this exact JSON structure (use empty string "" if data not found):
{
  "name": "Full name of the person",
  "title": "Their most recent/current job title with company",
  "headline": "Profile headline (the text shown under their name on LinkedIn)",
  "company": "Current company name (from their most recent position)",
  "location": "Location (city, region/country as shown)",
  "about": "The full About/summary section text",
  "experience": "Summary of their top 2-3 work experiences, each with job title, company name, and dates",
  "skills": "Top skills listed on their profile (comma separated)",
  "education": "Education summary (school names, degrees, fields of study)"
}

Return ONLY the JSON object, no other text.`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();

    let jsonStr = responseText;
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```\n?$/g, '').trim();
    }

    const profileData = JSON.parse(jsonStr);
    profileData.profileUrl = profileUrl;
    return profileData;
  } catch (error) {
    console.error('[AI] Error:', error.message);
    throw new Error(`Failed to extract profile with AI: ${error.message}`);
  }
}

/**
 * Parse profile data from user-provided text
 */
export function parseManualProfileData(text) {
  const data = {
    name: '',
    title: '',
    headline: '',
    company: '',
    location: '',
    about: '',
    experience: '',
    skills: '',
    education: ''
  };

  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length > 0) data.name = lines[0].trim();
  if (lines.length > 1) data.headline = lines[1].trim();
  if (lines.length > 2) data.about = lines.slice(2).join('\n').trim();

  return data;
}
