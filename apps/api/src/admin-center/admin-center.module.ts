import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DatabaseModule } from '../database/database.module'
import { AdminCenterController } from './admin-center.controller'
import { AdminCenterService } from './admin-center.service'

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [AdminCenterController],
  providers: [AdminCenterService],
  exports: [AdminCenterService],
})
export class AdminCenterModule {}
