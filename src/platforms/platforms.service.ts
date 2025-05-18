import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlatformDto, UpdatePlatformDto } from './dto/platform.dto';

@Injectable()
export class PlatformsService {
    constructor(private readonly prismaService: PrismaService) { }

    async findAll() {
        const data = await this.prismaService.platform.findMany();
        const total = data.length;
        return { data, total };
    }

    async findOne(id: number) {
        const platform = await this.prismaService.platform.findUnique({
            where: { platform_id: id },
        });

        if (!platform) {
            throw new NotFoundException(`Platform with ID ${id} not found`);
        }

        return platform;
    }

    async create(createPlatformDto: CreatePlatformDto) {
        const { name } = createPlatformDto;

        const existingPlatform = await this.prismaService.platform.findFirst({
            where: { name },
        });

        if (existingPlatform) {
            throw new ConflictException(`Platform with name ${name} already exists`);
        }

        return this.prismaService.platform.create({
            data: { name },
        });
    }

    async update(id: number, updatePlatformDto: UpdatePlatformDto) {
        await this.findOne(id);

        if (updatePlatformDto.name) {
            const existingPlatform = await this.prismaService.platform.findFirst({
                where: {
                    name: updatePlatformDto.name,
                    NOT: { platform_id: id },
                },
            });

            if (existingPlatform) {
                throw new ConflictException(`Platform with name ${updatePlatformDto.name} already exists`);
            }
        }

        return this.prismaService.platform.update({
            where: { platform_id: id },
            data: updatePlatformDto,
        });
    }

    async remove(id: number) {
        await this.findOne(id);

        const linkedResources = await this.prismaService.$transaction([
            this.prismaService.linkedAccount.findFirst({ where: { platform_id: id } }),
            this.prismaService.playlist.findFirst({ where: { platform_id: id } }),
            this.prismaService.song.findFirst({ where: { platform_id: id } }),
        ]);

        if (linkedResources.some(resource => resource !== null)) {
            throw new ConflictException(
                `Cannot delete platform with ID ${id} as it is referenced by other resources`
            );
        }

        return this.prismaService.platform.delete({
            where: { platform_id: id },
        });
    }
}
