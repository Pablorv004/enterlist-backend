import { SetMetadata } from '@nestjs/common';

export const SkipEmailConfirmation = () => SetMetadata('skipEmailConfirmation', true);
