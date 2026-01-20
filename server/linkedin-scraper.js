import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Scrapes LinkedIn profile data using Puppeteer with authenticated session cookies
 * Uses AI to extract structured data from the page content
 */
export async function scrapeLinkedInProfile(profileUrl, linkedinCookie) {
  // Read DEBUG_MODE at runtime (after dotenv has loaded)
  const DEBUG_MODE = process.env.DEBUG_MODE === 'true';
  
  // Validate LinkedIn URL
  if (!profileUrl || !profileUrl.includes('linkedin.com/in/')) {
    throw new Error('Invalid LinkedIn profile URL. URL should be like: https://www.linkedin.com/in/username');
  }

  if (!linkedinCookie) {
    throw new Error('LinkedIn session cookie (li_at) is required for scraping');
  }

  // Clean the URL
  const cleanUrl = profileUrl.split('?')[0].replace(/\/$/, '');

  console.log(`[Scraper] DEBUG_MODE: ${DEBUG_MODE}`);
  console.log(`[Scraper] Target URL: ${cleanUrl}`);

  let browser;
  try {
    // Launch Puppeteer - show browser window when DEBUG_MODE is true
    browser = await puppeteer.launch({
      headless: !DEBUG_MODE,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
      slowMo: DEBUG_MODE ? 50 : 0,
    });

    const page = await browser.newPage();

    // Set viewport to desktop size
    await page.setViewport({ width: 1920, height: 1080 });

    // Set a realistic user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set the LinkedIn session cookie
    await page.setCookie({
      name: 'li_at',
      value: linkedinCookie,
      domain: '.linkedin.com',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'None',
    });

    // Navigate to the profile page
    console.log(`[Scraper] Navigating to profile...`);
    console.log('[Scraper] Starting navigation...');
    await page.goto(cleanUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    console.log('[Scraper] Page navigated (domcontentloaded)');

    // Simple wait for page to render
    console.log('[Scraper] Waiting 3 seconds for page to render...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('[Scraper] Wait complete');

    // Check if we're on a login page (cookie invalid or expired)
    const currentUrl = page.url();
    console.log(`[Scraper] Current URL: ${currentUrl}`);
    
    if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
      throw new Error('LinkedIn session expired or invalid. Please update your li_at cookie.');
    }

    // Debug: Take screenshot
    if (DEBUG_MODE) {
      await page.screenshot({ path: 'debug-screenshot.png', fullPage: false });
      console.log('[Scraper] Screenshot saved to debug-screenshot.png');
    }

    // Extract the entire page text content
    console.log(`[Scraper] Extracting page content...`);
    
    const pageContent = await page.evaluate(() => {
      return document.body.innerText;
    });

    console.log(`[Scraper] Extracted ${pageContent.length} characters of content`);
    
    if (DEBUG_MODE) {
      console.log('\n========== PAGE CONTENT (first 2000 chars) ==========');
      console.log(pageContent.substring(0, 2000));
      console.log('======================================================\n');
    }

    // Use AI to extract structured profile data
    console.log(`[Scraper] Using AI to extract profile data...`);
    
    const profileData = await extractProfileWithAI(pageContent, cleanUrl);
    
    // Validate we got at least a name
    if (!profileData.name) {
      console.log('[Scraper] Could not extract name from page');
      throw new Error('Could not extract profile data. The page may not have loaded correctly.');
    }

    // Log the full profile data for debugging
    console.log('\n========== SCRAPED PROFILE DATA ==========');
    console.log(JSON.stringify(profileData, null, 2));
    console.log('==========================================\n');

    return profileData;

  } catch (error) {
    console.error('[Scraper] Error:', error.message);
    
    // In debug mode, keep browser open for inspection
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
 * Use Gemini AI to extract structured profile data from page content
 */
async function extractProfileWithAI(pageContent, profileUrl) {
  console.log('[AI] Starting AI extraction...');
  
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  console.log(`[AI] API Key present: ${!!apiKey}`);
  console.log(`[AI] API Key (first 10 chars): ${apiKey ? apiKey.substring(0, 10) + '...' : 'N/A'}`);
  
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY is required for AI extraction');
  }
  
  const modelName = process.env.GEMINI_MODEL_SCRAPING || 'gemini-2.0-flash';
  console.log(`[AI] Using model: ${modelName}`);
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const contentToSend = pageContent.substring(0, 8000);
  console.log(`[AI] Content length to send: ${contentToSend.length} chars`);

  const prompt = `Extract LinkedIn profile information from the following page content. Return ONLY a valid JSON object with no markdown formatting, no code blocks, just the raw JSON.

PAGE CONTENT:
${contentToSend}

Extract and return this exact JSON structure (use empty string "" if data not found):
{
  "name": "Full name of the person",
  "title": "Current job title",
  "headline": "Profile headline (the text under their name)",
  "company": "Current company name",
  "location": "Location (city, country)",
  "about": "About/summary section content",
  "experience": "Brief summary of top 2-3 work experiences",
  "skills": "Top skills (comma separated)",
  "education": "Education summary"
}

Return ONLY the JSON object, no other text.`;

  console.log(`[AI] Prompt length: ${prompt.length} chars`);
  console.log('[AI] Sending request to Gemini...');

  try {
    const result = await model.generateContent(prompt);
    console.log('[AI] Got response from Gemini');
    
    const responseText = result.response.text().trim();
    console.log(`[AI] Response length: ${responseText.length} chars`);
    console.log('[AI] Raw response:');
    console.log('---START---');
    console.log(responseText);
    console.log('---END---');
    
    // Clean up the response - remove markdown code blocks if present
    let jsonStr = responseText;
    if (jsonStr.startsWith('```')) {
      console.log('[AI] Removing markdown code blocks...');
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```\n?$/g, '').trim();
      console.log('[AI] Cleaned JSON:');
      console.log(jsonStr);
    }
    
    console.log('[AI] Parsing JSON...');
    const profileData = JSON.parse(jsonStr);
    console.log('[AI] JSON parsed successfully');
    
    profileData.profileUrl = profileUrl;
    
    return profileData;
  } catch (error) {
    console.error('[AI] Error type:', error.constructor.name);
    console.error('[AI] Error message:', error.message);
    console.error('[AI] Full error:', error);
    throw new Error(`Failed to extract profile with AI: ${error.message}`);
  }
}

/**
 * Parse profile data from user-provided text
 * Useful as a fallback when scraping doesn't work
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
