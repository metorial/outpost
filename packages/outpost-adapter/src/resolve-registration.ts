import type {
  OutpostAdapter,
  OutpostAdapterConstructor,
  OutpostAdapterContext,
  OutpostAdapterFactory,
  OutpostAdapterRegistration
} from './types';

let isAdapterConstructor = (value: unknown): value is OutpostAdapterConstructor<any> =>
  typeof value == 'function' && /^\s*class[\s{]/.test(Function.prototype.toString.call(value));

export let resolveAdapterRegistration = async (
  registration: OutpostAdapterRegistration,
  context: OutpostAdapterContext
): Promise<OutpostAdapter> => {
  if (Array.isArray(registration)) {
    let [Ctor, config] = registration;
    return new Ctor(context, config);
  }

  if (isAdapterConstructor(registration)) {
    return new (registration as OutpostAdapterConstructor<undefined>)(context, undefined);
  }

  return (registration as OutpostAdapterFactory)(context);
};
