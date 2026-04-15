import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Scrapes LinkedIn profile data using LinkedIn's Voyager API with authenticated session cookies.
 * Uses direct HTTP requests instead of a browser to avoid triggering LinkedIn's
 * new-device detection (which invalidates the session).
 * Uses AI to extract structured data from the API response.
 */
export async function scrapeLinkedInProfile(profileUrl, linkedinCookie) {
  const DEBUG_MODE = process.env.DEBUG_MODE === 'true';

  // Validate LinkedIn URL
  if (!profileUrl || !profileUrl.includes('linkedin.com/in/')) {
    throw new Error('Invalid LinkedIn profile URL. URL should be like: https://www.linkedin.com/in/username');
  }

  if (!linkedinCookie) {
    throw new Error('LinkedIn session cookie (li_at) is required for scraping');
  }

  // Extract username from URL
  const cleanUrl = profileUrl.split('?')[0].replace(/\/$/, '');
  const username = cleanUrl.split('/in/')[1];

  if (!username) {
    throw new Error('Could not extract username from LinkedIn URL');
  }

  console.log(`[Scraper] DEBUG_MODE: ${DEBUG_MODE}`);
  console.log(`[Scraper] Target URL: ${cleanUrl}`);
  console.log(`[Scraper] Username: ${username}`);

  try {
    // Step 1: Get CSRF token by fetching LinkedIn with the session cookie
    console.log('[Scraper] Fetching CSRF token...');
    const csrfResponse = await fetch('https://www.linkedin.com/', {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': `li_at=${linkedinCookie}`,
      },
      redirect: 'manual',
    });

    // Check if session is valid (LinkedIn redirects to login if invalid)
    if (csrfResponse.status === 302 || csrfResponse.status === 301) {
      const location = csrfResponse.headers.get('location') || '';
      if (location.includes('/login') || location.includes('/authwall')) {
        throw new Error('LinkedIn session expired or invalid. Please update your li_at cookie.');
      }
    }

    // Extract JSESSIONID from set-cookie headers for CSRF token
    const setCookies = csrfResponse.headers.getSetCookie?.() || [];
    let jsessionId = '';
    for (const cookie of setCookies) {
      const match = cookie.match(/JSESSIONID="?([^";]+)"?/);
      if (match) {
        jsessionId = match[1];
        break;
      }
    }

    // Also try to extract from response cookies string
    if (!jsessionId) {
      const cookieHeader = csrfResponse.headers.get('set-cookie') || '';
      const match = cookieHeader.match(/JSESSIONID="?([^";]+)"?/);
      if (match) {
        jsessionId = match[1];
      }
    }

    if (!jsessionId) {
      // Generate a CSRF token format that LinkedIn accepts
      jsessionId = `ajax:${Date.now()}`;
      console.log('[Scraper] Could not extract JSESSIONID, using generated token');
    }

    const csrfToken = jsessionId.replace(/"/g, '');
    console.log(`[Scraper] CSRF token: ${csrfToken.substring(0, 15)}...`);

    // Step 2: Fetch profile page HTML and extract data
    console.log('[Scraper] Fetching profile page...');
    const profileResponse = await fetch(cleanUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': `li_at=${linkedinCookie}; JSESSIONID="${csrfToken}"`,
        'csrf-token': csrfToken,
      },
    });

    if (!profileResponse.ok) {
      console.error(`[Scraper] Response status: ${profileResponse.status}`);

      if (profileResponse.status === 401 || profileResponse.status === 403) {
        throw new Error('LinkedIn session expired or invalid. Please update your li_at cookie.');
      }
      if (profileResponse.status === 404) {
        throw new Error('LinkedIn profile not found. Please check the URL.');
      }
      throw new Error(`LinkedIn returned status ${profileResponse.status}`);
    }

    const html = await profileResponse.text();

    // Check if we got redirected to login
    if (html.includes('/login') && html.includes('session_redirect') && !html.includes('profile-nav-item')) {
      throw new Error('LinkedIn session expired or invalid. Please update your li_at cookie.');
    }

    if (DEBUG_MODE) {
      console.log(`\n========== HTML RESPONSE (${html.length} chars, first 2000) ==========`);
      console.log(html.substring(0, 2000));
      console.log('==========================================================\n');
    }

    // Step 3: Try to extract structured data from embedded JSON-LD or code elements
    console.log('[Scraper] Extracting profile data...');
    let profileData = extractProfileFromHTML(html, cleanUrl);

    // If HTML extraction got minimal data, fall back to AI extraction
    if (!profileData.name || profileData.name === 'Unknown') {
      console.log('[Scraper] HTML extraction insufficient, falling back to AI extraction...');
      // Strip HTML tags to get text content for AI
      const textContent = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const aiProfileData = await extractProfileWithAI(textContent.substring(0, 8000), cleanUrl);
      return aiProfileData;
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
 * Extract structured profile data from LinkedIn HTML page.
 * LinkedIn embeds JSON-LD structured data in the page for SEO.
 */
function extractProfileFromHTML(html, profileUrl) {
  const profile = {
    name: '',
    title: '',
    headline: '',
    company: '',
    location: '',
    about: '',
    experience: '',
    skills: '',
    education: '',
    profileUrl: profileUrl,
  };

  try {
    // Try to extract JSON-LD structured data (LinkedIn embeds this for SEO)
    const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      const jsonLd = JSON.parse(jsonLdMatch[1]);
      console.log('[Scraper] Found JSON-LD data');

      if (jsonLd['@type'] === 'Person' || jsonLd.name) {
        profile.name = jsonLd.name || '';
        profile.headline = jsonLd.jobTitle || jsonLd.description || '';
        profile.title = jsonLd.jobTitle || '';
        profile.location = typeof jsonLd.address === 'object'
          ? jsonLd.address.addressLocality || jsonLd.address.name || ''
          : (jsonLd.address || '');

        if (jsonLd.worksFor) {
          const org = Array.isArray(jsonLd.worksFor) ? jsonLd.worksFor[0] : jsonLd.worksFor;
          profile.company = org?.name || '';
        }

        if (jsonLd.alumniOf) {
          const schools = Array.isArray(jsonLd.alumniOf) ? jsonLd.alumniOf : [jsonLd.alumniOf];
          profile.education = schools.map(s => s.name || s).filter(Boolean).join('; ');
        }
      }
    }

    // Try to extract data from embedded code/initial state objects
    const codeMatches = html.matchAll(/<code[^>]*id="bpr-guid-\d+"[^>]*><!--([\s\S]*?)--><\/code>/gi);
    for (const match of codeMatches) {
      try {
        const data = JSON.parse(match[1]);
        const included = data.included || [];
        for (const item of included) {
          const type = item.$type || '';

          if (type.includes('Profile') && item.firstName && !profile.name) {
            profile.name = `${item.firstName} ${item.lastName}`.trim();
            profile.headline = item.headline || profile.headline;
            profile.location = item.locationName || item.geoLocationName || profile.location;
          }

          if (type.includes('Profile') && item.summary && !profile.about) {
            profile.about = item.summary;
          }
        }

        // Positions
        const positions = included.filter(i => (i.$type || '').includes('Position') && i.title);
        if (positions.length > 0 && !profile.experience) {
          const current = positions[0];
          if (!profile.title) profile.title = current.title;
          if (!profile.company) profile.company = current.companyName || '';
          profile.experience = positions.slice(0, 3).map(p => {
            const parts = [p.title];
            if (p.companyName) parts.push(`at ${p.companyName}`);
            return parts.join(' ');
          }).join('; ');
        }

        // Skills
        const skills = included.filter(i => (i.$type || '').includes('Skill') && i.name);
        if (skills.length > 0 && !profile.skills) {
          profile.skills = skills.map(s => s.name).slice(0, 10).join(', ');
        }

        // Education
        const edu = included.filter(i => (i.$type || '').includes('Education') && (i.schoolName || i.school));
        if (edu.length > 0 && !profile.education) {
          profile.education = edu.slice(0, 3).map(e => {
            const parts = [e.schoolName || e.school];
            if (e.fieldOfStudy) parts.push(`- ${e.fieldOfStudy}`);
            if (e.degreeName) parts.push(`(${e.degreeName})`);
            return parts.join(' ');
          }).join('; ');
        }
      } catch {
        // Not valid JSON, skip
      }
    }

  } catch (err) {
    console.error('[Scraper] Error parsing HTML data:', err.message);
  }

  return profile;
}

/**
 * Use Gemini AI to extract structured profile data from page content (fallback)
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

  const contentToSend = pageContent.substring(0, 8000);

  const prompt = `Extract LinkedIn profile information from the following API response data. Return ONLY a valid JSON object with no markdown formatting, no code blocks, just the raw JSON.

DATA:
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
