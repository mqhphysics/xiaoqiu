import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { MessagingService } from './messaging.service'
import { SocialController } from './social.controller'
import { SocialService } from './social.service'

@Module({
  controllers: [SocialController],
  exports: [SocialService],
  imports: [AuthModule],
  providers: [MessagingService, SocialService],
})
export class SocialModule {}
