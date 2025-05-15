import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello, User! If you\'re seeing this, change the link to include /api. This\'ll lead you to the actual documentation!"', () => {
      expect(appController.getHello()).toBe('Hello, User! If you\'re seeing this, change the link to include /api. This\'ll lead you to the actual documentation!');
    });
  });
});
