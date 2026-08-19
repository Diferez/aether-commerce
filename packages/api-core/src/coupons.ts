export type CouponRecord = Record<string, unknown>;

export type CreateCouponInput = {
  code: string;
  type: string;
  value: number;
};

export interface CouponRepository {
  list(): Promise<CouponRecord[]>;
  upsert(input: CreateCouponInput & { code: string }): Promise<void>;
  deactivate(code: string): Promise<void>;
}

/** Provider-neutral coupon administration rules. Permission enforcement stays in the app adapter. */
export class CouponService {
  constructor(private readonly repository: CouponRepository) {}

  list(): Promise<CouponRecord[]> {
    return this.repository.list();
  }

  async create(input: CreateCouponInput): Promise<{ code: string }> {
    const code = input.code.trim().toUpperCase();
    await this.repository.upsert({ ...input, code });
    return { code };
  }

  async deactivate(code: string): Promise<void> {
    const normalizedCode = code.trim().toUpperCase();
    await this.repository.deactivate(normalizedCode);
  }
}
