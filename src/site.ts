import { CacheConfig, configureCaching } from "./headers/client/cache";
import { ClientHeaderValue, parseClientToken } from "./headers/client";
import { CLIENT_HEADER, FEATURE, SERVER_HEADER } from "./constants";
import { encodeServerHeader } from "./headers/server";

export type SiteOptions = {
  clientId: string;
  features: FEATURE[];
  cacheConfig?: CacheConfig;
};

export function Site(options: SiteOptions) {
  const serverHeaderValue = encodeServerHeader(options.clientId, options.features);

  if (options.cacheConfig) {
    configureCaching(options.cacheConfig);
  }

  return {
    parseClientToken: (headerValue: ClientHeaderValue) =>
      parseClientToken(headerValue, { clientId: options.clientId, features: options.features }),
    CLIENT_HEADER_NAME: CLIENT_HEADER.HELLO.toLowerCase(),
    SERVER_HEADER_NAME: SERVER_HEADER.WELCOME,
    SERVER_HEADER_VALUE: serverHeaderValue,
  };
}
