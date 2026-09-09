import { HttpService } from '@nestjs/axios/dist';
import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class HttpCustomService {
  constructor(private readonly httpService: HttpService) { }

  public async apiGetAll(url: string): Promise<any> {
    try {
      const response = await firstValueFrom(this.httpService.get(url));
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException('Error al obtener los datos');
    }
  }

  public async apiCheckTokenGoogle(url: string): Promise<any> {
    try {
      const response = await firstValueFrom(this.httpService.get(url));
      return response.data;
    } catch (error) {
      throw new UnauthorizedException('Error al obtener los datos del accessToken');
    }
  }
}
