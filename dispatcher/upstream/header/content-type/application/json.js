/**
 * Does not validate headers, just assumes that the body is a JSON string
 */
export default new class ContentTypeApplicationJsonHeaderUpstreamDispatcher
{
  async dispatch(request, session)
  {
    const body = await request.body

    if(body)
    {
      try
      {
        request.body = JSON.parse(String(body) || '{}')
      }
      catch(reason)
      {
        const error   = new Error('The body is not a valid JSON string')
        error.code    = 'E_HTTP_SERVER_CONTENT_TYPE_HEADER_APPLICATION_JSON'
        error.status  = 400
        error.cause   = reason
        return session.abortion.abort(error)
      }
    }
  }
}