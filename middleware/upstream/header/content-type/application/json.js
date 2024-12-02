/**
 * Does not validate headers, just assumes that the body is a JSON string
 * 
 * @memberof @superhero/http-server:middleware/upstream/header/content-type/application
 */
export default new class ContentTypeApplicationJsonHeaderUpstreamMiddleware
{
  async dispatch(request, session)
  {
    const body = await request.body

    if(body)
    {
      try
      {
        request.body = JSON.parse(body)
      }
      catch(reason)
      {
        const error   = new Error('The body is not a valid JSON string')
        error.code    = 'E_HTTP_SERVER_MIDDLEWARE_CONTENT_TYPE_APPLICATION_JSON_INVALID_BODY'
        error.status  = 400
        error.cause   = 'The buffered body could not be parsed as a JSON string'

        session.abortion.abort(error)
      }
    }
  }
}