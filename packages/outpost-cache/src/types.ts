export type CacheCompartmentOptions = {
  defaultTtlMs?: number;
};

export interface CacheCompartment {
  get<T>(key: string): Promise<T | undefined>;

  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;

  delete(key: string): Promise<void>;
}

export interface Cache {
  compartment(id: string, options?: CacheCompartmentOptions): CacheCompartment;
}
