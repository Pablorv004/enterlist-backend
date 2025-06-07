import { SetMetadata } from '@nestjs/common';
import { OwnershipConfig } from '../guards/ownership.guard';

export const Ownership = (config: OwnershipConfig) =>
  SetMetadata('ownership', config);
