# Enterlist API Documentation

This document provides comprehensive documentation for all endpoints in the Enterlist backend API.

## Table of Contents

1. [Authentication](#authentication)
2. [Users](#users)
3. [Playlists](#playlists)
4. [Songs](#songs)
5. [Submissions](#submissions)
6. [Platforms](#platforms)
7. [Linked Accounts](#linked-accounts)
8. [Payment Methods](#payment-methods)
9. [Transactions](#transactions)
10. [Admin Actions](#admin-actions)
11. [Health Check](#health-check)

---

## Authentication

### Register a New User

**Endpoint:** `POST /auth/register`

**Description:** Creates a new user account.

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "role": "artist | playlist_maker | admin",
  "oauth_provider": "string", // Optional
  "oauth_id": "string" // Optional
}
```

**Response:**
- **Status Code:** 201 (Created)
- **Body:**
```json
{
  "user_id": "uuid",
  "username": "string",
  "email": "string",
  "role": "artist | playlist_maker | admin",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Login

**Endpoint:** `POST /auth/login`

**Description:** Authenticates a user and returns a JWT token.

**Request Body:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "access_token": "string",
  "user": {
    "user_id": "uuid",
    "username": "string",
    "email": "string",
    "role": "artist | playlist_maker | admin"
  }
}
```

### Get User Profile

**Endpoint:** `GET /auth/profile`

**Description:** Returns the profile of the authenticated user.

**Authentication Required:** Yes (JWT)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "user_id": "uuid",
  "username": "string",
  "email": "string",
  "role": "artist | playlist_maker | admin"
}
```

### Spotify OAuth Login

**Endpoint:** `GET /auth/spotify/login`

**Description:** Initiates the Spotify OAuth flow. Redirects the user to Spotify's authorization page.

**Authentication Required:** Yes (JWT)

**Response:** 
- Redirects to Spotify authorization page.

### Spotify OAuth Callback

**Endpoint:** `GET /auth/spotify/callback`

**Description:** Callback endpoint for Spotify OAuth. This endpoint is called by Spotify after user authorization.

**Query Parameters:**
- `code`: The authorization code from Spotify
- `state`: State parameter for CSRF protection
- `error`: Error message (if any)

**Response:** 
- Redirects to the frontend dashboard with success or error status.

### Get Spotify Playlists

**Endpoint:** `GET /auth/spotify/playlists`

**Description:** Retrieves the user's Spotify playlists.

**Authentication Required:** Yes (JWT)

**Query Parameters:**
- `limit` (optional): Number of playlists to return (default: 50)
- `offset` (optional): Offset for pagination (default: 0)

**Response:**
- **Status Code:** 200 (OK)
- **Body:** Spotify API response containing the user's playlists

### Get Spotify Tracks

**Endpoint:** `GET /auth/spotify/tracks`

**Description:** Retrieves the user's saved tracks and albums from Spotify. If the user is an artist, it will also return their artist albums.

**Authentication Required:** Yes (JWT)

**Query Parameters:**
- `limit` (optional): Number of tracks to return (default: 50)
- `offset` (optional): Offset for pagination (default: 0)

**Response:**
- **Status Code:** 200 (OK)
- **Body:** Spotify API response containing the user's tracks and albums
  - If user is an artist:
    ```json
    {
      "saved_tracks": {
        "items": [...],
        "total": number,
        "limit": number,
        "offset": number,
        "href": "string",
        "next": "string"
      },
      "artist_albums": {
        "items": [...],
        "total": number,
        "limit": number,
        "offset": number,
        "href": "string",
        "next": "string"
      }
    }
    ```
  - If user is not an artist:
    ```json
    {
      "items": [...],
      "total": number,
      "limit": number,
      "offset": number,
      "href": "string", 
      "next": "string"
    }
    ```

### Get YouTube Playlists

**Endpoint:** `GET /api/auth/youtube/playlists`

**Description:** Retrieves the user's YouTube playlists with enhanced channel information.

**Authentication Required:** Yes (JWT)

**Query Parameters:**
- `limit` (optional): Number of playlists to return (default: 50)
- `offset` (optional): Offset for pagination (default: 0)

**Response:**
- **Status Code:** 200 (OK)
- **Body:** YouTube API response containing the user's playlists with additional channel information
```json
{
  "items": [
    {
      "id": "string",
      "snippet": {
        "title": "string",
        "description": "string",
        "channelId": "string",
        "channelTitle": "string",
        "publishedAt": "timestamp",
        "thumbnails": {
          "default": { "url": "string", "width": number, "height": number },
          "medium": { "url": "string", "width": number, "height": number },
          "high": { "url": "string", "width": number, "height": number }
        }
      },
      "contentDetails": {
        "itemCount": number
      },
      "channelInfo": {
        "subscriberCount": "string",
        "viewCount": "string",
        "channelTitle": "string"
      }
    }
  ],
  "pageInfo": {
    "totalResults": number,
    "resultsPerPage": number
  }
}
```
---

## Users

### Get All Users

**Endpoint:** `GET /users`

**Description:** Retrieves a paginated list of all users.

**Authentication Required:** Yes (JWT, Admin role)

**Query Parameters:**
- `skip` (optional): Number of items to skip (default: 0)
- `take` (optional): Number of items to take (default: 10)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "data": [
    {
      "user_id": "uuid",
      "username": "string",
      "email": "string",
      "role": "artist | playlist_maker | admin",
      "created_at": "timestamp",
      "updated_at": "timestamp",
      "is_active": boolean
    }
  ],
  "count": number,
  "total": number
}
```

### Get User by ID

**Endpoint:** `GET /users/:id`

**Description:** Retrieves a specific user by ID.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: User ID (UUID)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "user_id": "uuid",
  "username": "string",
  "email": "string",
  "role": "artist | playlist_maker | admin",
  "created_at": "timestamp",
  "updated_at": "timestamp",
  "is_active": boolean
}
```

### Create User

**Endpoint:** `POST /users`

**Description:** Creates a new user.

**Authentication Required:** Yes (JWT, Admin role)

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "role": "artist | playlist_maker | admin",
  "oauth_provider": "string", // Optional
  "oauth_id": "string" // Optional
}
```

**Response:**
- **Status Code:** 201 (Created)
- **Body:**
```json
{
  "user_id": "uuid",
  "username": "string",
  "email": "string",
  "role": "artist | playlist_maker | admin",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Update User

**Endpoint:** `PUT /users/:id`

**Description:** Updates a user's information.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: User ID (UUID)

**Request Body:**
```json
{
  "username": "string", // Optional
  "email": "string", // Optional
  "password": "string", // Optional
  "role": "artist | playlist_maker | admin", // Optional
  "oauth_provider": "string", // Optional
  "oauth_id": "string", // Optional
  "is_active": boolean // Optional
}
```

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "user_id": "uuid",
  "username": "string",
  "email": "string",
  "role": "artist | playlist_maker | admin",
  "created_at": "timestamp",
  "updated_at": "timestamp",
  "is_active": boolean
}
```

### Delete User

**Endpoint:** `DELETE /users/:id`

**Description:** Deletes a user.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: User ID (UUID)

**Response:**
- **Status Code:** 200 (OK)
- **Body:** No body

---

## Playlists

### Get All Playlists

**Endpoint:** `GET /playlists`

**Description:** Retrieves a paginated list of all playlists.

**Authentication Required:** No

**Query Parameters:**
- `skip` (optional): Number of items to skip (default: 0)
- `take` (optional): Number of items to take (default: 10)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "data": [
    {
      "playlist_id": "uuid",
      "creator_id": "uuid",
      "platform_id": number,
      "platform_specific_id": "string",
      "name": "string",
      "description": "string",
      "url": "string",
      "cover_image_url": "string",
      "is_visible": boolean,
      "genre": "string",
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ],
  "count": number,
  "total": number
}
```

### Get Playlists by Creator

**Endpoint:** `GET /playlists/creator/:creatorId`

**Description:** Retrieves a paginated list of playlists by creator ID.

**Authentication Required:** No

**Path Parameters:**
- `creatorId`: Creator's User ID (UUID)

**Query Parameters:**
- `skip` (optional): Number of items to skip (default: 0)
- `take` (optional): Number of items to take (default: 10)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "data": [
    {
      "playlist_id": "uuid",
      "creator_id": "uuid",
      "platform_id": number,
      "platform_specific_id": "string",
      "name": "string",
      "description": "string",
      "url": "string",
      "cover_image_url": "string",
      "is_visible": boolean,
      "genre": "string",
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ],
  "count": number,
  "total": number
}
```

### Get Playlist by ID

**Endpoint:** `GET /playlists/:id`

**Description:** Retrieves a specific playlist by ID.

**Authentication Required:** No

**Path Parameters:**
- `id`: Playlist ID (UUID)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "playlist_id": "uuid",
  "creator_id": "uuid",
  "platform_id": number,
  "platform_specific_id": "string",
  "name": "string",
  "description": "string",
  "url": "string",
  "cover_image_url": "string",
  "is_visible": boolean,
  "genre": "string",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Create Playlist

**Endpoint:** `POST /playlists`

**Description:** Creates a new playlist.

**Authentication Required:** Yes (JWT)

**Request Body:**
```json
{
  "creator_id": "uuid",
  "platform_id": number,
  "platform_specific_id": "string",
  "name": "string",
  "description": "string", // Optional
  "url": "string", // Optional
  "cover_image_url": "string", // Optional
  "is_visible": boolean, // Optional
  "genre": "string", // Optional
}
```

**Response:**
- **Status Code:** 201 (Created)
- **Body:**
```json
{
  "playlist_id": "uuid",
  "creator_id": "uuid",
  "platform_id": number,
  "platform_specific_id": "string",
  "name": "string",
  "description": "string",
  "url": "string",
  "cover_image_url": "string",
  "is_visible": boolean,
  "genre": "string",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Update Playlist

**Endpoint:** `PUT /playlists/:id`

**Description:** Updates a playlist's information.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: Playlist ID (UUID)

**Request Body:**
```json
{
  "name": "string", // Optional
  "description": "string", // Optional
  "url": "string", // Optional
  "cover_image_url": "string", // Optional
  "is_visible": boolean, // Optional
  "genre": "string", // Optional
}
```

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "playlist_id": "uuid",
  "creator_id": "uuid",
  "platform_id": number,
  "platform_specific_id": "string",
  "name": "string",
  "description": "string",
  "url": "string",
  "cover_image_url": "string",
  "is_visible": boolean,
  "genre": "string",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Delete Playlist

**Endpoint:** `DELETE /playlists/:id`

**Description:** Deletes a playlist.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: Playlist ID (UUID)

**Response:**
- **Status Code:** 200 (OK)
- **Body:** No body

---

## Songs

### Get All Songs

**Endpoint:** `GET /songs`

**Description:** Retrieves a paginated list of all songs.

**Authentication Required:** No

**Query Parameters:**
- `skip` (optional): Number of items to skip (default: 0)
- `take` (optional): Number of items to take (default: 10)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "data": [
    {
      "song_id": "uuid",
      "artist_id": "uuid",
      "platform_id": number,
      "platform_specific_id": "string",
      "title": "string",
      "artist_name_on_platform": "string",
      "album_name": "string",
      "url": "string",
      "cover_image_url": "string",
      "duration_ms": number,
      "is_visible": boolean,
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ],
  "count": number,
  "total": number
}
```

### Get Songs by Artist

**Endpoint:** `GET /songs/artist/:artistId`

**Description:** Retrieves a paginated list of songs by artist ID.

**Authentication Required:** No

**Path Parameters:**
- `artistId`: Artist's User ID (UUID)

**Query Parameters:**
- `skip` (optional): Number of items to skip (default: 0)
- `take` (optional): Number of items to take (default: 10)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "data": [
    {
      "song_id": "uuid",
      "artist_id": "uuid",
      "platform_id": number,
      "platform_specific_id": "string",
      "title": "string",
      "artist_name_on_platform": "string",
      "album_name": "string",
      "url": "string",
      "cover_image_url": "string",
      "duration_ms": number,
      "is_visible": boolean,
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ],
  "count": number,
  "total": number
}
```

### Get Song by ID

**Endpoint:** `GET /songs/:id`

**Description:** Retrieves a specific song by ID.

**Authentication Required:** No

**Path Parameters:**
- `id`: Song ID (UUID)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "song_id": "uuid",
  "artist_id": "uuid",
  "platform_id": number,
  "platform_specific_id": "string",
  "title": "string",
  "artist_name_on_platform": "string",
  "album_name": "string",
  "url": "string",
  "cover_image_url": "string",
  "duration_ms": number,
  "is_visible": boolean,
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Create Song

**Endpoint:** `POST /songs`

**Description:** Creates a new song.

**Authentication Required:** Yes (JWT)

**Request Body:**
```json
{
  "artist_id": "uuid",
  "platform_id": number,
  "platform_specific_id": "string",
  "title": "string",
  "artist_name_on_platform": "string",
  "album_name": "string",
  "url": "string",
  "cover_image_url": "string",
  "duration_ms": number,
  "is_visible": boolean
}
```

**Response:**
- **Status Code:** 201 (Created)
- **Body:**
```json
{
  "song_id": "uuid",
  "artist_id": "uuid",
  "platform_id": number,
  "platform_specific_id": "string",
  "title": "string",
  "artist_name_on_platform": "string",
  "album_name": "string",
  "url": "string",
  "cover_image_url": "string",
  "duration_ms": number,
  "is_visible": boolean,
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Update Song

**Endpoint:** `PUT /songs/:id`

**Description:** Updates a song's information.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: Song ID (UUID)

**Request Body:**
```json
{
  "title": "string", // Optional
  "artist_name_on_platform": "string", // Optional
  "album_name": "string", // Optional
  "url": "string", // Optional
  "cover_image_url": "string", // Optional
  "duration_ms": number, // Optional
  "is_visible": boolean // Optional
}
```

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "song_id": "uuid",
  "artist_id": "uuid",
  "platform_id": number,
  "platform_specific_id": "string",
  "title": "string",
  "artist_name_on_platform": "string",
  "album_name": "string",
  "url": "string",
  "cover_image_url": "string",
  "duration_ms": number,
  "is_visible": boolean,
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Delete Song

**Endpoint:** `DELETE /songs/:id`

**Description:** Deletes a song.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: Song ID (UUID)

**Response:**
- **Status Code:** 200 (OK)
- **Body:** No body

---

## Submissions

### Get All Submissions

**Endpoint:** `GET /submissions`

**Description:** Retrieves a paginated list of all submissions.

**Authentication Required:** Yes (JWT)

**Query Parameters:**
- `skip` (optional): Number of items to skip (default: 0)
- `take` (optional): Number of items to take (default: 10)
- `status` (optional): Filter by status (pending, approved, rejected)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "data": [
    {
      "submission_id": "uuid",
      "artist_id": "uuid",
      "playlist_id": "uuid",
      "song_id": "uuid",
      "status": "pending | approved | rejected",
      "submission_message": "string",
      "review_feedback": "string",
      "submitted_at": "timestamp",
      "reviewed_at": "timestamp"
    }
  ],
  "count": number,
  "total": number
}
```

### Get Submissions by Artist

**Endpoint:** `GET /submissions/artist/:artistId`

**Description:** Retrieves a paginated list of submissions by artist ID.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `artistId`: Artist's User ID (UUID)

**Query Parameters:**
- `skip` (optional): Number of items to skip (default: 0)
- `take` (optional): Number of items to take (default: 10)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "data": [
    {
      "submission_id": "uuid",
      "artist_id": "uuid",
      "playlist_id": "uuid",
      "song_id": "uuid",
      "status": "pending | approved | rejected",
      "submission_message": "string",
      "review_feedback": "string",
      "submitted_at": "timestamp",
      "reviewed_at": "timestamp"
    }
  ],
  "count": number,
  "total": number
}
```

### Get Submissions by Playlist

**Endpoint:** `GET /submissions/playlist/:playlistId`

**Description:** Retrieves a paginated list of submissions by playlist ID.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `playlistId`: Playlist ID (UUID)

**Query Parameters:**
- `skip` (optional): Number of items to skip (default: 0)
- `take` (optional): Number of items to take (default: 10)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "data": [
    {
      "submission_id": "uuid",
      "artist_id": "uuid",
      "playlist_id": "uuid",
      "song_id": "uuid",
      "status": "pending  | approved | rejected",
      "submission_message": "string",
      "review_feedback": "string",
      "submitted_at": "timestamp",
      "reviewed_at": "timestamp"
    }
  ],
  "count": number,
  "total": number
}
```

### Get Submission by ID

**Endpoint:** `GET /submissions/:id`

**Description:** Retrieves a specific submission by ID.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: Submission ID (UUID)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "submission_id": "uuid",
  "artist_id": "uuid",
  "playlist_id": "uuid",
  "song_id": "uuid",
  "status": "pending | approved | rejected",
  "submission_message": "string",
  "review_feedback": "string",
  "submitted_at": "timestamp",
  "reviewed_at": "timestamp",
  "song": {
    // Song details
  },
  "artist": {
    // Artist details
  },
  "playlist": {
    // Playlist details
  }
}
```

### Create Submission

**Endpoint:** `POST /submissions`

**Description:** Creates a new submission.

**Authentication Required:** Yes (JWT)

**Request Body:**
```json
{
  "artist_id": "uuid",
  "playlist_id": "uuid",
  "song_id": "uuid",
  "submission_message": "string" // Optional
}
```

**Response:**
- **Status Code:** 201 (Created)
- **Body:**
```json
{
  "submission_id": "uuid",
  "artist_id": "uuid",
  "playlist_id": "uuid",
  "song_id": "uuid",
  "status": "pending",
  "submission_message": "string",
  "submitted_at": "timestamp"
}
```

### Update Submission

**Endpoint:** `PUT /submissions/:id`

**Description:** Updates a submission's information (typically used by playlist makers to review submissions).

**Authentication Required:** Yes (JWT, Playlist Maker or Admin role)

**Path Parameters:**
- `id`: Submission ID (UUID)

**Request Body:**
```json
{
  "status": "pending | approved | rejected", // Optional
  "review_feedback": "string", // Optional
  "reviewed_at": "date" // Optional
}
```

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "submission_id": "uuid",
  "artist_id": "uuid",
  "playlist_id": "uuid",
  "song_id": "uuid",
  "status": "pending | approved | rejected",
  "submission_message": "string",
  "review_feedback": "string",
  "submitted_at": "timestamp",
  "reviewed_at": "timestamp"
}
```

### Delete Submission

**Endpoint:** `DELETE /submissions/:id`

**Description:** Deletes a submission.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: Submission ID (UUID)

**Response:**
- **Status Code:** 200 (OK)
- **Body:** No body

---

## Platforms

### Get All Platforms

**Endpoint:** `GET /platforms`

**Description:** Retrieves a list of all music platforms.

**Authentication Required:** No

**Query Parameters:**
- `skip` (optional): Number of items to skip (default: 0)
- `take` (optional): Number of items to take (default: 10)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "data": [
    {
      "platform_id": number,
      "name": "string",
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ],
  "count": number,
  "total": number
}
```

### Get Platform by ID

**Endpoint:** `GET /platforms/:id`

**Description:** Retrieves a specific platform by ID.

**Authentication Required:** No

**Path Parameters:**
- `id`: Platform ID (number)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "platform_id": number,
  "name": "string",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Create Platform

**Endpoint:** `POST /platforms`

**Description:** Creates a new platform.

**Authentication Required:** Yes (JWT)

**Request Body:**
```json
{
  "name": "string"
}
```

**Response:**
- **Status Code:** 201 (Created)
- **Body:**
```json
{
  "platform_id": number,
  "name": "string",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Update Platform

**Endpoint:** `PUT /platforms/:id`

**Description:** Updates a platform's information.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: Platform ID (number)

**Request Body:**
```json
{
  "name": "string"
}
```

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "platform_id": number,
  "name": "string",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Delete Platform

**Endpoint:** `DELETE /platforms/:id`

**Description:** Deletes a platform.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: Platform ID (number)

**Response:**
- **Status Code:** 200 (OK)
- **Body:** No body

---

## Linked Accounts

### Get All Linked Accounts

**Endpoint:** `GET /linked-accounts`

**Description:** Retrieves a paginated list of all linked accounts.

**Authentication Required:** Yes (JWT)

**Query Parameters:**
- `skip` (optional): Number of items to skip (default: 0)
- `take` (optional): Number of items to take (default: 10)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "data": [
    {
      "linked_account_id": "uuid",
      "user_id": "uuid",
      "platform_id": number,
      "platform_specific_id": "string",
      "auth_token": "string",
      "refresh_token": "string",
      "token_expires_at": "timestamp",
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ],
  "count": number,
  "total": number
}
```

### Get Linked Accounts by User

**Endpoint:** `GET /linked-accounts/user/:userId`

**Description:** Retrieves a paginated list of linked accounts by user ID.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `userId`: User ID (UUID)

**Query Parameters:**
- `skip` (optional): Number of items to skip (default: 0)
- `take` (optional): Number of items to take (default: 10)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "data": [
    {
      "linked_account_id": "uuid",
      "user_id": "uuid",
      "platform_id": number,
      "platform_specific_id": "string",
      "auth_token": "string",
      "refresh_token": "string",
      "token_expires_at": "timestamp",
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ],
  "count": number,
  "total": number
}
```

### Get Linked Account by ID

**Endpoint:** `GET /linked-accounts/:id`

**Description:** Retrieves a specific linked account by ID.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: Linked Account ID (UUID)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "linked_account_id": "uuid",
  "user_id": "uuid",
  "platform_id": number,
  "platform_specific_id": "string",
  "auth_token": "string",
  "refresh_token": "string",
  "token_expires_at": "timestamp",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Create Linked Account

**Endpoint:** `POST /linked-accounts`

**Description:** Creates a new linked account.

**Authentication Required:** Yes (JWT)

**Request Body:**
```json
{
  "user_id": "uuid",
  "platform_id": number,
  "platform_specific_id": "string",
  "auth_token": "string",
  "refresh_token": "string",
  "token_expires_at": "timestamp"
}
```

**Response:**
- **Status Code:** 201 (Created)
- **Body:**
```json
{
  "linked_account_id": "uuid",
  "user_id": "uuid",
  "platform_id": number,
  "platform_specific_id": "string",
  "auth_token": "string",
  "refresh_token": "string",
  "token_expires_at": "timestamp",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Update Linked Account

**Endpoint:** `PUT /linked-accounts/:id`

**Description:** Updates a linked account's information.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: Linked Account ID (UUID)

**Request Body:**
```json
{
  "auth_token": "string", // Optional
  "refresh_token": "string", // Optional
  "token_expires_at": "timestamp" // Optional
}
```

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "linked_account_id": "uuid",
  "user_id": "uuid",
  "platform_id": number,
  "platform_specific_id": "string",
  "auth_token": "string",
  "refresh_token": "string",
  "token_expires_at": "timestamp",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Delete Linked Account

**Endpoint:** `DELETE /linked-accounts/:id`

**Description:** Deletes a linked account.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: Linked Account ID (UUID)

**Response:**
- **Status Code:** 200 (OK)
- **Body:** No body

---

## Payment Methods

### Get All Payment Methods

**Endpoint:** `GET /payment-methods`

**Description:** Retrieves a paginated list of all payment methods.

**Authentication Required:** Yes (JWT)

**Query Parameters:**
- `skip` (optional): Number of items to skip (default: 0)
- `take` (optional): Number of items to take (default: 10)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "data": [
    {
      "payment_method_id": "uuid",
      "artist_id": "uuid",
      "type": "card | paypal",
      "external_id": "string",
      "display_name": "string",
      "is_default": boolean,
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ],
  "count": number,
  "total": number
}
```

### Get Payment Methods by Artist

**Endpoint:** `GET /payment-methods/artist/:artistId`

**Description:** Retrieves a paginated list of payment methods by artist ID.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `artistId`: Artist's User ID (UUID)

**Query Parameters:**
- `skip` (optional): Number of items to skip (default: 0)
- `take` (optional): Number of items to take (default: 10)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "data": [
    {
      "payment_method_id": "uuid",
      "artist_id": "uuid",
      "type": "card | paypal",
      "external_id": "string",
      "display_name": "string",
      "is_default": boolean,
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ],
  "count": number,
  "total": number
}
```

### Get Payment Method by ID

**Endpoint:** `GET /payment-methods/:id`

**Description:** Retrieves a specific payment method by ID.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: Payment Method ID (UUID)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "payment_method_id": "uuid",
  "artist_id": "uuid",
  "type": "card | paypal",
  "external_id": "string",
  "display_name": "string",
  "is_default": boolean,
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Create Payment Method

**Endpoint:** `POST /payment-methods`

**Description:** Creates a new payment method.

**Authentication Required:** Yes (JWT)

**Request Body:**
```json
{
  "artist_id": "uuid",
  "type": "card | paypal",
  "external_id": "string",
  "display_name": "string",
  "is_default": boolean
}
```

**Response:**
- **Status Code:** 201 (Created)
- **Body:**
```json
{
  "payment_method_id": "uuid",
  "artist_id": "uuid",
  "type": "card | paypal",
  "external_id": "string",
  "display_name": "string",
  "is_default": boolean,
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Update Payment Method

**Endpoint:** `PUT /payment-methods/:id`

**Description:** Updates a payment method's information.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: Payment Method ID (UUID)

**Request Body:**
```json
{
  "display_name": "string", // Optional
  "is_default": boolean // Optional
}
```

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "payment_method_id": "uuid",
  "artist_id": "uuid",
  "type": "card | paypal",
  "external_id": "string",
  "display_name": "string",
  "is_default": boolean,
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Delete Payment Method

**Endpoint:** `DELETE /payment-methods/:id`

**Description:** Deletes a payment method.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: Payment Method ID (UUID)

**Response:**
- **Status Code:** 200 (OK)
- **Body:** No body

---

## Transactions

### Get All Transactions

**Endpoint:** `GET /transactions`

**Description:** Retrieves a paginated list of all transactions.

**Authentication Required:** Yes (JWT)

**Query Parameters:**
- `skip` (optional): Number of items to skip (default: 0)
- `take` (optional): Number of items to take (default: 10)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "data": [
    {
      "transaction_id": "uuid",
      "artist_id": "uuid",
      "submission_id": "uuid",
      "payment_method_id": "uuid",
      "external_transaction_id": "string",
      "amount": number,
      "currency": "string",
      "status": "pending | processing | succeeded | failed",
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ],
  "count": number,
  "total": number
}
```

### Get Transactions by Artist

**Endpoint:** `GET /transactions/artist/:artistId`

**Description:** Retrieves a paginated list of transactions by artist ID.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `artistId`: Artist's User ID (UUID)

**Query Parameters:**
- `skip` (optional): Number of items to skip (default: 0)
- `take` (optional): Number of items to take (default: 10)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "data": [
    {
      "transaction_id": "uuid",
      "artist_id": "uuid",
      "submission_id": "uuid",
      "payment_method_id": "uuid",
      "external_transaction_id": "string",
      "amount": number,
      "currency": "string",
      "status": "pending | processing | succeeded | failed",
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ],
  "count": number,
  "total": number
}
```

### Get Transaction by ID

**Endpoint:** `GET /transactions/:id`

**Description:** Retrieves a specific transaction by ID.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: Transaction ID (UUID)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "transaction_id": "uuid",
  "artist_id": "uuid",
  "submission_id": "uuid",
  "payment_method_id": "uuid",
  "external_transaction_id": "string",
  "amount": number,
  "currency": "string",
  "status": "pending | processing | succeeded | failed",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Create Transaction

**Endpoint:** `POST /transactions`

**Description:** Creates a new transaction.

**Authentication Required:** Yes (JWT)

**Request Body:**
```json
{
  "artist_id": "uuid",
  "submission_id": "uuid",
  "payment_method_id": "uuid",
  "external_transaction_id": "string",
  "amount": number,
  "currency": "string"
}
```

**Response:**
- **Status Code:** 201 (Created)
- **Body:**
```json
{
  "transaction_id": "uuid",
  "artist_id": "uuid",
  "submission_id": "uuid",
  "payment_method_id": "uuid",
  "external_transaction_id": "string",
  "amount": number,
  "currency": "string",
  "status": "pending",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Update Transaction

**Endpoint:** `PUT /transactions/:id`

**Description:** Updates a transaction's information.

**Authentication Required:** Yes (JWT)

**Path Parameters:**
- `id`: Transaction ID (UUID)

**Request Body:**
```json
{
  "external_transaction_id": "string", // Optional
  "status": "pending | processing | succeeded | failed" // Optional
}
```

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "transaction_id": "uuid",
  "artist_id": "uuid",
  "submission_id": "uuid",
  "payment_method_id": "uuid",
  "external_transaction_id": "string",
  "amount": number,
  "currency": "string",
  "status": "pending | processing | succeeded | failed",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

---

## Admin Actions

### Get All Admin Actions

**Endpoint:** `GET /admin-actions`

**Description:** Retrieves a paginated list of all admin actions.

**Authentication Required:** Yes (JWT, Admin role)

**Query Parameters:**
- `skip` (optional): Number of items to skip (default: 0)
- `take` (optional): Number of items to take (default: 10)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "data": [
    {
      "admin_action_id": "uuid",
      "admin_id": "uuid",
      "target_id": "uuid",
      "action": "string",
      "details": "string",
      "created_at": "timestamp"
    }
  ],
  "count": number,
  "total": number
}
```

### Get Admin Actions by Admin

**Endpoint:** `GET /admin-actions/admin/:adminId`

**Description:** Retrieves a paginated list of admin actions by admin ID.

**Authentication Required:** Yes (JWT, Admin role)

**Path Parameters:**
- `adminId`: Admin's User ID (UUID)

**Query Parameters:**
- `skip` (optional): Number of items to skip (default: 0)
- `take` (optional): Number of items to take (default: 10)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "data": [
    {
      "admin_action_id": "uuid",
      "admin_id": "uuid",
      "target_id": "uuid",
      "action": "string",
      "details": "string",
      "created_at": "timestamp"
    }
  ],
  "count": number,
  "total": number
}
```

### Get Admin Actions by Target

**Endpoint:** `GET /admin-actions/target/:targetId`

**Description:** Retrieves a paginated list of admin actions by target ID.

**Authentication Required:** Yes (JWT, Admin role)

**Path Parameters:**
- `targetId`: Target User ID (UUID)

**Query Parameters:**
- `skip` (optional): Number of items to skip (default: 0)
- `take` (optional): Number of items to take (default: 10)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "data": [
    {
      "admin_action_id": "uuid",
      "admin_id": "uuid",
      "target_id": "uuid",
      "action": "string",
      "details": "string",
      "created_at": "timestamp"
    }
  ],
  "count": number,
  "total": number
}
```

### Get Admin Action by ID

**Endpoint:** `GET /admin-actions/:id`

**Description:** Retrieves a specific admin action by ID.

**Authentication Required:** Yes (JWT, Admin role)

**Path Parameters:**
- `id`: Admin Action ID (UUID)

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "admin_action_id": "uuid",
  "admin_id": "uuid",
  "target_id": "uuid",
  "action": "string",
  "details": "string",
  "created_at": "timestamp"
}
```

### Create Admin Action

**Endpoint:** `POST /admin-actions`

**Description:** Creates a new admin action.

**Authentication Required:** Yes (JWT, Admin role)

**Request Body:**
```json
{
  "admin_id": "uuid",
  "target_id": "uuid",
  "action": "string",
  "details": "string"
}
```

**Response:**
- **Status Code:** 201 (Created)
- **Body:**
```json
{
  "admin_action_id": "uuid",
  "admin_id": "uuid",
  "target_id": "uuid",
  "action": "string",
  "details": "string",
  "created_at": "timestamp"
}
```

---

## Health Check

### Get API Health

**Endpoint:** `GET /health`

**Description:** Checks if the API is up and running.

**Authentication Required:** No

**Response:**
- **Status Code:** 200 (OK)
- **Body:**
```json
{
  "status": "ok",
  "timestamp": "timestamp"
}
```

---

## Response Status Codes

- **200 OK**: Request succeeded
- **201 Created**: Resource was successfully created
- **400 Bad Request**: Invalid request format or data
- **401 Unauthorized**: Missing or invalid authentication
- **403 Forbidden**: User doesn't have permission
- **404 Not Found**: Resource not found
- **422 Unprocessable Entity**: Validation error
- **500 Internal Server Error**: Server error

---

## Authentication

All protected endpoints require a JWT token to be included in the Authorization header:

```
Authorization: Bearer <token>
```

To get a token, use the `/auth/login` endpoint.

---

## Rate Limiting

The API currently does not implement rate limiting.

---

## Pagination

Most list endpoints support pagination through `skip` and `take` query parameters. Responses include:

- `data`: Array of items
- `count`: Number of items returned
- `total`: Total number of items available

Example:
```
GET /users?skip=10&take=5
```

This will return users 11-15 in the collection.
