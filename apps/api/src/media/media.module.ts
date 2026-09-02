import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { MediaController } from './media.controller'
import { MediaService } from './media.service'

@Module({
  controllers: [MediaController],
  imports: [AuthModule],
  providers: [MediaService],
})
export class MediaModule {}
