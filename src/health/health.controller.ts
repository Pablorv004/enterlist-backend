import { Controller, Get } from '@nestjs/common';

@Controller('api/health')
export class HealthController {
    @Get()
    healthCheck() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            service: 'enterlist-api',
        };
    }
}
