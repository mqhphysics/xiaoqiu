import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'

import { DatabaseModule } from '../database/database.module'
import { AccessPolicyService } from './access-policy.service'
import { AuthContextGuard } from './auth-context.guard'
import { AdminIdentityController } from './admin-identity.controller'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, AdminIdentityController],
  exports: [AuthService, AccessPolicyService],
  providers: [AuthService, AccessPolicyService, { provide: APP_GUARD, useClass: AuthContextGuard }],
})
export class AuthModule {}
