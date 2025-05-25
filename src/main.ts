import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  
  // Configure CORS with specific options for security
  app.enableCors({
    origin: [
      process.env.FRONTEND_URL, 'http://localhost:5173', 
      'https://accounts.spotify.com',
      'https://api.spotify.com',
      'https://accounts.google.com',
      'https://oauth2.googleapis.com',
      'https://www.googleapis.com'
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    exposedHeaders: ['Authorization']
  });
  
  app.useGlobalFilters(new GlobalExceptionFilter());
  
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  
  const config = new DocumentBuilder()
    .setTitle('Enterlist API')
    .setDescription('API for the Enterlist music submission platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
    
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  
  logger.log(`Application is running on: ${await app.getUrl()}`);
  logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.log(`Swagger documentation available at: ${await app.getUrl()}/api`);
}

bootstrap().catch((error) => {
  new Logger('Bootstrap').error('Failed to start application', error.stack);
});
