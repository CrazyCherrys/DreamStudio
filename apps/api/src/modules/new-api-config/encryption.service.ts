import { Injectable } from '@nestjs/common';

import { DreamStudioSecretCodec } from '@dreamstudio/storage';

@Injectable()
export class EncryptionService extends DreamStudioSecretCodec {}
