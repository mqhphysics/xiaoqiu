import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database/database.module'
import { AdminCenterController } from './admin-center.controller'
import { AdminCenterService } from './admin-center.service'
import { LocalOwnerAccessService } from './local-owner-access.service'
import { MediaModule } from '../media/media.module'
import { AdminGovernanceController } from './admin-governance.controller'
import { AdminPeopleService } from './admin-people.service'
import { AdminMediaService } from './admin-media.service'
import { AdminModerationService } from './admin-moderation.service'

@Module({
  imports: [AuthModule, DatabaseModule, MediaModule],
  controllers: [AdminCenterController, AdminGovernanceController],
  providers: [
    AdminCenterService,
    LocalOwnerAccessService,
    AdminPeopleService,
    AdminMediaService,
    AdminModerationService,
  ],
  exports: [AdminCenterService, LocalOwnerAccessService],
})
export class AdminCenterModule {}
