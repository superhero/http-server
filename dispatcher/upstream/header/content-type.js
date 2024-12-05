/**
 * @memberof @superhero/http-server:dispatcher/upstream/header
 */
export default new class ContentTypeHeaderUpstreamDispatcher
{
  #listFormat = new Intl.ListFormat('en', { style:'long', type:'disjunction' })

  dispatch(request, session)
  {
    if(false === !!request.headers['content-type'])
    {
      const error   = new Error(`The requested resource "${request.method} ${request.url}" requires a content-type header`)
      error.code    = 'E_HTTP_SERVER_CONTENT_TYPE_HEADER_MISSING'
      error.status  = 415
      error.cause   = `The requested resource requires a content-type header to be set`
      return session.abortion.abort(error)
    }

    const
      contentType = request.headers['content-type'].toLowerCase().split(';')[0].split('*')[0].trim(),
      routes      = Object.keys(session.route).filter((key) => key.startsWith('content-type.') && session.route[key]),
      supports    = routes.map((route) => [ route.replace('content-type.', '').trim(), route ])

    for(let [ supported, route ] of supports)
    {
      supported = supported.split('*')[0]

      if(supported.startsWith(contentType)
      || contentType.startsWith(supported))
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

    const
      allowed = supports.map(([ supported ]) => supported),
      error   = new Error(`The requested resource "${request.method} ${request.url}" does not support content-type "${request.headers['content-type']}"`)

    error.code    = 'E_HTTP_SERVER_CONTENT_TYPE_HEADER_NO_ROUTE'
    error.status  = 415
    error.headers = { accept:allowed.join(',') }
    error.cause   = `Supported content-type headers are: ${this.#listFormat.format(allowed) || 'none are defined'}`

    session.abortion.abort(error)
  }
}