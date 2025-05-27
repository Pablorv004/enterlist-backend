# PayPal OAuth Authentication

This document provides information about the PayPal OAuth integration in Enterlist.

## Features

- One-click registration with PayPal
- Login with PayPal (for existing users)
- Link PayPal account to existing user account
- Access to PayPal user profile information
- Secure payment integration capabilities

## Endpoints

### Register or Login with PayPal

**Endpoint:** `GET /api/auth/paypal/register-or-login`

**Description:** Initiates the PayPal OAuth flow for user registration or login. If the user doesn't already have an account linked to their PayPal profile, a new account will be created. If they do have an account, they will be logged in.

**Authentication Required:** No

**Response:** Redirects to PayPal authorization page and then to dashboard after completion.

### Link PayPal Account to Existing User

**Endpoint:** `GET /api/auth/paypal/login`

**Description:** Initiates the PayPal OAuth flow to link a PayPal account to an existing Enterlist account.

**Authentication Required:** Yes (JWT)

**Response:** Redirects to PayPal authorization page and then to dashboard after completion.

### Callback URL

**Endpoint:** `GET /api/auth/paypal/callback`

**Description:** Handles the callback from PayPal OAuth. This endpoint processes the authorization code and creates/updates user accounts and linked accounts as needed.

**Authentication Required:** No (handled via OAuth flow)

## User Registration Process

When a user registers through PayPal:

1. The user clicks "Register with PayPal" button
2. They are redirected to PayPal's authorization page where they grant access
3. PayPal redirects back to our callback URL with an authorization code
4. Our system exchanges the code for access and refresh tokens
5. We fetch the user's PayPal profile information
6. If a user with that PayPal ID already exists, they are logged in
7. If not, a new user account is created with:
   - Username: Their PayPal display name (or a default if not available)
   - Email: Their PayPal email (or a generated one if not available)
   - Role: Artist (default)
   - A randomly generated password (they won't need to know this as they'll log in via PayPal)
8. The user's PayPal account is linked to their Enterlist account
9. A JWT token is generated and returned
10. The user is redirected to the dashboard

## Linking Process

When an existing user wants to link their PayPal account:

1. The user goes to their linked accounts page and clicks "Connect PayPal"
2. They are redirected to PayPal's authorization page
3. After granting access, PayPal redirects back to our callback
4. We create or update a linked account record for this user
5. The user is redirected back to their linked accounts page

## Security Features

- CSRF protection using state parameters
- Secure token storage and refresh
- Proper scope management for PayPal permissions
- Encrypted token storage in the database

## Configuration

The following environment variables need to be configured:

- `PAYPAL_CLIENT_ID`: PayPal application client ID
- `PAYPAL_CLIENT_SECRET`: PayPal application client secret
- `PAYPAL_MODE`: Either 'sandbox' or 'live'
- `PAYPAL_REDIRECT_URI`: OAuth callback URL (defaults to backend URL + /api/auth/paypal/callback)

## PayPal Scopes Used

- `openid`: Basic OpenID Connect access
- `profile`: Access to user profile information
- `email`: Access to user email address
- `https://uri.paypal.com/services/identity/activities`: Access to PayPal identity services

## Database Schema

The PayPal integration uses the existing `users` and `linked_accounts` tables:

### Users Table
- `oauth_provider`: Set to 'paypal' for PayPal OAuth users
- `oauth_id`: PayPal user ID

### Linked Accounts Table
- Links users to their PayPal accounts
- Stores access tokens and refresh tokens
- References the PayPal platform record

## Error Handling

The OAuth flow includes comprehensive error handling:
- Invalid state parameters
- Expired authorization codes
- PayPal API errors
- Network connectivity issues
- Missing required configuration

## Mobile Support

The PayPal OAuth flow supports both web and mobile platforms:
- Web users are redirected to appropriate frontend URLs
- Mobile users receive deep links with OAuth parameters
- Platform detection based on user agent and mobile query parameter
