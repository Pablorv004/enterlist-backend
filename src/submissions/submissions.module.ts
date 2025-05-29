import { Module } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { SubmissionsController } from './submissions.controller';
import { EmailModule } from '../email/email.module';

@Module({
    imports: [EmailModule],
    controllers: [SubmissionsController],
    providers: [SubmissionsService],
    exports: [SubmissionsService],
})
export class SubmissionsModule { }
