/**
 * Result type discriminated union — substitui todos os `{ error: string }` genéricos.
 * Garante que cada serviço tem erro tipado e não faz catch-all que esconde detalhes.
 */
export type Ok<T> = { ok: true; data: T };
export type Err<E extends string = string> = { ok: false; error: E };
export type Result<T, E extends string = string> = Ok<T> | Err<E>;

/** helpers para consumo conciso */
export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });
export const err = <E extends string = string>(error: E): Err<E> => ({ ok: false, error });
