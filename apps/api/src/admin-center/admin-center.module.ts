import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database/database.module'
import { AdminCenterController } from './admin-center.controller'
import { AdminCenterService } from './admin-center.service'
import { LocalOwnerAccessService } from './local-owner-access.service'

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [AdminCenterController],
  providers: [AdminCenterService, LocalOwnerAccessService],
  exports: [AdminCenterService, LocalOwnerAccessService],
})
export class AdminCenterModule {}
