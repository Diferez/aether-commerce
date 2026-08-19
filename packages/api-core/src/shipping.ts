export type ShippingSettings = Record<string, unknown>;

export interface ShippingSettingsRepository {
  read(): Promise<ShippingSettings | null>;
}

/** Resolves persisted shipping settings while letting each implementation own its fallback configuration. */
export class ShippingSettingsService {
  constructor(private readonly repository: ShippingSettingsRepository) {}

  async get(fallback: ShippingSettings): Promise<ShippingSettings> {
    return (await this.repository.read()) ?? fallback;
  }
}
