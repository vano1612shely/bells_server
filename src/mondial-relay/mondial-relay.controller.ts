// src/mondial-relay/mondial-relay.controller.ts
import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { MondialRelayService } from './mondial-relay.service';
import { FindPointsDto } from './dto/find-points.dto';
import { Public } from '../auth/guards/public.decorator';

@Controller('mondial-relay')
export class MondialRelayController {
  constructor(private readonly mondialRelayService: MondialRelayService) {}

  @Public()
  @Get('points')
  async getPickupPoints(@Query() query: FindPointsDto) {
    const { postalCode, address, country } = query;
    if (!postalCode && !address) {
      throw new BadRequestException('postalCode or address is required');
    }
    return this.mondialRelayService.findPickupPoints({
      postalCode,
      address,
      country,
    });
  }
}
