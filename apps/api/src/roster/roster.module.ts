import { Module } from '@nestjs/common'

import { DatabaseModule } from '../database/database.module'
import { AuthModule } from '../auth/auth.module'
import { RosterWorkflowController } from './roster-workflow.controller'
import { RosterWorkflowService } from './roster-workflow.service'
import { RosterController } from './roster.controller'
import { RosterService } from './roster.service'

@Module({
  controllers: [RosterController, RosterWorkflowController],
  imports: [DatabaseModule, AuthModule],
  providers: [RosterService, RosterWorkflowService],
})
export class RosterModule {}
