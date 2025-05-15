import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello, User! If you\'re seeing this, change the link to include /api. This\'ll lead you to the actual documentation!';
  }
}
