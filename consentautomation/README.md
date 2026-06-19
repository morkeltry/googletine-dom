# YouTube Consent Automation

This folder contains automation scripts to study YouTube's consent/cookie acceptance flow.

## Purpose

When you visit YouTube with no cookies, YouTube shows a consent banner or overlay asking you to accept terms and/or cookies. This automation:

1. Opens YouTube with no cookies
2. Takes screenshots of each step
3. Finds and clicks "Accept & Continue" buttons
4. Captures cookies before and after
5. Logs all network requests
6. Saves screenshots and data to the `output/` folder

## Setup

```bash
cd consent-automation
npm install
npm start
```

## What Gets Captured

### Screenshots (output/*.png)
- `00-youtube-loaded.png` - Initial YouTube homepage
- `01-initial-load.png` - Page after first load
- `02-before-click.png` - Before clicking accept button
- `03-after-click.png` - After clicking accept button
- Plus additional screenshots of any overlays/banners found

### Cookie Data (output/*-cookies.json)
- `01-initial-cookies.json` - Cookies on initial load
- `final-state.json` - All cookies after clicking accept

### Network Activity (output/network-requests.json)
- Logs all HTTP requests made during the session

## Manual Inspection

The browser stays open after clicking "Accept" so you can manually:
- See what changed on the page
- Check what cookies were set
- Inspect network activity
- Test if the consent was properly accepted

## How to Use

1. Run `npm start`
2. Watch the automation in the browser window
3. Press Ctrl+C when done
4. Check the `output/` folder for screenshots and data

## Current YouTube Behavior (Last Tested: June 2026)

YouTube uses:
- `VISITOR_PRIVACY_METADATA` for privacy consent (not CONSENT cookie)
- `__Secure-YENID` and `__Secure-YEC` for encrypted user data
- `VISITOR_INFO1_LIVE` for visitor tracking
- `YSC` for session state

The "Accept & Continue" button may appear in different locations depending on:
- Your geographic location
- Your account status
- YouTube's A/B testing
- Cookie consent history
