import 'server-only';
import { env } from '@/env';
import { criarClientePluggy, type ClientePluggy } from './http';

let instancia: ClientePluggy | undefined;

// um cliente por processo: a apiKey vive dentro dele e vale 2 h
export function pluggy(): ClientePluggy {
  instancia ??= criarClientePluggy({ clientId: env.PLUGGY_CLIENT_ID, clientSecret: env.PLUGGY_CLIENT_SECRET });
  return instancia;
}
