import dotenv from 'dotenv';
dotenv.config(); // Load .env BEFORE other imports that need env vars

import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { scrapeLinkedInProfile } from './linkedin-scraper.js';

const app = express();
const PORT = process.env.PORT || 3001;
const GEMINI_MODEL = process.env.GEMINI_MODEL_MESSAGING || 'gemini-3-pro-preview';

app.use(cors());
app.use(express.json());

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Generate personalized message endpoint
app.post('/api/generate-message', async (req, res) => {
  try {
    const { profileUrl, messageTemplate, manualProfileData, linkedinCookie } = req.body;

    if (!profileUrl && !manualProfileData) {
      return res.status(400).json({ 
        error: 'Please provide a LinkedIn profile URL or manual profile data' 
      });
    }

    if (!messageTemplate) {
      return res.status(400).json({ error: 'Message template is required' });
    }

    if (!process.env.GOOGLE_AI_API_KEY) {
      return res.status(500).json({ 
        error: 'Google AI API key not configured. Please add GOOGLE_AI_API_KEY to your .env file' 
      });
    }

    // Get LinkedIn cookie from request body or environment variable
    const liAtCookie = linkedinCookie || process.env.LINKEDIN_COOKIE;

    // Get profile data - either from scraping or manual input
    let profileData;
    
    if (manualProfileData && Object.keys(manualProfileData).length > 0) {
      profileData = manualProfileData;
    } else {
      // Check if we have a LinkedIn cookie for scraping
      if (!liAtCookie) {
        return res.status(400).json({
          error: 'LinkedIn cookie (li_at) is required for scraping. Please provide it in settings or enter profile details manually.',
          requireManualInput: true,
          requireCookie: true
        });
      }
      
      // Try to scrape LinkedIn profile with Puppeteer
      try {
        profileData = await scrapeLinkedInProfile(profileUrl, liAtCookie);
      } catch (scrapeError) {
        console.error('Scraping error:', scrapeError.message);
        return res.status(400).json({
          error: `Could not fetch LinkedIn profile: ${scrapeError.message}`,
          requireManualInput: true
        });
      }
    }

    // Generate personalized message using Google AI
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `You are an expert at writing personalized LinkedIn outreach messages. 
Your task is to take a message template and personalize it for a specific person based on their LinkedIn profile information.

**Profile Information:**
- Name: ${profileData.name || 'Unknown'}
- Current Title: ${profileData.title || 'Not provided'}
- Headline: ${profileData.headline || 'Not provided'}
- Company: ${profileData.company || 'Not provided'}
- Location: ${profileData.location || 'Not provided'}
- About/Summary: ${profileData.about || 'Not provided'}
- Experience: ${profileData.experience || 'Not provided'}
- Skills: ${profileData.skills || 'Not provided'}
- Education: ${profileData.education || 'Not provided'}

**Original Message Template:**
${messageTemplate}

**Instructions:**
1. Personalize the message template using the profile information
2. Replace any placeholders like {name}, {company}, {title}, etc. with actual values
3. Add specific, relevant references to their background, experience, or skills where appropriate
4. Keep the tone professional yet warm and authentic
5. Make sure the message feels genuine and not generic
6. Keep the message concise and impactful
7. Do NOT make up information that wasn't provided
8. If some information is missing, gracefully work around it

**Output only the personalized message, nothing else.**`;

    const result = await model.generateContent(prompt);
    const personalizedMessage = result.response.text();

    res.json({
      success: true,
      originalTemplate: messageTemplate,
      profileData: {
        name: profileData.name,
        title: profileData.title,
        headline: profileData.headline,
        company: profileData.company,
        location: profileData.location
      },
      personalizedMessage: personalizedMessage.trim()
    });

  } catch (error) {
    console.error('Error generating message:', error);
    res.status(500).json({ 
      error: 'Failed to generate message. Please try again.',
      details: error.message 
    });
  }
});

// Extract profile info endpoint (for preview)
app.post('/api/extract-profile', async (req, res) => {
  try {
    const { profileUrl, linkedinCookie } = req.body;

    if (!profileUrl) {
      return res.status(400).json({ error: 'LinkedIn profile URL is required' });
    }

    // Get LinkedIn cookie from request body or environment variable
    const liAtCookie = linkedinCookie || process.env.LINKEDIN_COOKIE;

    if (!liAtCookie) {
      return res.status(400).json({ 
        error: 'LinkedIn cookie (li_at) is required for scraping. Please provide it in settings.',
        requireCookie: true
      });
    }

    const profileData = await scrapeLinkedInProfile(profileUrl, liAtCookie);
    res.json({ success: true, profileData });

  } catch (error) {
    console.error('Error extracting profile:', error);
    res.status(400).json({ 
      error: `Could not fetch LinkedIn profile: ${error.message}`,
      requireManualInput: true
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 API endpoints:`);
  console.log(`   POST /api/generate-message - Generate personalized message`);
  console.log(`   POST /api/extract-profile - Extract LinkedIn profile data`);
});
