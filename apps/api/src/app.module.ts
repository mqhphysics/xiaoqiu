import { Module } from '@nestjs/common'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { DatabaseModule } from './database/database.module'

@Module({
  controllers: [AppController],
  imports: [DatabaseModule],
  providers: [AppService],
})
export class AppModule {}
