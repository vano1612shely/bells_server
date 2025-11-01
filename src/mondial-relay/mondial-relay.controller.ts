// src/mondial-relay/mondial-relay.controller.ts
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { MondialRelayService } from './mondial-relay.service';
import { Public } from '../auth/guards/public.decorator';

@Controller('mondial-relay')
export class MondialRelayController {
  constructor(private readonly mondialRelayService: MondialRelayService) {}

  @Public()
  @Get('points')
  async getPickupPoints(
    @Query('q') q?: string,
    @Query('country') country = 'FR',
  ) {
    if (!q) {
      throw new BadRequestException('Parameter "q" is required');
    }

    return this.mondialRelayService.findPickupPoints({ query: q, country });
  }
}
