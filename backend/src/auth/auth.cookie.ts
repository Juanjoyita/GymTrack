export const COOKIE = 'gt_sesion';
export const COOKIE_SEGURA = Object.freeze({ httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/' });
export interface RespuestaCookie {
  cookie(name: string, value: string, options: typeof COOKIE_SEGURA & { maxAge: number }): unknown;
  clearCookie(name: string, options: typeof COOKIE_SEGURA): unknown;
}
