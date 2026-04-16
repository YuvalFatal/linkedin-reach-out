import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

/**
 * Scrapes LinkedIn profile data using a combination of:
 * 1. Profile HTML page (single GET) — gets name, headline, location, education (top card)
 * 2. Voyager API call — gets about, experience, skills, full education
 *
 * The HTML fetch is safe (normal page load). The API call uses the same cookie
 * but with minimal headers to avoid triggering LinkedIn's session invalidation.
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
  const username = cleanUrl.split('/in/')[1];

  if (!username) {
    throw new Error('Could not extract username from LinkedIn URL');
  }

  console.log(`[Scraper] DEBUG_MODE: ${DEBUG_MODE}`);
  console.log(`[Scraper] Target URL: ${cleanUrl}`);
  console.log(`[Scraper] Username: ${username}`);

  try {
    // Step 1: Fetch the profile HTML page — gives us the top card + a JSESSIONID cookie
    console.log('[Scraper] Fetching profile page...');
    const pageResponse = await fetch(cleanUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': `li_at=${linkedinCookie}`,
      },
    });

    if (!pageResponse.ok) {
      console.error(`[Scraper] Response status: ${pageResponse.status}`);
      if (pageResponse.status === 401 || pageResponse.status === 403) {
        throw new Error('LinkedIn session expired or invalid. Please update your li_at cookie.');
      }
      if (pageResponse.status === 404) {
        throw new Error('LinkedIn profile not found. Please check the URL.');
      }
      throw new Error(`LinkedIn returned status ${pageResponse.status}`);
    }

    const html = await pageResponse.text();
    console.log(`[Scraper] Got ${html.length} chars of HTML`);

    // Check if we landed on login
    if (html.includes('/login') && html.includes('session_redirect') && !html.includes('profile-nav-item')) {
      throw new Error('LinkedIn session expired or invalid. Please update your li_at cookie.');
    }

    if (DEBUG_MODE) {
      fs.writeFileSync('linkedin_profile_response.html', html);
      console.log('[Scraper] HTML saved to linkedin_profile_response.html');
    }

    // Extract JSESSIONID from response cookies (LinkedIn sets it on page load)
    let csrfToken = '';
    const setCookies = pageResponse.headers.getSetCookie?.() || [];
    for (const cookie of setCookies) {
      const match = cookie.match(/JSESSIONID="?([^";]+)"?/);
      if (match) {
        csrfToken = match[1].replace(/"/g, '');
        break;
      }
    }
    if (!csrfToken) {
      const cookieHeader = pageResponse.headers.get('set-cookie') || '';
      const match = cookieHeader.match(/JSESSIONID="?([^";]+)"?/);
      if (match) csrfToken = match[1].replace(/"/g, '');
    }
    if (!csrfToken) {
      csrfToken = `ajax:${Date.now()}`;
    }
    console.log(`[Scraper] CSRF token: ${csrfToken.substring(0, 15)}...`);

    // Extract top card data from page text
    const topCardText = extractTopCardText(html);
    if (DEBUG_MODE) {
      console.log('[Scraper] Top card text:', topCardText);
    }

    // Step 2: Fetch detailed profile via Voyager API
    console.log('[Scraper] Fetching detailed profile via API...');
    let apiText = '';
    try {
      apiText = await fetchProfileAPI(username, linkedinCookie, csrfToken, DEBUG_MODE);
    } catch (apiError) {
      console.log(`[Scraper] API fetch failed: ${apiError.message}, using page data only`);
    }

    // Combine top card + API data
    const combinedData = [topCardText, apiText].filter(Boolean).join('\n\n---\n\n');

    if (DEBUG_MODE) {
      console.log(`\n========== COMBINED DATA (${combinedData.length} chars) ==========`);
      console.log(combinedData.substring(0, 3000));
      console.log('==========================================================\n');
    }

    // Step 3: AI extraction
    console.log('[Scraper] Extracting profile data with AI...');
    const profileData = await extractProfileWithAI(combinedData.substring(0, 15000), cleanUrl);

    if (!profileData.name) {
      throw new Error('Could not extract profile data. The page may not have loaded correctly.');
    }

    console.log('\n========== SCRAPED PROFILE DATA ==========');
    console.log(JSON.stringify(profileData, null, 2));
    console.log('==========================================\n');

    return profileData;

  } catch (error) {
    console.error('[Scraper] Error:', error.message);
    throw error;
  }
}

/**
 * Extract readable text from the profile page HTML (top card only —
 * LinkedIn doesn't SSR the about/experience/skills sections).
 */
