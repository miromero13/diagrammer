import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    idUser: string;
    roleUser: string;
  }
}
