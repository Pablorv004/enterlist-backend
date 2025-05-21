# Enterlist Backend API

Enterlist is a platform that connects music artists with playlist curators. This repository contains the NestJS backend API for the Enterlist platform.

## Description

Enterlist allows artists from Spotify, SoundCloud, or YouTube to submit their songs to playlist makers. Playlist makers can review submissions and choose to accept or reject them. The platform facilitates these connections while providing an easy way for artists to get their music heard.

## Features

- User authentication and authorization (playlist makers, artists, admins)
- OAuth integration with music platforms (Spotify, SoundCloud, YouTube)
  - One-click registration and login with Spotify and YouTube
  - Automatic account linking with Spotify and YouTube
- Song submission workflow
- Payment processing for submissions
- Playlist management
- User profile management

## Technology Stack

- **Framework**: NestJS
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT, Passport.js
- **API Documentation**: Swagger

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/enterlist-backend.git

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env file with your database credentials and other settings
```

## Database Setup

```bash
# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Seed the database with initial data
npm run prisma:seed
```

## Running the Application

```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

## API Documentation

Once the application is running, you can access the Swagger API documentation at:

```
http://localhost:3000/api
```

For a detailed documentation of all endpoints, request/response formats, and examples, see the [API Documentation](./API-DOCUMENTATION.md) file.

## Default Users

After running the seed script, you can log in with the following credentials:

- **Admin**: admin@enterlist.com / Admin123.
- **Playlist Maker**: playlist@example.com / Playlist123.
- **Artist**: artist@example.com / Artist123.

## License

[MIT](LICENSE)