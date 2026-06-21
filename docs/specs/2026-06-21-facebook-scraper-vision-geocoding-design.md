---
name: facebook-scraper-vision-geocoding
description: Extend the Facebook scraper to OCR post images via Claude vision, extract location/directions, geocode with Google Maps API, and persist coordinates to the database
metadata:
  type: project
---

# Facebook Scraper — Vision OCR + Geocoding

**Date:** 2026-06-21  
**Status:** Approved  
**File:** `lib/facebook-scraper.ts`

## Problem

The scraper extracts `location_text` from post text using Claude, but `location_latitude`, `location_longitude`, and `location_region` are always saved as `null`. Post images (WhatsApp screenshots, Google Maps screenshots) often contain location/direction information that is not captured at all — image URLs are never collected.

## Goal

1. Capture post images during the Playwright session as base64 screenshots.
2. Send them to Claude Sonnet vision to OCR text and extract location/directions.
3. Geocode the extracted location text with the Google Maps Geocoding API.
4. Persist `location_latitude`, `location_longitude`, and `location_region` to the `facebook_patterns` table.

## Architecture

Three additions to `lib/facebook-scraper.ts`, wired into the existing `scrapeAndSeedFacebookPatterns` loop. No new files. No DB schema changes.

### 1. Image Capture (Playwright)

During `fetchFacebookGroupPosts`, for each `[role="article"]` element, find all `<img>` child elements and call `elementHandle.screenshot()` to get PNG bytes. Convert to base64 strings.

- `ScrapedPost.imageUrls: string[]` is replaced by `ScrapedPost.imageBase64: string[]`.
- Max images per post: 5 (to avoid token bloat).
- If a screenshot fails (element detached, not loaded), skip that image silently.

### 2. Claude Vision OCR + Location Extraction

`extractPatternWithClaude` is updated to pass base64 images alongside post text using Claude's vision message format (`image` content blocks with `base64` source type).

The prompt is expanded to instruct Claude to:
- OCR all image content.
- Extract any address, neighborhood, landmark, or directions from both the post text and the images.
- Return `location_text` as the best location signal found (text or image-derived).

Return shape is unchanged: `ClaudePatternExtraction` with `location_text: string | null`.

### 3. Google Maps Geocoding

New function `geocodeLocation(locationText: string)`:

```
GET https://maps.googleapis.com/maps/api/geocode/json
  ?address=<locationText>
  &key=<GOOGLE_MAPS_API_KEY>
  &language=es
  &region=mx
```

Returns `{ lat: number, lng: number, region: string } | null`.

- `region` is extracted from `address_components` as `administrative_area_level_1` (state-level).
- Called only when `location_text` is non-null.
- On zero results or API error: returns `null`; post is still saved with `location_text` and null coordinates.

## Data Flow

```
Playwright scrape
  → for each article: screenshot up to 5 <img> elements → base64[]
  → ScrapedPost { content, imageBase64[] }

Claude Sonnet (vision)
  → input: post text + base64 images as content blocks
  → output: tone_description, tone_keywords, image_descriptions, location_text

Google Maps Geocoding API (only if location_text non-null)
  → input: location_text
  → output: { lat, lng, region } | null

Supabase upsert
  → location_text, location_latitude, location_longitude, location_region
```

## Error Handling

| Failure | Behavior |
|---------|----------|
| Image screenshot fails | Skip that image, continue with remaining images |
| Claude returns no location_text | Skip geocoding, save null coordinates |
| Google Maps zero results | Save location_text, null coordinates |
| Google Maps API error | Log error, save location_text, null coordinates |
| Missing GOOGLE_MAPS_API_KEY | Log warning, skip geocoding for all posts |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Already present |
| `GOOGLE_MAPS_API_KEY` | New — Google Maps Geocoding API key |

## DB Schema

No changes. All required fields already exist in `facebook_patterns`:

- `location_text text`
- `location_latitude numeric`
- `location_longitude numeric`
- `location_region text`

## Constraints

- Images are behind Facebook auth — must be captured via Playwright (cannot pass URLs directly to Claude).
- Post images are WhatsApp screenshots and Google Maps screenshots.
- Claude model: `claude-sonnet-4-6` (already in use).
- Max 5 images per post to stay within Claude's token limits.
