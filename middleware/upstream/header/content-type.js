/**
 * @memberof @superhero/http-server:middleware/upstream/header
 */
export default new class ContentTypeHeaderUpstreamMiddleware
{
  #listFormat = new Intl.ListFormat('en', { style:'long', type:'disjunction' })

  dispatch(request, session)
  {
    const
      contentType = request.headers['content-type']?.toLowerCase().split(';')[0].split('*')[0].trim(),
      routes      = Object.keys(session.route).filter((key) => key.startsWith('content-type.') && session.route[key]),
      supports    = routes.map((route) => [route.replace('content-type.', '').trim(), route])

    for(let [supported, route] in supports)
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

    error.code    = 'E_HTTP_SERVER_MIDDLEWARE_CONTENT_TYPE_NO_MATCHING_DISPATCHER'
    error.status  = 415
    error.headers = { accept:allowed.join(',') }
    error.cause   = `Supported content-type headers are: ${this.#listFormat.format(allowed) || 'none are defined'}`

    session.abortion.abort(error)
  }
}