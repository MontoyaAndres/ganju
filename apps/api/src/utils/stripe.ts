import Stripe from 'stripe';
import { utils } from '@ganju/utils';

import type { EnvSource } from '@ganju/utils';

export const createStripe = (source: EnvSource): Stripe | null => {
  const secret = utils.getEnv(source, 'STRIPE_SECRET_KEY');
  if (!secret) return null;
  return new Stripe(secret, {
    httpClient: Stripe.createFetchHttpClient()
  });
};

export const stripeCryptoProvider = (): ReturnType<
  typeof Stripe.createSubtleCryptoProvider
> => Stripe.createSubtleCryptoProvider();

export type { Stripe };
