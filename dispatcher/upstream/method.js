export default new class MethodUpstreamDispatcher
{
  #listFormat = new Intl.ListFormat('en', { style:'long', type:'disjunction' })

  dispatch(request, session)
  {
    const 
      method      = request.method.toLowerCase(),
      dispatcher  = session.route['method.' + method] || session.route['method.*']

    if(dispatcher)
    {
      const
        dispatchers = Array.isArray(dispatcher) ? dispatcher : [dispatcher],
        uniqueList  = dispatchers.filter((item) => false === session.chain.dispatchers.includes(item))

      // insert the forward routed dispatcher(s) after the current dispatcher in the chain
      // for the dispatcher chain iterator to dispatch it/them next
      session.chain.dispatchers.splice(session.chain.index, 0, ...uniqueList)
      return
    }

    const
      supports = Object.keys(session.route).filter((key) => key.startsWith('method.')),
      allowed  = supports.map((supported) => supported.replace('method.', '').toUpperCase()).sort(),
      error    = new Error(`The requested resource "${request.url}" does not support method "${request.method}"`)

    error.code    = 'E_HTTP_SERVER_METHOD_NO_ROUTE'
    error.status  = 405
    error.headers = { allow:allowed.join(',') }
    error.cause   = `Supported methods are: ${this.#listFormat.format(allowed) || 'none are defined'}`

    session.abortion.abort(error)
  }
}