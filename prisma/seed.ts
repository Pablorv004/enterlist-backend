import { PrismaClient, user_role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting database seed...');    const platforms = [
        { name: 'Spotify' },
        { name: 'YouTube' },
    ];

    console.log('Creating platforms...');
    for (const platform of platforms) {
        await prisma.platform.upsert({
            where: { name: platform.name },
            update: {},
            create: platform,
        });
    }

    console.log('Creating admin user...');
    const adminPassword = 'Admin123.';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    await prisma.user.upsert({
        where: { email: 'admin@enterlist.com' },
        update: {},
        create: {
            user_id: uuidv4(),
            username: 'admin',
            email: 'admin@enterlist.com',
            password_hash: hashedPassword,
            role: user_role.admin,
            created_at: new Date(),
            updated_at: new Date(),
            is_active: true,
        },
    });

    console.log('Creating demo playlist maker...');
    const playlistMakerPassword = 'Playlist123.';
    const playlistMakerPasswordHash = await bcrypt.hash(playlistMakerPassword, 10);

    const playlistMaker = await prisma.user.upsert({
        where: { email: 'playlist@example.com' },
        update: {},
        create: {
            user_id: uuidv4(),
            username: 'playlist_maker',
            email: 'playlist@example.com',
            password_hash: playlistMakerPasswordHash,
            role: user_role.playlist_maker,
            created_at: new Date(),
            updated_at: new Date(),
            is_active: true,
        },
    });

    console.log('Creating demo artist...');
    const artistPassword = 'Artist123.';
    const artistPasswordHash = await bcrypt.hash(artistPassword, 10);

    const artist = await prisma.user.upsert({
        where: { email: 'artist@example.com' },
        update: {},
        create: {
            user_id: uuidv4(),
            username: 'demo_artist',
            email: 'artist@example.com',
            password_hash: artistPasswordHash,
            role: user_role.artist,
            created_at: new Date(),
            updated_at: new Date(),
            is_active: true,
        },
    });

    console.log('Creating sample playlist...');
    const spotifyPlatform = await prisma.platform.findFirst({
        where: { name: 'Spotify' },
    });
    if (spotifyPlatform && playlistMaker) {
        await prisma.playlist.upsert({
            where: {
                platform_id_platform_specific_id: {
                    platform_id: spotifyPlatform.platform_id,
                    platform_specific_id: '1234567890',
                },
            },
            update: {},
            create: {
                playlist_id: uuidv4(),
                creator_id: playlistMaker.user_id,
                platform_id: spotifyPlatform.platform_id,
                platform_specific_id: '1234567890',
                name: 'Indie Discoveries',
                description: 'The best new indie tracks each week',                genre: 'Indie',
                submission_fee: 5.99,
                is_visible: true,
                created_at: new Date(),
                updated_at: new Date(),
                url: 'https://open.spotify.com/playlist/sample',
                cover_image_url: 'https://i.scdn.co/image/sample',
            },
        });
    }

    console.log('Creating sample song...'); if (spotifyPlatform && artist) {
        await prisma.song.upsert({
            where: {
                platform_id_platform_specific_id: {
                    platform_id: spotifyPlatform.platform_id,
                    platform_specific_id: '9876543210',
                },
            },
            update: {},
            create: {
                song_id: uuidv4(),
                artist_id: artist.user_id,
                platform_id: spotifyPlatform.platform_id,
                platform_specific_id: '9876543210',
                title: 'Summer Dreams',
                artist_name_on_platform: 'Demo Artist',
                album_name: 'First Album',
                url: 'https://open.spotify.com/track/sample',
                cover_image_url: 'https://i.scdn.co/image/album_sample',
                duration_ms: 210000, // 3:30
                is_visible: true,
                created_at: new Date(),
                updated_at: new Date(),
            },
        });
    }

    console.log('Seeding completed!');
}

main()
    .catch((e) => {
        console.error('Error during seeding:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

