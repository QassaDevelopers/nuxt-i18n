import './middleware'
import Vue from 'vue'
import {
  defaultLocale,
  defaultLocaleRouteNameSuffix,
  LOCALE_CODE_KEY,
  LOCALE_DOMAIN_KEY,
  MODULE_NAME,
  routesNameSeparator,
  STRATEGIES,
  strategy,
  vuex
} from './options'

function localePathFactory (i18nPath, routerPath) {
  return function localePath (route, locale) {
    // Abort if no route or no locale
    if (!route) return

    const i18n = this[i18nPath]

    if (strategy === STRATEGIES.NO_PREFIX && locale && locale !== i18n.locale) {
      // eslint-disable-next-line no-console
      console.warn(`[${MODULE_NAME}] Passing non-current locale to localePath is unsupported when using no_prefix strategy`)
    }

    locale = locale || i18n.locale

    if (!locale) return

    // If route parameters is a string, use it as the route's name
    if (typeof route === 'string') {
      route = { name: route }
    }

    const localizedRoute = Object.assign({}, route)

    if (route.path && !route.name) {
      // if route has a path defined but no name, resolve full route using the path
      const isPrefixed = (
        // don't prefix default locale
        !(locale === defaultLocale && strategy === STRATEGIES.PREFIX_EXCEPT_DEFAULT) &&
        // no prefix for any language
        !(strategy === STRATEGIES.NO_PREFIX) &&
        // no prefix for different domains
        !i18n.differentDomains
      )

      const path = (isPrefixed ? `/${locale}${route.path}` : route.path)

      localizedRoute.path = path
    } else {
      // otherwise resolve route via the route name
      // Build localized route options
      let name = route.name + (strategy === STRATEGIES.NO_PREFIX ? '' : routesNameSeparator + locale)

      // Match route without prefix for default locale
      if (locale === defaultLocale && strategy === STRATEGIES.PREFIX_AND_DEFAULT) {
        name += routesNameSeparator + defaultLocaleRouteNameSuffix
      }

      localizedRoute.name = name

      const { params } = localizedRoute
      if (params && params['0'] === undefined && params.pathMatch) {
        params['0'] = params.pathMatch
      }
    }

    // Resolve localized route
    const router = this[routerPath]
    const { route: { fullPath } } = router.resolve(localizedRoute)
    return fullPath
  }
}

function localeRegionPathFactory (i18nPath, routerPath, storePath) {
  return function localeRegionPath (route, locale) {
    const store = this[storePath]
    const router = this[routerPath]

    // Abort if no route or no locale
    if (!route) return
    locale = locale || this[i18nPath].locale
    if (!locale) return

    // If route parameters is a string, use it as the route's name
    if (typeof route === 'string') {
      route = { name: route }
    }

    if (!route.params) route.params = {}

    // Set the region to the preferred region if user is logged in
    if (store.state.auth.user && store.state.auth.user.preferredRegion) {
      route.params.region = store.state.auth.user.preferredRegion
    } else if(!route.params.region) {
      // TODO hacky, fix this
      let currentPath = router.history.current.path
      let region = ''

      let matches = currentPath.match(/([a-zA-Z]{2})-([a-zA-Z]{2})/)
      if (matches) {
        // found something like LANGUAGE-REGION (e.g. 'nl-nl', 'en-us', etc)
        // Only use the last part
        region = matches[2]
      }
      route.params.region = region
    }

    // Build localized route options
    const routesNameSeparator = '<%= options.routesNameSeparator %>'
    const name = route.name + routesNameSeparator + locale
    const localizedRoute = Object.assign({}, route, { name })

    // Resolve localized route
    const resolved = router.resolve(localizedRoute)
    let { href } = resolved

    // Remove baseUrl from href (will be added back by nuxt-link)
    if (router.options.base) {
      const regexp = new RegExp(router.options.base)
      href = href.replace(regexp, '/')
    }

    return href
  }
}

function switchLocalePathFactory (i18nPath) {
  return function switchLocalePath (locale) {
    if (strategy === STRATEGIES.NO_PREFIX && locale && locale !== this[i18nPath].locale) {
      // eslint-disable-next-line no-console
      console.warn(`[${MODULE_NAME}] Passing non-current locale to switchLocalePath is unsupported when using no_prefix strategy`)
    }

    const name = this.getRouteBaseName()
    if (!name) {
      return ''
    }

    const { params, ...routeCopy } = this.$route
    let langSwitchParams = {}
    if (vuex && this.$store) {
      langSwitchParams = this.$store.getters[`${vuex.moduleName}/localeRouteParams`](locale)
    }
    const baseRoute = Object.assign({}, routeCopy, {
      name,
      params: {
        ...params,
        ...langSwitchParams,
        0: params.pathMatch
      }
    })
    let path = this.localePath(baseRoute, locale)

    // Handle different domains
    if (this[i18nPath].differentDomains) {
      const lang = this[i18nPath].locales.find(l => l[LOCALE_CODE_KEY] === locale)
      if (lang && lang[LOCALE_DOMAIN_KEY]) {
        let protocol
        if (process.server) {
          const isHTTPS = require('is-https')
          const { req } = this.$options._parentVnode.ssrContext
          protocol = isHTTPS(req) ? 'https' : 'http'
        } else {
          protocol = window.location.protocol.split(':')[0]
        }
        path = protocol + '://' + lang[LOCALE_DOMAIN_KEY] + path
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[${MODULE_NAME}] Could not find domain name for locale ${locale}`)
      }
    }
    return path
  }
}

function getRouteBaseNameFactory (contextRoute) {
  function givenOrCurrent (route) {
    return route || this.$route
  }

  const routeGetter = contextRoute ? route => route || contextRoute : givenOrCurrent

  return function getRouteBaseName (route) {
    route = routeGetter.call(this, route)
    if (!route.name) {
      return null
    }
    return route.name.split(routesNameSeparator)[0]
  }
}

const plugin = {
  install (Vue) {
    Vue.mixin({
      methods: {
        localePath: localePathFactory('$i18n', '$router'),
        localeRegionPath: localeRegionPathFactory('$i18n', '$router', '$store'),
        switchLocalePath: switchLocalePathFactory('$i18n'),
        getRouteBaseName: getRouteBaseNameFactory()
      }
    })
  }
}

export default ({ app, route }) => {
  Vue.use(plugin)
  app.localePath = localePathFactory('i18n', 'router')
  app.localeRegionPath = localeRegionPathFactory('i18n', 'router', 'store')
  app.switchLocalePath = switchLocalePathFactory('i18n'),
  app.getRouteBaseName = getRouteBaseNameFactory(route)
}
