# Spotify OAuth Authentication

This document provides information about the Spotify OAuth integration in Enterlist.

## Features

- One-click registration with Spotify
- Login with Spotify (for existing users)
- Link Spotify account to existing user account
- Access to Spotify playlists and tracks

## Endpoints

### Register or Login with Spotify

**Endpoint:** `GET /api/auth/spotify/register-or-login`

**Description:** Initiates the Spotify OAuth flow for user registration or login. If the user doesn't already have an account linked to their Spotify profile, a new account will be created. If they do have an account, they will be logged in.

**Authentication Required:** No

**Response:** Redirects to Spotify authorization page and then to dashboard after completion.

### Link Spotify Account to Existing User

**Endpoint:** `GET /api/auth/spotify/login`

**Description:** Initiates the Spotify OAuth flow to link a Spotify account to an existing Enterlist account.

**Authentication Required:** Yes (JWT)

**Response:** Redirects to Spotify authorization page and then to dashboard after completion.

### Callback URL

**Endpoint:** `GET /api/auth/spotify/callback`

**Description:** Handles the callback from Spotify OAuth. This endpoint processes the authorization code and creates/updates user accounts and linked accounts as needed.

### Get Spotify Playlists

**Endpoint:** `GET /api/auth/spotify/playlists`

**Description:** Retrieves the user's Spotify playlists.

**Authentication Required:** Yes (JWT)

### Get User Tracks

**Endpoint:** `GET /api/auth/spotify/tracks`

**Description:** Retrieves the user's Spotify saved tracks and albums.

**Authentication Required:** Yes (JWT)

## User Registration Process

When a user registers through Spotify:

1. The user clicks "Register with Spotify" button
2. They are redirected to Spotify's authorization page where they grant access
3. Spotify redirects back to our callback URL with an authorization code
4. Our system exchanges the code for access and refresh tokens
5. We fetch the user's Spotify profile information
6. If a user with that Spotify ID already exists, they are logged in
7. If not, a new user account is created with:
   - Username: Their Spotify display name (or a default if not available)
   - Email: Their Spotify email (or a generated one if not available)
   - Role: Artist (default)
   - A randomly generated password (they won't need to know this as they'll log in via Spotify)
8. The user's Spotify account is linked to their Enterlist account
9. A JWT token is generated and returned
10. The user is redirected to the dashboard

## Linking Process

When linking a Spotify account to an existing user:

1. The authenticated user clicks "Link Spotify Account" button
2. They are redirected to Spotify's authorization page where they grant access
3. Spotify redirects back to our callback URL with an authorization code
4. Our system exchanges the code for access and refresh tokens
5. We fetch the user's Spotify profile information
6. We create a new linked account in our database with the Spotify access and refresh tokens
7. The user is redirected to the dashboard with a success message
