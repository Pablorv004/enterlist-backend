# YouTube OAuth Authentication

This document provides information about the YouTube OAuth integration in Enterlist.

## Features

- One-click registration with YouTube/Google
- Login with YouTube (for existing users)
- Link YouTube account to existing user account
- Access to YouTube channels and videos

## Endpoints

### Register or Login with YouTube

**Endpoint:** `GET /api/auth/youtube/register-or-login`

**Description:** Initiates the YouTube OAuth flow for user registration or login. If the user doesn't already have an account linked to their YouTube profile, a new account will be created. If they do have an account, they will be logged in.

**Authentication Required:** No

**Response:** Redirects to Google authorization page and then to dashboard after completion.

### Link YouTube Account to Existing User

**Endpoint:** `GET /api/auth/youtube/login`

**Description:** Initiates the YouTube OAuth flow to link a YouTube account to an existing Enterlist account.

**Authentication Required:** Yes (JWT)

**Response:** Redirects to Google authorization page and then to dashboard after completion.

### Callback URL

**Endpoint:** `GET /api/auth/youtube/callback`

**Description:** Handles the callback from YouTube/Google OAuth. This endpoint processes the authorization code and creates/updates user accounts and linked accounts as needed.

### Get YouTube Channels

**Endpoint:** `GET /api/auth/youtube/channels`

**Description:** Retrieves the user's YouTube channels.

**Authentication Required:** Yes (JWT)

### Get YouTube Playlists

**Endpoint:** `GET /api/auth/youtube/playlists`

**Description:** Retrieves the user's YouTube playlists.

**Authentication Required:** Yes (JWT)

### Get User Videos

**Endpoint:** `GET /api/auth/youtube/videos`

**Description:** Retrieves the user's YouTube videos.

**Authentication Required:** Yes (JWT)

## User Registration Process

When a user registers through YouTube:

1. The user clicks "Register with YouTube" button
2. They are redirected to Google's authorization page where they grant access
3. Google redirects back to our callback URL with an authorization code
4. Our system exchanges the code for access and refresh tokens
5. We fetch the user's Google profile information and YouTube channel info
6. If a user with that YouTube ID already exists, they are logged in
7. If not, a new user account is created with:
   - Username: Their YouTube channel title or Google display name (or a default if not available)
   - Email: Their Google email (or a generated one if not available)
   - Role: Artist (default)
   - A randomly generated password (they won't need to know this as they'll log in via YouTube)
8. The user's YouTube account is linked to their Enterlist account
9. A JWT token is generated and returned
10. The user is redirected to the dashboard

## Linking Process

When linking a YouTube account to an existing user:

1. The authenticated user clicks "Link YouTube Account" button
2. They are redirected to Google's authorization page where they grant access
3. Google redirects back to our callback URL with an authorization code
4. Our system exchanges the code for access and refresh tokens
5. We fetch the user's Google profile and YouTube channel information
6. We create a new linked account in our database with the YouTube access and refresh tokens
7. The user is redirected to the dashboard with a success message