function extractTopCardText(html) {
  // Extract from RSC rehydration data
  const comoIdx = html.indexOf('__como_rehydration__');
  if (comoIdx === -1) {
    // Fallback: strip HTML tags
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  try {
    const scriptStart = html.lastIndexOf('<script', comoIdx);
    const scriptEnd = html.indexOf('</script>', comoIdx);
    const como = html.substring(scriptStart, scriptEnd);
    const assignIdx = como.indexOf('= [');
    const arrayContent = como.substring(assignIdx + 2, como.lastIndexOf(']') + 1);
    const parsed = JSON.parse(arrayContent);

    // Extract all text from children arrays across all RSC chunks
    const texts = [];
    for (const elem of parsed) {
      const matches = elem.matchAll(/"children":\["([^"]+)"\]/g);
      for (const m of matches) {
        const t = m[1];
        if (t.length > 2 && !t.startsWith('$') && !t.includes('className') && !t.includes('proto.sdui')) {
          texts.push(t);
        }
      }
    }

    return 'TOP CARD DATA:\n' + [...new Set(texts)].join('\n');
  } catch {
    return '';
  }
}

/**
 * Fetch detailed profile data via LinkedIn's Voyager API.
 * Tries multiple endpoints in order of preference.
 */
async function fetchProfileAPI(username, linkedinCookie, csrfToken, debug) {
  const cookieStr = `li_at=${linkedinCookie}; JSESSIONID="${csrfToken}"`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/vnd.linkedin.normalized+json+2.1',
    'Cookie': cookieStr,
    'csrf-token': csrfToken,
    'x-li-lang': 'en_US',
    'x-restli-protocol-version': '2.0.0',
  };

  // Try multiple API endpoints — LinkedIn deprecates them over time
  const endpoints = [
    // Dash profiles with various decoration versions (newest first)
    ...([93, 92, 91, 90, 88, 85, 80, 75, 70].map(v =>
      `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${username}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-${v}`
    )),
    // Plain dash profile
    `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${username}`,
    // WebTopCard
    ...([19, 18, 17, 15].map(v =>
      `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${username}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.WebTopCardCore-${v}`
    )),
  ];

  for (const url of endpoints) {
    try {
      console.log(`[API] Trying: ...${url.split('?')[1]?.substring(0, 80) || url.substring(url.length - 60)}`);
      const response = await fetch(url, { headers });

      if (response.ok) {
        const data = await response.json();

        if (debug) {
          fs.writeFileSync('linkedin_api_response.json', JSON.stringify(data, null, 2));
          console.log('[API] Response saved to linkedin_api_response.json');
        }

        const text = summarizeApiData(data);
        if (text) {
          console.log(`[API] Success! Extracted ${text.length} chars`);
          return text;
        }
      } else {
        console.log(`[API] Status ${response.status}`);
        // 410 = deprecated, try next. 401/403 = auth issue, stop.
        if (response.status === 401 || response.status === 403) {
          console.log('[API] Auth failed, skipping remaining API endpoints');
          break;
        }
      }
    } catch (e) {
      console.log(`[API] Error: ${e.message}`);
    }
  }

  return '';
}

/**
 * Extract readable text from Voyager API JSON response.
 */
function summarizeApiData(data) {
  const lines = [];
  const included = data.included || data.elements || [];

  for (const item of included) {
    const type = item.$type || '';

    // Basic profile info
    if (item.firstName && item.lastName) {
      lines.push(`Name: ${item.firstName} ${item.lastName}`);
      if (item.headline) lines.push(`Headline: ${item.headline}`);
      if (item.summary) lines.push(`About: ${item.summary}`);
      if (item.locationName) lines.push(`Location: ${item.locationName}`);
      if (item.geoLocationName) lines.push(`Geo Location: ${item.geoLocationName}`);
      if (item.industryName) lines.push(`Industry: ${item.industryName}`);
    }

    // Positions / Experience
    if ((type.includes('Position') || type.includes('position')) && item.title) {
      const company = item.companyName || '';
      const desc = item.description || '';
      const dateRange = item.dateRange || item.timePeriod;
      let dateStr = '';
      if (dateRange) {
        const start = dateRange.start || dateRange.startDate;
        const end = dateRange.end || dateRange.endDate;
        if (start) dateStr += `${start.month || ''}/${start.year || ''}`;
        if (end) dateStr += ` - ${end.month || ''}/${end.year || ''}`;
        else if (start) dateStr += ' - Present';
      }
      lines.push(`Experience: ${item.title}${company ? ` at ${company}` : ''}${dateStr ? ` (${dateStr.trim()})` : ''}${desc ? ` — ${desc.substring(0, 300)}` : ''}`);
    }

    // Education
    if ((type.includes('Education') || type.includes('education')) && (item.schoolName || item.school)) {
      const school = item.schoolName || item.school || '';
      const degree = item.degreeName || '';
      const field = item.fieldOfStudy || '';
      lines.push(`Education: ${school}${degree ? `, ${degree}` : ''}${field ? ` in ${field}` : ''}`);
    }

    // Skills
    if ((type.includes('Skill') || type.includes('skill')) && item.name) {
      lines.push(`Skill: ${item.name}`);
    }

    // Text sections (newer API format)
    if (item.text?.text && item.text.text.length > 50) {
      lines.push(`Section: ${item.text.text}`);
    }
  }

  // Also check top-level elements
  if (data.elements) {
    for (const el of data.elements) {
      if (el.firstName && el.lastName) {
        lines.push(`Name: ${el.firstName} ${el.lastName}`);
        if (el.headline) lines.push(`Headline: ${el.headline}`);
        if (el.summary) lines.push(`About: ${el.summary}`);
        if (el.locationName) lines.push(`Location: ${el.locationName}`);
      }
    }
  }

  return lines.length > 0 ? 'VOYAGER API DATA:\n' + lines.join('\n') : '';
}

/**
 * Use Gemini AI to extract structured profile data
 */
async function extractProfileWithAI(content, profileUrl) {
  console.log('[AI] Starting AI extraction...');

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY is required for AI extraction');
  }

  const modelName = process.env.GEMINI_MODEL_SCRAPING || 'gemini-2.0-flash';
  console.log(`[AI] Using model: ${modelName}`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = `Extract LinkedIn profile information from the following data. It may contain both top card data (from the page) and detailed API data.

Return ONLY a valid JSON object with no markdown formatting, no code blocks, just the raw JSON.

DATA:
${content}

Extract and return this exact JSON structure (use empty string "" if data not found):
{
  "name": "Full name of the person",
  "title": "Their most recent/current job title (NOT just 'Senior Executive' - find their actual role with company if available)",
  "headline": "Profile headline (the text shown under their name on LinkedIn)",
  "company": "Current company name (from their most recent position)",
  "location": "Location (city, region/country as shown)",
  "about": "The full About/summary section text",
  "experience": "Summary of their top 2-3 work experiences, each with job title, company name, and dates if available",
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
