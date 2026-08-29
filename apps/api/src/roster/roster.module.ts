import { Module } from '@nestjs/common'

import { DatabaseModule } from '../database/database.module'
import { RosterController } from './roster.controller'
import { RosterService } from './roster.service'

@Module({
  controllers: [RosterController],
  imports: [DatabaseModule],
  providers: [RosterService],
})
export class RosterModule {}
