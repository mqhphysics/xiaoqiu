import { Module } from '@nestjs/common'

import { AdminIdentityController } from './admin-identity.controller'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'

@Module({
  controllers: [AuthController, AdminIdentityController],
  exports: [AuthService],
  providers: [AuthService],
})
export class AuthModule {}
