# ReachOut - AI LinkedIn Message Generator

Generate personalized LinkedIn outreach messages using Anthropic's Claude. Transform generic templates into compelling, tailored messages that resonate with your prospects.

## Features

- **AI-Powered Personalization** - Uses Claude Opus 4.7 to craft personalized messages
- **AI-Based Profile Extraction** - Uses Claude Haiku 4.5 to intelligently extract profile data from LinkedIn pages (robust against HTML changes)
- **LinkedIn Profile Scraping** - Stealth Puppeteer browser with authenticated session cookie for reliable, undetectable access
- **Template Support** - Start with pre-built templates or create and save your own
- **System Prompts** - Add custom instructions and context to guide AI message generation per template
- **Data Inclusion Control** - Select which profile data (about, experience, skills, education) to include per template
- **Profile Data Viewer** - View all scraped profile information after generation
- **Manual Input Fallback** - Enter profile details manually when needed
- **Modern UI** - Beautiful dark-themed interface with smooth animations

## Quick Start

### 1. Get an Anthropic API Key

1. Go to the [Anthropic Console](https://console.anthropic.com/settings/keys)
2. Click "Create Key"
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
ANTHROPIC_API_KEY=your_anthropic_api_key
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
4. **Configure Advanced Options** (optional):
   - **System Prompt** - Add custom instructions for the AI (e.g., "Keep messages under 100 words", "Mention mutual connections")
   - **Data Inclusion** - Toggle which profile data to use (About, Experience, Skills, Education)
5. **Generate** - Click the generate button to create a personalized message
6. **Review Profile Data** - View the scraped profile information in the expandable section
7. **Copy & Send** - Copy the generated message and send it on LinkedIn

### Template Placeholders

You can use placeholders in your templates that will be replaced with actual values:
- `{name}` - Person's name
- `{company}` - Current company
- `{title}` - Job title
- `{location}` - Location

Or simply write naturally - the AI will personalize based on the context.

### System Prompts

System prompts give the AI additional context and instructions. Examples:
- "You are reaching out on behalf of a tech startup. Keep messages brief and professional."
- "Focus on mutual benefits and always mention shared industry experience."
- "Write in a casual, friendly tone. Keep it under 50 words."

System prompts are saved per template, so different outreach types can have different AI instructions.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | Yes |
| `LINKEDIN_COOKIE` | Your LinkedIn `li_at` session cookie | No (can be set in UI) |
| `PORT` | Server port (default: 3001) | No |
| `ANTHROPIC_MODEL_SCRAPING` | Claude model for profile extraction (default: `claude-haiku-4-5`) | No |
| `ANTHROPIC_MODEL_MESSAGING` | Claude model for message generation (default: `claude-opus-4-7`) | No |
| `DEBUG_MODE` | Set to `true` to show browser window during scraping and enable verbose logging | No |

## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend**: Express.js
- **Scraping**: Puppeteer with Stealth Plugin + Claude Haiku for data extraction
- **AI**: Anthropic Claude (Opus 4.7 for messaging, Haiku 4.5 for profile extraction)
- **Styling**: Custom CSS with CSS Variables

## Project Structure

```
linkedin-reach-out/
├── server/
│   ├── index.js              # Express server
│   └── linkedin-scraper.js   # Stealth Puppeteer LinkedIn scraper
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

To enable verbose logging for the LinkedIn scraper, add to your `.env` file:

```env
DEBUG_MODE=true
```

This will:
- Show the browser window during scraping
- Save a screenshot as `debug-screenshot.png`
- Save the page text to `linkedin_page_text.txt`
- Print detailed logs including page content and AI extraction steps
- Keep the browser open for 30 seconds on error for inspection

## Troubleshooting

### "LinkedIn session expired or invalid"
Your `li_at` cookie has expired. Get a fresh cookie from LinkedIn (see step 2 above).

### "Could not extract profile data"
- Make sure you're using a valid LinkedIn profile URL (`linkedin.com/in/username`)
- The profile might have restricted visibility
- LinkedIn's HTML structure may have changed - check the console logs for debugging

### Scraping not working
- Enable `DEBUG_MODE` to see the browser window and inspect what's happening
- Check `debug-screenshot.png` and `linkedin_page_text.txt` for what the scraper sees
- Check the server console for detailed profile data logs
- Try with a different LinkedIn profile

## License

MIT
