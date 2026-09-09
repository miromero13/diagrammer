import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHealth() {
    return {
      status: 'OK',
      message: 'Diagramador Backend is running',
      timestamp: new Date().toISOString(),
    };
  }
}
