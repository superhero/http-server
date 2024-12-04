/**
 * @memberof @superhero/http-server:middleware/upstream/header
 */
export default new class AcceptHeaderUpstreamMiddleware
{
  #listFormat = new Intl.ListFormat('en', { style:'long', type:'disjunction' })
  #normalize  = (route) => route.replace('accept.', '').trim()

  dispatch(request, session)
  {
    const
      splitHeader = request.headers['accept']?.toLowerCase().split(',') || [],
      accepts     = splitHeader.map(this.#normalize),
      routes      = Object.keys(session.route).filter((key) => key.startsWith('accept.') && session.route[key]),
      supports    = routes.map((route) => [this.#normalize(route), route])

    for(let accepted of accepts)
    {
      accepted = accepted.split(';')[0].split('*')[0]

      for(let [supported, route] in supports)
      {
        supported = supported.split('*')[0]

        if(supported.startsWith(accepted)
        || accepted.startsWith(supported))
        {
          const
            dispatcher  = session.route[route],
            dispatchers = Array.isArray(dispatcher) ? dispatcher : [dispatcher],
            uniqueList  = dispatchers.filter((item) => false === session.chain.dispatchers.includes(item))

          // insert the forward routed dispatcher(s) after the current dispatcher in the chain 
          // for the dispatcher chain iterator to dispatch it/them next
          session.chain.dispatchers.splice(session.chain.index, 0, ...uniqueList)
          return
        }
      }
    }
    
    const
      allowed = supports.map(([ supported ]) => supported),
      error   = new Error(`The requested resource "${request.method} ${request.url}" can not be delivered in requested header accept media types: ${this.#listFormat.format(accepts) || 'none are defined'}`)

    error.code    = 'E_HTTP_SERVER_MIDDLEWARE_ACCEPT_HEADER_NO_MATCHING_DISPATCHER'
    error.status  = 406
    error.headers = { accept:allowed.join(',') }
    error.cause   = `Supported accept header media types are: ${this.#listFormat.format(allowed) || 'none are defined'}`

    session.abortion.abort(error)
  }
}