# ReachOut - AI LinkedIn Message Generator

Generate personalized LinkedIn outreach messages using Google's Gemini AI. Transform generic templates into compelling, tailored messages that resonate with your prospects.

## Features

- **AI-Powered Personalization** - Uses Google Gemini AI to craft personalized messages
- **AI-Based Profile Extraction** - Uses Gemini to intelligently extract profile data from LinkedIn pages (robust against HTML changes)
- **LinkedIn Profile Scraping** - Puppeteer with authenticated session cookie for reliable access
- **Template Support** - Start with pre-built templates or create and save your own
- **Manual Input Fallback** - Enter profile details manually when needed
- **Modern UI** - Beautiful dark-themed interface with smooth animations

## Quick Start

### 1. Get a Google AI API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy your API key

### 2. Get Your LinkedIn Cookie

The scraper requires your LinkedIn session cookie (`li_at`) to access profile data:

1. Open LinkedIn in Chrome and make sure you're logged in
2. Press `F12` to open Developer Tools
3. Go to the **Application** tab
4. In the left sidebar, expand **Cookies** > **https://www.linkedin.com**
5. Find the cookie named **li_at**
6. Copy its **Value** (double-click to select all)

> **Note:** This cookie is your LinkedIn session. Keep it private and never share it. It expires periodically and will need to be updated.

### 3. Setup

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env  # or create .env manually
```

Add your credentials to `.env`:

```env
GOOGLE_AI_API_KEY=your_google_ai_api_key
LINKEDIN_COOKIE=your_li_at_cookie_value
```

Alternatively, you can enter the LinkedIn cookie directly in the app's Settings.

### 4. Run the App

```bash
# Start both frontend and backend
npm run dev
```

The app will be available at [http://localhost:5173](http://localhost:5173)

## Usage

1. **Configure LinkedIn Cookie** - Click Settings and paste your `li_at` cookie (or set it in `.env`)
2. **Enter LinkedIn URL** - Paste the LinkedIn profile URL of your prospect
3. **Write or Select Template** - Use a pre-built template or write your own message
4. **Generate** - Click the generate button to create a personalized message
5. **Copy & Send** - Copy the generated message and send it on LinkedIn

### Template Placeholders

You can use placeholders in your templates that will be replaced with actual values:
- `{name}` - Person's name
- `{company}` - Current company
- `{title}` - Job title
- `{location}` - Location

Or simply write naturally - the AI will personalize based on the context.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_AI_API_KEY` | Your Google AI (Gemini) API key | Yes |
| `LINKEDIN_COOKIE` | Your LinkedIn `li_at` session cookie | No (can be set in UI) |
| `PORT` | Server port (default: 3001) | No |
| `GEMINI_MODEL_SCRAPING` | Gemini model for profile extraction (default: `gemini-2.0-flash`) | No |
| `GEMINI_MODEL_MESSAGING` | Gemini model for message generation (default: `gemini-3-pro-preview`) | No |
| `DEBUG_MODE` | Set to `true` to show browser window during scraping | No |

## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend**: Express.js
- **Scraping**: Puppeteer (headless Chrome) + Gemini AI for data extraction
- **AI**: Google Gemini for both profile extraction and message personalization
- **Styling**: Custom CSS with CSS Variables

## Project Structure

```
linkedin-reach-out/
├── server/
│   ├── index.js              # Express server
│   └── linkedin-scraper.js   # Puppeteer-based LinkedIn scraper
├── src/
│   ├── main.jsx              # React entry point
│   ├── App.jsx               # Main React component
│   ├── App.css               # Component styles
│   └── index.css             # Global styles
├── public/
│   └── favicon.svg           # App icon
├── index.html                # HTML template
├── package.json              # Dependencies
├── vite.config.js            # Vite configuration
└── README.md                 # This file
```

## Debugging

To debug the LinkedIn scraper with a visible browser window, add to your `.env` file:

```env
DEBUG_MODE=true
```

This will:
- Show the Chrome browser window during scraping
- Save a screenshot as `debug-screenshot.png`
- Print detailed logs including page content and AI extraction steps
- Keep browser open for 30 seconds on error for inspection

## Troubleshooting

### "LinkedIn session expired or invalid"
Your `li_at` cookie has expired. Get a fresh cookie from LinkedIn (see step 2 above).

### "Could not extract profile data"
- Make sure you're using a valid LinkedIn profile URL (`linkedin.com/in/username`)
- The profile might have restricted visibility
- LinkedIn's HTML structure may have changed - check the console logs for debugging

### Scraping not working
- Enable `DEBUG_MODE` to see what's happening in the browser
- Check the server console for detailed profile data logs
- Try with a different LinkedIn profile

## License

MIT
