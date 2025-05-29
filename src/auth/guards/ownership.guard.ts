import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { user_role } from '@prisma/client';

export interface OwnershipConfig {
    model: string;
    userField: string;
    paramName?: string;
}

@Injectable()
export class OwnershipGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private prismaService: PrismaService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const ownershipConfig = this.reflector.get<OwnershipConfig>('ownership', context.getHandler());

        if (!ownershipConfig) {
            return true; // No ownership requirements defined
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) {
            throw new ForbiddenException('User not authenticated');
        }

        // Admins can bypass ownership controls
        if (user.role === user_role.admin) {
            return true;
        }

        const { model, userField, paramName = 'id' } = ownershipConfig;
        const resourceId = request.params[paramName];

        if (!resourceId) {
            throw new ForbiddenException('Resource ID not provided');
        }        try {
            // For user-specific endpoints like /user/:userId
            if (paramName === 'userId' || paramName === 'artistId' || paramName === 'creatorId') {
                return resourceId === user.user_id;
            }

            // For playlist-specific endpoints, check if user owns the playlist
            if (paramName === 'playlistId') {
                const playlist = await this.prismaService.playlist.findUnique({
                    where: { playlist_id: resourceId },
                    select: { creator_id: true },
                });
                
                if (!playlist) {
                    throw new ForbiddenException('Playlist not found');
                }
                
                return playlist.creator_id === user.user_id;
            }            if (model === 'submission') {
                // For submissions, allow access if user is either the artist OR the playlist creator
                const submission = await this.prismaService.submission.findUnique({
                    where: { submission_id: resourceId },
                    include: { 
                        playlist: { select: { creator_id: true } }
                    },
                });

                if (!submission) {
                    throw new ForbiddenException('Submission not found');
                }

                // Allow access if user is the artist who submitted OR the playlist creator
                return submission.artist_id === user.user_id || submission.playlist.creator_id === user.user_id;
            }

            if (model === 'transaction') {
                // For transactions, check ownership through submission's artist_id
                const transaction = await this.prismaService.transaction.findUnique({
                    where: { transaction_id: resourceId },
                    include: { submission: true },
                });

                if (!transaction) {
                    throw new ForbiddenException('Transaction not found');
                }

                return transaction.submission.artist_id === user.user_id;
            }

            if (model === 'paymentMethod') {
                // For payment methods, use the correct table name
                const paymentMethod = await this.prismaService.paymentMethod.findUnique({
                    where: { payment_method_id: resourceId },
                    select: { [userField]: true },
                });

                if (!paymentMethod) {
                    throw new ForbiddenException('Payment method not found');
                }

                return paymentMethod[userField] === user.user_id;
            }

            const resource = await this.prismaService[model].findUnique({
                where: { [`${model}_id`]: resourceId },
                select: { [userField]: true },
            });

            if (!resource) {
                throw new ForbiddenException('Resource not found');
            }

            return resource[userField] === user.user_id;
        } catch (error) {
            console.error('Ownership check failed:', error);
            throw new ForbiddenException('Access denied');
        }
    }
}
