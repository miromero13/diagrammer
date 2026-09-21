import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { GenerateCodeDto } from './generate-code.dto';

describe('GenerateCodeDto', () => {
  it('requires authentication configuration', async () => {
    const errors = await validate(plainToInstance(GenerateCodeDto, { companyName: 'Acme', backendName: 'acme' }));

    expect(errors.find((error) => error.property === 'authentication')?.constraints).toHaveProperty('isDefined');
  });
});
