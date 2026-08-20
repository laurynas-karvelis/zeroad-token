import { CLIENT_HEADER, type FEATURE, SERVER_HEADER } from "./constants"
import { type ClientHeaderValue, parseClientToken } from "./headers/client"
import { type CacheConfig, configureCaching } from "./headers/client/cache"
import { encodeServerHeader } from "./headers/server"

export type SiteOptions = {
  clientId: string
  features: FEATURE[]
  // Partial, mirroring `configureCaching()` - and global: caching is a module-level singleton, so the
  // last `Site()` constructed in a process decides the configuration for every site in it
  cacheConfig?: Partial<CacheConfig>
}

export function Site(options: SiteOptions) {
  const serverHeaderValue = encodeServerHeader(options.clientId, options.features)

  if (options.cacheConfig) {
    configureCaching(options.cacheConfig)
  }

  return {
    parseClientToken: (headerValue: ClientHeaderValue) =>
      parseClientToken(headerValue, {
        clientId: options.clientId,
        features: options.features,
      }),
    CLIENT_HEADER_NAME: CLIENT_HEADER.HELLO.toLowerCase(),
    SERVER_HEADER_NAME: SERVER_HEADER.WELCOME,
    SERVER_HEADER_VALUE: serverHeaderValue,
  }
}
