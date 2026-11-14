import { SetMetadata } from '@nestjs/common';

export const RUTA_PUBLICA = 'gymtrack:ruta-publica';
export const Publico = () => SetMetadata(RUTA_PUBLICA, true);
