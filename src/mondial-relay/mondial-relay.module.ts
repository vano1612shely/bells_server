import { Module } from '@nestjs/common';
import { MondialRelayService } from './mondial-relay.service';
import { MondialRelayController } from './mondial-relay.controller';

@Module({
  controllers: [MondialRelayController],
  providers: [MondialRelayService],
  exports: [MondialRelayService],
})
export class MondialRelayModule {}
